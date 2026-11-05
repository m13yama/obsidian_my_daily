interface Section {
  title: string;
  level: number;
  start: number;
  bodyStart: number;
  end: number;
}

interface Line {
  text: string;
  start: number;
  end: number;
}

// Work on offsets so text outside replaced sections stays byte-for-byte intact.
function sections(markdown: string): Section[] {
  const lines: Line[] = [];
  const pattern = /[^\r\n]*(?:\r\n|\n|\r|$)/g;
  for (const match of markdown.matchAll(pattern)) {
    if (!match[0]) break;
    lines.push({
      text: match[0].replace(/[\r\n]+$/, ""),
      start: match.index!,
      end: match.index! + match[0].length,
    });
  }

  const headings: Section[] = [];
  let frontmatter = false;
  let fence: { character: string; length: number } | null = null;
  let comment: "html" | "obsidian" | null = null;
  let paragraph: Line[] = [];

  for (const [index, line] of lines.entries()) {
    const text = line.text;
    if (index === 0 && /^\uFEFF?---\s*$/.test(text)) {
      frontmatter = true;
      continue;
    }
    if (frontmatter) {
      if (/^(---|\.\.\.)\s*$/.test(text)) frontmatter = false;
      continue;
    }
    if (fence) {
      const closing = /^ {0,3}(`+|~+)[ \t]*$/.exec(text);
      if (closing && closing[1][0] === fence.character && closing[1].length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (!comment) {
      if (/^(?: {4}|\t| {0,3}>)/.test(text)) {
        paragraph = [];
        continue;
      }
      const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
      if (opening && (opening[1][0] !== "`" || !opening[2].includes("`"))) {
        fence = { character: opening[1][0], length: opening[1].length };
        paragraph = [];
        continue;
      }
    }

    // Ignore comment blocks, including Obsidian's %% comments.
    let hasComment = comment !== null;
    for (let cursor = 0; cursor < text.length;) {
      if (comment) {
        const close = comment === "html" ? "-->" : "%%";
        const end = text.indexOf(close, cursor);
        if (end < 0) break;
        cursor = end + close.length;
        comment = null;
      } else {
        if (text[cursor] === "\\") {
          cursor += 2;
        } else if (text[cursor] === "`") {
          const run = /^`+/.exec(text.slice(cursor))![0];
          cursor += run.length;
          const closing = [...text.slice(cursor).matchAll(/`+/g)].find((match) => match[0].length === run.length);
          if (closing) cursor += closing.index! + closing[0].length;
        } else if (text.startsWith("<!--", cursor) || text.startsWith("%%", cursor)) {
          const isHtml = text.startsWith("<!--", cursor);
          cursor += isHtml ? 4 : 2;
          comment = isHtml ? "html" : "obsidian";
          hasComment = true;
        } else {
          cursor++;
        }
      }
    }
    if (hasComment) {
      paragraph = [];
      continue;
    }

    const atx = /^ {0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/.exec(text);
    const setext = /^ {0,3}(=+|-+)[ \t]*$/.exec(text);
    if (atx) {
      headings.push({
        title: (atx[2] ?? "").replace(/[ \t]+#+[ \t]*$/, "").trim(),
        level: atx[1].length,
        start: line.start,
        bodyStart: line.end,
        end: markdown.length,
      });
      paragraph = [];
    } else if (setext && paragraph.length > 0) {
      headings.push({
        title: paragraph.map((item) => item.text.trim()).join(" "),
        level: setext[1][0] === "=" ? 1 : 2,
        start: paragraph[0].start,
        bodyStart: line.end,
        end: markdown.length,
      });
      paragraph = [];
    } else if (!text.trim() || /^(?: {4}|\t| {0,3}(?:>|[-+*][ \t]|\d+[.)][ \t]|(?:[-*_][ \t]*){3,}$))/.test(text)) {
      paragraph = [];
    } else {
      paragraph.push(line);
    }
  }

  for (let index = 0; index < headings.length; index++) {
    const next = headings.slice(index + 1).find((heading) => heading.level <= headings[index].level);
    headings[index].end = next?.start ?? markdown.length;
  }
  return headings;
}

function markedTitle(title: string, marker: string): string | null {
  if (!title.startsWith(marker)) return null;
  const rest = title.slice(marker.length);
  if (rest && !/^[ \t]/.test(rest)) return null;
  const name = rest.trim();
  if (!name) throw new Error(`マーカー「${marker}」の後に空白と見出し名を指定してください。`);
  return name;
}

function carrySections(template: string, marker: string): { name: string; target: Section }[] {
  if (!marker || /[\r\n]/.test(marker)) throw new Error("引き継ぎマーカーには空欄でない1行の文字列を指定してください。");
  const selected: { name: string; target: Section }[] = [];
  const names = new Set<string>();
  for (const target of sections(template)) {
    const name = markedTitle(target.title, marker);
    if (name === null) continue;
    if (names.has(name)) throw new Error(`テンプレートに引き継ぐ見出し「${name}」が複数あります。見出し名を一意にしてください。`);
    names.add(name);
    selected.push({ name, target });
  }
  for (let index = 1; index < selected.length; index++) {
    if (selected[index].target.start < selected[index - 1].target.end) {
      throw new Error("引き継ぐ見出しの範囲が重なっています。親見出しを指定すると子見出しも含まれるため、マーカーは片方だけに付けてください。");
    }
  }
  return selected;
}

export function hasCarrySections(template: string, marker: string): boolean {
  return carrySections(template, marker.trim()).length > 0;
}

export interface MergeResult {
  content: string;
  carried: string[];
  missing: string[];
}

export function mergeSections(template: string, previous: string | null, marker: string): MergeResult {
  marker = marker.trim();
  const selected = carrySections(template, marker);
  const sources = previous === null || selected.length === 0 ? [] : sections(previous);

  let content = template;
  const carried: string[] = [];
  const missing: string[] = [];
  const newline = template.includes("\r\n") ? "\r\n" : "\n";
  for (const { name, target } of selected.reverse()) {
    const marked = sources.filter((section) => markedTitle(section.title, marker) === name);
    // Allow existing notes to be used before the marker was introduced.
    const matches = marked.length ? marked : sources.filter((section) => section.title === name);
    if (matches.length > 1) throw new Error(`前回のノートに見出し「${name}」が複数あります。見出し名を一意にしてください。`);
    const source = matches[0];
    if (!source || previous === null) {
      if (previous !== null) missing.unshift(name);
      continue;
    }
    let body = previous.slice(source.bodyStart, source.end).replace(/\r\n|\r|\n/g, newline);
    if (body && target.bodyStart > 0 && !/[\r\n]/.test(template[target.bodyStart - 1])) body = newline + body;
    if (target.end < template.length && body && !body.endsWith(newline)) body += newline;
    content = content.slice(0, target.bodyStart) + body + content.slice(target.end);
    carried.unshift(name);
  }
  return { content, carried, missing };
}

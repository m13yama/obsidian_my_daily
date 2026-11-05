"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => MyDailyPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// src/daily.ts
function vaultPath(value, label, allowEmpty = false) {
  const path = value.trim().replace(/\\/g, "/");
  if (path.startsWith("/") || /[<>:"|?*\x00-\x1f]/.test(path) || path.split("/").some((part) => part === ".." || part === ".")) {
    throw new Error(`${label}\u306B\u306FVault\u5185\u306E\u76F8\u5BFE\u30D1\u30B9\u3092\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002`);
  }
  const cleaned = path.replace(/\/{2,}/g, "/").replace(/\/$/, "");
  if (!cleaned && !allowEmpty) throw new Error(`${label}\u3092\u8A2D\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002`);
  if (cleaned.split("/").some((part) => part.startsWith("."))) throw new Error(`${label}\u306B\u306F\u96A0\u3057\u30D5\u30A9\u30EB\u30C0\u3084\u96A0\u3057\u30D5\u30A1\u30A4\u30EB\u3092\u6307\u5B9A\u3067\u304D\u307E\u305B\u3093\u3002`);
  return cleaned;
}
function dailyPath(settings, date, parse) {
  const folder = vaultPath(settings.dailyFolder, "\u4FDD\u5B58\u5148\u30D5\u30A9\u30EB\u30C0", true);
  const format = settings.dateFormat.trim();
  const probes = [date, date.clone().add(1, "day"), date.clone().add(1, "month"), date.clone().add(1, "year")];
  if (!format || date.clone().startOf("day").format(format) !== date.clone().endOf("day").format(format) || probes.some((probe) => {
    const parsed = parse(probe.format(format), format, true);
    return !parsed.isValid() || !parsed.isSame(probe, "day");
  })) throw new Error("\u65E5\u4ED8\u5F62\u5F0F\u306B\u306F\u6642\u523B\u3092\u542B\u3081\u305A\u3001\u5E74\u6708\u65E5\u3092\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\uFF08\u4F8B: YYYY-MM-DD\uFF09\u3002");
  const filename = vaultPath(date.format(format), "\u65E5\u4ED8\u5F62\u5F0F");
  return `${folder ? folder + "/" : ""}${filename}.md`;
}
function previousDaily(files, settings, date, parse, templatePath) {
  const folder = vaultPath(settings.dailyFolder, "\u4FDD\u5B58\u5148\u30D5\u30A9\u30EB\u30C0", true);
  const prefix = folder ? `${folder}/` : "";
  const format = settings.dateFormat.trim();
  let latest = null;
  let latestTime = -Infinity;
  for (const file of files) {
    if (file.path === templatePath || !file.path.startsWith(prefix) || !file.path.endsWith(".md")) continue;
    const name = file.path.slice(prefix.length, -3);
    const parsed = parse(name, format, true);
    if (!parsed.isValid() || parsed.format(format) !== name || !parsed.isBefore(date, "day")) continue;
    if (parsed.valueOf() > latestTime) {
      latest = file;
      latestTime = parsed.valueOf();
    }
  }
  return latest;
}
function renderTemplate(template, date, title) {
  return template.replace(/\{\{\s*(title|date|time)(?::([^{}]+))?\s*\}\}/g, (match, kind, format) => {
    if (kind === "title") return format ? match : title;
    return date.format(format?.trim() || (kind === "date" ? "YYYY-MM-DD" : "HH:mm"));
  });
}

// src/sections.ts
function sections(markdown) {
  const lines = [];
  const pattern = /[^\r\n]*(?:\r\n|\n|\r|$)/g;
  for (const match of markdown.matchAll(pattern)) {
    if (!match[0]) break;
    lines.push({
      text: match[0].replace(/[\r\n]+$/, ""),
      start: match.index,
      end: match.index + match[0].length
    });
  }
  const headings = [];
  let frontmatter = false;
  let fence = null;
  let comment = null;
  let paragraph = [];
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
    let hasComment = comment !== null;
    for (let cursor = 0; cursor < text.length; ) {
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
          const run = /^`+/.exec(text.slice(cursor))[0];
          cursor += run.length;
          const closing = [...text.slice(cursor).matchAll(/`+/g)].find((match) => match[0].length === run.length);
          if (closing) cursor += closing.index + closing[0].length;
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
        end: markdown.length
      });
      paragraph = [];
    } else if (setext && paragraph.length > 0) {
      headings.push({
        title: paragraph.map((item) => item.text.trim()).join(" "),
        level: setext[1][0] === "=" ? 1 : 2,
        start: paragraph[0].start,
        bodyStart: line.end,
        end: markdown.length
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
function markedTitle(title, marker) {
  if (!title.startsWith(marker)) return null;
  const rest = title.slice(marker.length);
  if (rest && !/^[ \t]/.test(rest)) return null;
  const name = rest.trim();
  if (!name) throw new Error(`\u30DE\u30FC\u30AB\u30FC\u300C${marker}\u300D\u306E\u5F8C\u306B\u7A7A\u767D\u3068\u898B\u51FA\u3057\u540D\u3092\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002`);
  return name;
}
function carrySections(template, marker) {
  if (!marker || /[\r\n]/.test(marker)) throw new Error("\u5F15\u304D\u7D99\u304E\u30DE\u30FC\u30AB\u30FC\u306B\u306F\u7A7A\u6B04\u3067\u306A\u30441\u884C\u306E\u6587\u5B57\u5217\u3092\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
  const selected = [];
  const names = /* @__PURE__ */ new Set();
  for (const target of sections(template)) {
    const name = markedTitle(target.title, marker);
    if (name === null) continue;
    if (names.has(name)) throw new Error(`\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u306B\u5F15\u304D\u7D99\u3050\u898B\u51FA\u3057\u300C${name}\u300D\u304C\u8907\u6570\u3042\u308A\u307E\u3059\u3002\u898B\u51FA\u3057\u540D\u3092\u4E00\u610F\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002`);
    names.add(name);
    selected.push({ name, target });
  }
  for (let index = 1; index < selected.length; index++) {
    if (selected[index].target.start < selected[index - 1].target.end) {
      throw new Error("\u5F15\u304D\u7D99\u3050\u898B\u51FA\u3057\u306E\u7BC4\u56F2\u304C\u91CD\u306A\u3063\u3066\u3044\u307E\u3059\u3002\u89AA\u898B\u51FA\u3057\u3092\u6307\u5B9A\u3059\u308B\u3068\u5B50\u898B\u51FA\u3057\u3082\u542B\u307E\u308C\u308B\u305F\u3081\u3001\u30DE\u30FC\u30AB\u30FC\u306F\u7247\u65B9\u3060\u3051\u306B\u4ED8\u3051\u3066\u304F\u3060\u3055\u3044\u3002");
    }
  }
  return selected;
}
function hasCarrySections(template, marker) {
  return carrySections(template, marker.trim()).length > 0;
}
function mergeSections(template, previous, marker) {
  marker = marker.trim();
  const selected = carrySections(template, marker);
  const sources = previous === null || selected.length === 0 ? [] : sections(previous);
  let content = template;
  const carried = [];
  const missing = [];
  const newline = template.includes("\r\n") ? "\r\n" : "\n";
  for (const { name, target } of selected.reverse()) {
    const marked = sources.filter((section) => markedTitle(section.title, marker) === name);
    const matches = marked.length ? marked : sources.filter((section) => section.title === name);
    if (matches.length > 1) throw new Error(`\u524D\u56DE\u306E\u30CE\u30FC\u30C8\u306B\u898B\u51FA\u3057\u300C${name}\u300D\u304C\u8907\u6570\u3042\u308A\u307E\u3059\u3002\u898B\u51FA\u3057\u540D\u3092\u4E00\u610F\u306B\u3057\u3066\u304F\u3060\u3055\u3044\u3002`);
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

// src/settings.ts
var DEFAULT_SETTINGS = {
  dailyFolder: "Daily",
  templatePath: "Templates/Daily.md",
  dateFormat: "YYYY-MM-DD",
  carryMarker: "@carry"
};
function loadSettings(data) {
  const settings = { ...DEFAULT_SETTINGS };
  if (data && typeof data === "object") {
    for (const key of Object.keys(settings)) {
      const value = data[key];
      if (typeof value === "string") settings[key] = value;
    }
  }
  return settings;
}

// src/main.ts
var MyDailyPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT_SETTINGS };
    this.creating = null;
  }
  async onload() {
    this.settings = loadSettings(await this.loadData());
    this.addCommand({
      id: "open-or-create-daily-note",
      name: "\u4ECA\u65E5\u306E\u30C7\u30A4\u30EA\u30FC\u30CE\u30FC\u30C8\u3092\u4F5C\u6210\u30FB\u958B\u304F",
      callback: () => {
        void this.openDaily();
      }
    });
    this.addRibbonIcon("calendar-plus", "My Daily: \u4ECA\u65E5\u306E\u30C7\u30A4\u30EA\u30FC\u30CE\u30FC\u30C8\u3092\u4F5C\u6210\u30FB\u958B\u304F", () => {
      void this.openDaily();
    });
    this.addSettingTab(new MyDailySettingTab(this.app, this));
  }
  openDaily() {
    if (this.creating) return this.creating;
    this.creating = this.createAndOpen().catch((error) => {
      console.error("My Daily:", error);
      new import_obsidian.Notice(`My Daily: ${error instanceof Error ? error.message : "\u30CE\u30FC\u30C8\u306E\u4F5C\u6210\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002"}`, 1e4);
    }).finally(() => {
      this.creating = null;
    });
    return this.creating;
  }
  async createAndOpen() {
    const settings = { ...this.settings };
    const now = (0, import_obsidian.moment)();
    const path = dailyPath(settings, now, import_obsidian.moment);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof import_obsidian.TFile) {
      await this.app.workspace.getLeaf(false).openFile(existing);
      return;
    }
    if (existing) throw new Error(`\u4F5C\u6210\u5148\u300C${path}\u300D\u306B\u540C\u540D\u306E\u30D5\u30A9\u30EB\u30C0\u304C\u3042\u308A\u307E\u3059\u3002`);
    let templatePath = vaultPath(settings.templatePath, "\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8");
    if (!templatePath.endsWith(".md")) templatePath += ".md";
    const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
    if (!(templateFile instanceof import_obsidian.TFile)) throw new Error(`\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u300C${templatePath}\u300D\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002My Daily\u306E\u8A2D\u5B9A\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002`);
    const title = path.slice(path.lastIndexOf("/") + 1, -3);
    const template = renderTemplate(await this.app.vault.read(templateFile), now, title);
    const previousFile = hasCarrySections(template, settings.carryMarker) ? previousDaily(this.app.vault.getMarkdownFiles(), settings, now, import_obsidian.moment, templatePath) : null;
    const previous = previousFile ? await this.app.vault.read(previousFile) : null;
    const result = mergeSections(template, previous, settings.carryMarker);
    await this.ensureFolder(path.slice(0, Math.max(0, path.lastIndexOf("/"))));
    let file = this.app.vault.getAbstractFileByPath(path);
    let created = false;
    if (!file) {
      try {
        file = await this.app.vault.create(path, result.content);
        created = true;
      } catch (error) {
        file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof import_obsidian.TFile)) throw error;
      }
    }
    if (!(file instanceof import_obsidian.TFile)) throw new Error(`\u4F5C\u6210\u5148\u300C${path}\u300D\u304C\u30D5\u30A1\u30A4\u30EB\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002`);
    await this.app.workspace.getLeaf(false).openFile(file);
    if (created && previousFile && result.carried.length > 0) {
      new import_obsidian.Notice(`${previousFile.path} \u304B\u3089 ${result.carried.length} \u500B\u306E\u30BB\u30AF\u30B7\u30E7\u30F3\u3092\u5F15\u304D\u7D99\u304E\u307E\u3057\u305F\u3002`);
    }
    if (created && result.missing.length > 0) {
      new import_obsidian.Notice(`\u524D\u56DE\u306E\u30CE\u30FC\u30C8\u306B\u300C${result.missing.join("\u300D\u300C")}\u300D\u304C\u306A\u3044\u305F\u3081\u3001\u305D\u306E\u90E8\u5206\u306F\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u3092\u4F7F\u3044\u307E\u3057\u305F\u3002`, 8e3);
    }
  }
  async ensureFolder(path) {
    if (!path) return;
    let current = "";
    for (const part of path.split("/")) {
      current = current ? `${current}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing instanceof import_obsidian.TFolder) continue;
      if (existing) throw new Error(`\u4FDD\u5B58\u5148\u300C${current}\u300D\u306B\u540C\u540D\u306E\u30D5\u30A1\u30A4\u30EB\u304C\u3042\u308A\u307E\u3059\u3002`);
      try {
        await this.app.vault.createFolder(current);
      } catch (error) {
        if (!(this.app.vault.getAbstractFileByPath(current) instanceof import_obsidian.TFolder)) throw error;
      }
    }
  }
};
var MyDailySettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, dailyPlugin) {
    super(app, dailyPlugin);
    this.dailyPlugin = dailyPlugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("p", { text: "\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u306E\u898B\u51FA\u3057\u540D\u306E\u5148\u982D\u306B\u30DE\u30FC\u30AB\u30FC\u3092\u4ED8\u3051\u308B\u3068\u3001\u305D\u306E\u30BB\u30AF\u30B7\u30E7\u30F3\u3092\u76F4\u8FD1\u306E\u904E\u53BB\u306E\u30C7\u30A4\u30EA\u30FC\u30CE\u30FC\u30C8\u304B\u3089\u5F15\u304D\u7D99\u304E\u307E\u3059\u3002\u305D\u308C\u4EE5\u5916\u306F\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u3092\u4F7F\u3044\u307E\u3059\u3002" });
    const fields = [
      { key: "dailyFolder", name: "\u4FDD\u5B58\u5148\u30D5\u30A9\u30EB\u30C0", description: "Vault\u304B\u3089\u306E\u76F8\u5BFE\u30D1\u30B9\u3002\u7A7A\u6B04\u306A\u3089Vault\u76F4\u4E0B\u306B\u4FDD\u5B58\u3057\u307E\u3059\u3002", placeholder: "Daily" },
      { key: "templatePath", name: "\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8", description: "\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u30CE\u30FC\u30C8\u306E\u30D1\u30B9\u3002.md \u306F\u7701\u7565\u3067\u304D\u307E\u3059\u3002", placeholder: "Templates/Daily.md" },
      { key: "dateFormat", name: "\u65E5\u4ED8\u5F62\u5F0F", description: "\u5E74\u6708\u65E5\u3092\u542B\u3080\u5F62\u5F0F\u3002YYYY/MM/YYYY-MM-DD \u306E\u3088\u3046\u306B\u30B5\u30D6\u30D5\u30A9\u30EB\u30C0\u3082\u6307\u5B9A\u3067\u304D\u307E\u3059\u3002", placeholder: "YYYY-MM-DD" },
      { key: "carryMarker", name: "\u5F15\u304D\u7D99\u304E\u30DE\u30FC\u30AB\u30FC", description: "\u4F8B: ## @carry \u7D99\u7D9A\u30BF\u30B9\u30AF\u3002\u30DE\u30FC\u30AB\u30FC\u306E\u5F8C\u306B\u7A7A\u767D\u3068\u898B\u51FA\u3057\u540D\u3092\u66F8\u304D\u307E\u3059\u3002\u5B50\u898B\u51FA\u3057\u3084\u5B8C\u4E86\u6E08\u307F\u30BF\u30B9\u30AF\u3082\u542B\u3081\u3066\u5F15\u304D\u7D99\u304E\u307E\u3059\u3002", placeholder: "@carry" }
    ];
    for (const field of fields) {
      new import_obsidian.Setting(containerEl).setName(field.name).setDesc(field.description).addText((text) => {
        text.setPlaceholder(field.placeholder).setValue(this.dailyPlugin.settings[field.key]).onChange(async (value) => {
          this.dailyPlugin.settings[field.key] = value;
          await this.dailyPlugin.saveData(this.dailyPlugin.settings);
        });
      });
    }
    containerEl.createEl("pre", { text: `## ${this.dailyPlugin.settings.carryMarker || "@carry"} \u7D99\u7D9A\u30BF\u30B9\u30AF
- [ ] \u524D\u56DE\u304B\u3089\u5F15\u304D\u7D99\u3050\u5185\u5BB9

## \u65E5\u8A18
\u6BCE\u65E5\u30C6\u30F3\u30D7\u30EC\u30FC\u30C8\u304B\u3089\u4F5C\u308B\u5185\u5BB9` });
    containerEl.createEl("p", { text: "\u4F5C\u6210\u306B\u306F\u300CMy Daily: \u4ECA\u65E5\u306E\u30C7\u30A4\u30EA\u30FC\u30CE\u30FC\u30C8\u3092\u4F5C\u6210\u30FB\u958B\u304F\u300D\u30B3\u30DE\u30F3\u30C9\u3001\u307E\u305F\u306F\u30AB\u30EC\u30F3\u30C0\u30FC\uFF0B\u306E\u30A2\u30A4\u30B3\u30F3\u3092\u4F7F\u3063\u3066\u304F\u3060\u3055\u3044\u3002\u65E2\u5B58\u306E\u30CE\u30FC\u30C8\u306F\u5909\u66F4\u3057\u307E\u305B\u3093\u3002" });
  }
};

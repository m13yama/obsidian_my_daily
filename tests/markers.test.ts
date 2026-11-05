import assert from "node:assert/strict";
import test from "node:test";
import { hasCarrySections, mergeSections } from "../src/sections";

const marker = "@carry";

test("automatically copies marked sections and keeps unmarked template sections", () => {
  const template = "# Today\n\n## @carry Tasks\n- [ ] default\n\n## Journal\nfresh\n\n## @carry Links\nplaceholder\n";
  const previous = "# Yesterday\n\n## @carry Links\n[[Project]]\n\n## @carry Tasks\n- [x] done\n- [ ] next\n\n## Journal\nold journal\n";
  assert.deepEqual(mergeSections(template, previous, marker), {
    content: "# Today\n\n## Tasks\n- [x] done\n- [ ] next\n\n## Journal\nfresh\n\n## Links\n[[Project]]\n\n",
    carried: ["Tasks", "Links"], missing: [],
  });
});

test("includes child headings but stops at the next sibling or ancestor", () => {
  const previous = "## @carry Tasks\na\n### Child\nb\n#### Grandchild\nc\n## Journal\nprivate\n";
  assert.equal(mergeSections("## @carry Tasks\ndefault\n## Journal\nfresh\n", previous, marker).content,
    "## Tasks\na\n### Child\nb\n#### Grandchild\nc\n## Journal\nfresh\n");
});

test("existing notes can be inherited before their headings have markers", () => {
  assert.equal(mergeSections("## @carry 継続タスク\ninitial\n", "## 継続タスク\n続き\n", marker).content,
    "## 継続タスク\n続き\n");
});

test("prefers the marked source over an unmarked heading with the same name", () => {
  assert.equal(mergeSections("## @carry Tasks\n", "## Tasks\nignore\n## @carry Tasks\ncarry\n", marker).content,
    "## Tasks\ncarry\n");
});

test("uses template defaults for the first day and missing source headings", () => {
  const template = "## @carry Tasks\ninitial\n";
  assert.deepEqual(mergeSections(template, null, marker), { content: "## Tasks\ninitial\n", carried: [], missing: [] });
  assert.deepEqual(mergeSections(template, "## Journal\ntext\n", marker), { content: "## Tasks\ninitial\n", carried: [], missing: ["Tasks"] });
});

test("an intentionally empty source section clears the template default", () => {
  assert.equal(mergeSections("## @carry Tasks\ndefault\n## Next\nfresh\n", "## @carry Tasks\n## Next\nold\n", marker).content,
    "## Tasks\n## Next\nfresh\n");
});

test("preserves frontmatter and ignores marked headings in YAML, code, quotes and comments", () => {
  const hidden = [
    "---", "description: |", "  ## @carry Tasks", "---", "```md", "## @carry Tasks", "```",
    "~~~~", "## @carry Tasks", "~~~", "## @carry Tasks", "~~~~", "<!--", "## @carry Tasks", "-->",
    "%%", "## @carry Tasks", "%%", "    ## @carry Tasks", "> ## @carry Tasks", "",
  ].join("\n");
  assert.equal(mergeSections(hidden + "## @carry Tasks\ndefault\n", hidden + "## @carry Tasks\ncarry\n", marker).content,
    hidden + "## Tasks\ncarry\n");
  assert.equal(hasCarrySections(hidden, marker), false);
});

test("retains fenced code without treating its headings as section boundaries", () => {
  const previous = "## @carry Tasks\n```md\n## Journal\n```\nkeep\n## Journal\nold\n";
  assert.equal(mergeSections("## @carry Tasks\nfresh\n## Journal\nnew\n", previous, marker).content,
    "## Tasks\n```md\n## Journal\n```\nkeep\n## Journal\nnew\n");
});

test("literal comment markers in code and quotes do not hide later sections", () => {
  const prefix = "Use `%%` and `` `<!--` `` literally.\n\n    <!--\n> %%\n\n";
  assert.equal(mergeSections(prefix + "## @carry Tasks\ndefault\n", prefix + "## @carry Tasks\ncarry\n", marker).content,
    prefix + "## Tasks\ncarry\n");
});

test("supports custom markers literally, including regular expression punctuation", () => {
  assert.equal(mergeSections("## [carry] 継続タスク ###\nnew\n", "## [carry] 継続タスク\ncarry\n", "[carry]").content,
    "## 継続タスク ###\ncarry\n");
  assert.equal(mergeSections("## ↪ メモ\nnew\n", "## ↪ メモ\ncarry\n", "↪").content, "## メモ\ncarry\n");
});

test("a marker must start the heading name and be followed by whitespace", () => {
  const template = "## Tasks @carry\nnew\n## @carryover Tasks\nnew\n## Tasks\n@carry is prose\n";
  assert.equal(hasCarrySections(template, marker), false);
  assert.equal(mergeSections(template, "## Tasks\nold\n", marker).content, template);
  assert.equal(hasCarrySections("### @carry\tTasks\n", marker), true);
});

test("rejects ambiguous marked headings and ambiguous unmarked migration sources", () => {
  assert.throws(() => mergeSections("## @carry Tasks\na\n## @carry Tasks\nb\n", null, marker), /複数/);
  assert.throws(() => mergeSections("## @carry Tasks\n", "## @carry Tasks\na\n## @carry Tasks\nb\n", marker), /複数/);
  assert.throws(() => mergeSections("## @carry Tasks\n", "## Tasks\na\n## Tasks\nb\n", marker), /複数/);
});

test("rejects nested marked sections and invalid marker configuration", () => {
  assert.throws(() => mergeSections("## @carry Tasks\na\n### @carry Child\nb\n", null, marker), /重なって/);
  assert.throws(() => mergeSections("## @carry\n", null, marker), /見出し名/);
  for (const invalid of ["", " ", "carry\nother"]) {
    assert.throws(() => mergeSections("## Tasks\n", null, invalid), /マーカー/);
  }
});

test("supports setext headings as selections and section boundaries", () => {
  assert.equal(mergeSections("@carry Tasks\n-----\ndefault\n\nJournal\n-------\nfresh\n", "## @carry Tasks\ncarry\n\nJournal\n-------\nold\n", marker).content,
    "Tasks\n-----\ncarry\n\nJournal\n-------\nfresh\n");
});

test("retains template CRLF and inserts necessary newlines at EOF boundaries", () => {
  assert.equal(mergeSections("## @carry Tasks\r\ndefault\r\n## Next\r\nfresh\r\n", "## @carry Tasks\ncarry", marker).content,
    "## Tasks\r\ncarry\r\n## Next\r\nfresh\r\n");
  assert.equal(mergeSections("## @carry Tasks", "## @carry Tasks\ncarry", marker).content, "## Tasks\ncarry");
});

test("preserves literal template variables in inherited content", () => {
  assert.equal(mergeSections("# 2026-11-05\n## @carry Tasks\n", "## @carry Tasks\n{{date}}\n<% example %>\n", marker).content,
    "# 2026-11-05\n## Tasks\n{{date}}\n<% example %>\n");
});

test("continues carrying edited content across days without markers in generated headings", () => {
  const template = "## @carry Tasks\ninitial\n\n## Journal\nfresh\n";
  const first = mergeSections(template, null, marker).content;
  const edited = first.replace("initial", "progress");
  const second = mergeSections(template, edited, marker);
  assert.equal(second.content, "## Tasks\nprogress\n\n## Journal\nfresh\n");
  assert.deepEqual(second.carried, ["Tasks"]);
  assert.equal(mergeSections(template, second.content, marker).content, second.content);
});

test("removes only the heading prefix while preserving formatting and literal marker text", () => {
  const body = "@carry in prose\n`@carry`\n```md\n## @carry Example\n```\n";
  const template = "  ###\t@carry \t**Tasks** @carry ###  \n" + body;
  assert.equal(mergeSections(template, null, marker).content, "  ###\t**Tasks** @carry ###  \n" + body);
  assert.equal(mergeSections("## @carry Tasks\n", "## @carry Tasks\n" + body, marker).content, "## Tasks\n" + body);
  assert.equal(mergeSections("## \u3000@carry 継続タスク\n", null, marker).content, "## \u3000継続タスク\n");
});

test("removes markers from inherited child headings", () => {
  const previous = "## @carry Tasks\na\n### @carry Child\nb\n";
  assert.equal(mergeSections("## @carry Tasks\ninitial\n", previous, marker).content, "## Tasks\na\n### Child\nb\n");
});

test("removes markers from multiline setext headings without changing their underline", () => {
  assert.equal(mergeSections("@carry\nTasks\ncontinued\n-----\ninitial\n", null, marker).content,
    "Tasks\ncontinued\n-----\ninitial\n");
});

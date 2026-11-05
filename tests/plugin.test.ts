import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { buildSync } from "esbuild";
import moment from "moment";
import type { MyDailySettings } from "../src/settings";

// Bundle the real entry point and substitute only Obsidian's host API.
const bundle = buildSync({ entryPoints: ["src/main.ts"], bundle: true, write: false, format: "cjs", platform: "node", external: ["obsidian"] });
const code = bundle.outputFiles[0].text;
const fixedDate = "2026-11-05T10:45:00";

function environment(initial: Record<string, string>, storedSettings: Partial<MyDailySettings> = {}) {
  class TFile { constructor(readonly path: string) {} }
  class TFolder { constructor(readonly path: string) {} }
  const entries = new Map<string, TFile | TFolder>();
  const contents = new Map(Object.entries(initial));
  for (const path of contents.keys()) {
    entries.set(path, new TFile(path));
    const parts = path.split("/");
    parts.pop();
    for (let index = 1; index <= parts.length; index++) {
      const folder = parts.slice(0, index).join("/");
      entries.set(folder, new TFolder(folder));
    }
  }
  const notices: string[] = [];
  const opened: string[] = [];
  const commands: { id: string; callback: () => void }[] = [];
  let creates = 0;
  let onRead: (() => void) | undefined;
  let onCreate: (() => void) | undefined;
  const vault = {
    getAbstractFileByPath: (path: string) => entries.get(path) ?? null,
    getMarkdownFiles: () => [...entries.values()].filter((file) => file instanceof TFile && file.path.endsWith(".md")),
    read: async (file: TFile) => { onRead?.(); return contents.get(file.path)!; },
    create: async (path: string, content: string) => {
      onCreate?.();
      if (entries.has(path)) throw new Error("Already exists");
      creates++;
      const file = new TFile(path);
      entries.set(path, file);
      contents.set(path, content);
      return file;
    },
    createFolder: async (path: string) => {
      if (entries.has(path)) throw new Error("Already exists");
      entries.set(path, new TFolder(path));
    },
  };
  const app = { vault, workspace: { getLeaf: () => ({ openFile: async (file: TFile) => { opened.push(file.path); } }) } };
  class Plugin {
    app = app;
    loadData = async () => storedSettings;
    saveData = async () => {};
    addCommand = (command: { id: string; callback: () => void }) => { commands.push(command); };
    addRibbonIcon = () => {};
    addSettingTab = () => {};
  }
  const host = {
    Plugin, TFile, TFolder, PluginSettingTab: class {}, Setting: class {},
    Notice: class { constructor(message: string) { notices.push(message); } },
    moment: (...args: Parameters<typeof moment>) => args.length ? moment(...args) : moment(fixedDate),
  };
  const module = { exports: {} as { default: new () => { onload(): Promise<void>; openDaily(): Promise<void> } } };
  runInNewContext(code, { module, require: (name: string) => {
    assert.equal(name, "obsidian");
    return host;
  }, console: { error: () => {} } });
  return {
    plugin: new module.exports.default(), contents, notices, opened, commands, entries,
    get creates() { return creates; },
    set onRead(callback: () => void) { onRead = callback; },
    set onCreate(callback: () => void) { onCreate = callback; },
    addFile(path: string, content: string) { entries.set(path, new TFile(path)); contents.set(path, content); },
  };
}

const template = "# {{date}}\n\n## @carry 継続タスク\n- [ ] initial\n\n## 日記\n今日の記録\n";

test("the registered command builds a daily note without changing its source", async () => {
  const previous = "# old\n## 継続タスク\n- [ ] continue\n\n## 日記\nold diary\n";
  const env = environment({ "Templates/Daily.md": template, "Daily/2026-11-03.md": previous });
  await env.plugin.onload();
  env.commands[0].callback();
  await env.plugin.openDaily();
  assert.equal(env.creates, 1);
  assert.equal(env.contents.get("Daily/2026-11-05.md"), "# 2026-11-05\n\n## 継続タスク\n- [ ] continue\n\n## 日記\n今日の記録\n");
  assert.equal(env.contents.get("Daily/2026-11-03.md"), previous);
  assert.equal(env.contents.get("Templates/Daily.md"), template);
  assert.deepEqual(env.opened, ["Daily/2026-11-05.md"]);
});

test("an existing note opens unchanged even when the template is missing", async () => {
  const env = environment({ "Daily/2026-11-05.md": "already edited" });
  await env.plugin.onload();
  await env.plugin.openDaily();
  assert.equal(env.creates, 0);
  assert.equal(env.contents.get("Daily/2026-11-05.md"), "already edited");
  assert.deepEqual(env.opened, ["Daily/2026-11-05.md"]);
  assert.deepEqual(env.notices, []);
});

test("first-day creation uses the template and creates missing dated folders", async () => {
  const env = environment({ "Templates/Daily.md": template }, { dateFormat: "YYYY/MM/YYYY-MM-DD" });
  await env.plugin.onload();
  await env.plugin.openDaily();
  assert.equal(env.contents.get("Daily/2026/11/2026-11-05.md"), "# 2026-11-05\n\n## 継続タスク\n- [ ] initial\n\n## 日記\n今日の記録\n");
  assert.ok(env.entries.has("Daily/2026/11"));
});

test("handles vault-root notes and template paths without .md", async () => {
  const env = environment({ "template.md": template }, { dailyFolder: "", templatePath: "template" });
  await env.plugin.onload();
  await env.plugin.openDaily();
  assert.ok(env.contents.has("2026-11-05.md"));
  assert.equal(env.creates, 1);
});

test("concurrent invocations produce just one file and one open", async () => {
  const env = environment({ "Templates/Daily.md": template });
  await env.plugin.onload();
  await Promise.all([env.plugin.openDaily(), env.plugin.openDaily(), env.plugin.openDaily()]);
  assert.equal(env.creates, 1);
  assert.equal(env.opened.length, 1);
});

test("a note created during the read is opened without overwriting it", async () => {
  const env = environment({ "Templates/Daily.md": template });
  env.onRead = () => { env.addFile("Daily/2026-11-05.md", "synced note"); };
  await env.plugin.onload();
  await env.plugin.openDaily();
  assert.equal(env.creates, 0);
  assert.equal(env.contents.get("Daily/2026-11-05.md"), "synced note");
  assert.equal(env.opened.length, 1);
});

test("a note created between checking and writing is also preserved", async () => {
  const env = environment({ "Templates/Daily.md": template });
  env.onCreate = () => { env.addFile("Daily/2026-11-05.md", "racing note"); };
  await env.plugin.onload();
  await env.plugin.openDaily();
  assert.equal(env.creates, 0);
  assert.equal(env.contents.get("Daily/2026-11-05.md"), "racing note");
  assert.equal(env.opened.length, 1);
});

test("missing templates and ambiguous sections fail before creating a note", async () => {
  const fixtures: Record<string, string>[] = [{}, { "Templates/Daily.md": "## @carry 継続タスク\na\n## @carry 継続タスク\nb\n" }];
  for (const initial of fixtures) {
    const env = environment(initial);
    await env.plugin.onload();
    await env.plugin.openDaily();
    assert.equal(env.creates, 0);
    assert.equal(env.notices.length, 1);
    assert.equal(env.opened.length, 0);
  }
});

test("a missing source heading retains the default and reports it", async () => {
  const env = environment({ "Templates/Daily.md": template, "Daily/2026-11-04.md": "## 日記\nyesterday\n" });
  await env.plugin.onload();
  await env.plugin.openDaily();
  assert.ok(env.contents.get("Daily/2026-11-05.md")?.includes("initial"));
  assert.ok(env.contents.get("Daily/2026-11-05.md")?.includes("## 継続タスク\n"));
  assert.ok(env.notices.some((notice) => notice.includes("テンプレートを使いました")));
});

test("example template works with default heading settings", async () => {
  const example = await readFile("examples/Daily.md", "utf8");
  const env = environment({ "Templates/Daily.md": example });
  await env.plugin.onload();
  await env.plugin.openDaily();
  assert.equal(env.creates, 1);
  assert.ok(env.contents.get("Daily/2026-11-05.md")?.includes("# 2026-11-05"));
});

test("a custom marker controls which template sections are inherited", async () => {
  const env = environment({
    "Templates/Daily.md": "## [carry] メモ\ninitial\n## @carry 継続タスク\nfresh\n",
    "Daily/2026-11-04.md": "## [carry] メモ\ncarry\n## @carry 継続タスク\nold\n",
  }, { carryMarker: "[carry]" });
  await env.plugin.onload();
  await env.plugin.openDaily();
  assert.equal(env.contents.get("Daily/2026-11-05.md"), "## メモ\ncarry\n## @carry 継続タスク\nfresh\n");
});

test("a template without marked headings does not read the previous note", async () => {
  const env = environment({ "Templates/Daily.md": "## 日記\nfresh\n", "Daily/2026-11-04.md": "old\n" });
  let reads = 0;
  env.onRead = () => { reads++; };
  await env.plugin.onload();
  await env.plugin.openDaily();
  assert.equal(reads, 1);
  assert.equal(env.contents.get("Daily/2026-11-05.md"), "## 日記\nfresh\n");
});

import assert from "node:assert/strict";
import test from "node:test";
import moment from "moment";
import { dailyPath, previousDaily, renderTemplate, vaultPath } from "../src/daily";
import { DEFAULT_SETTINGS, loadSettings } from "../src/settings";

const now = moment("2026-11-05T10:45:00");

test("finds the closest earlier note by filename date, including gaps", () => {
  const files = ["Daily/2026-11-06.md", "Daily/2026-11-05.md", "Daily/2026-10-31.md", "Daily/2026-11-03.md", "Daily/2026-11-02.md"].map((path) => ({ path }));
  assert.equal(previousDaily(files, DEFAULT_SETTINGS, now, moment, "Templates/Daily.md")?.path, "Daily/2026-11-03.md");
});

test("excludes malformed dates, other folders, templates and unrelated subfolders", () => {
  const files = ["Daily/2026-11-04.md", "Daily/2026-11-4.md", "Daily/2026-02-30.md", "Daily copy/2026-11-03.md", "Daily/archive/2026-11-03.md", "2026-11-03.md", "Daily/2026-11-03.txt"].map((path) => ({ path }));
  assert.equal(previousDaily(files, DEFAULT_SETTINGS, now, moment, "Daily/2026-11-04.md"), null);
});

test("supports dated subfolders and requires dates in all path parts to agree", () => {
  const settings = { ...DEFAULT_SETTINGS, dateFormat: "YYYY/MM/YYYY-MM-DD" };
  assert.equal(dailyPath(settings, now, moment), "Daily/2026/11/2026-11-05.md");
  const files = ["Daily/2026/10/2026-11-04.md", "Daily/2026/11/2026-11-03.md"].map((path) => ({ path }));
  assert.equal(previousDaily(files, settings, now, moment, "Templates/Daily.md")?.path, "Daily/2026/11/2026-11-03.md");
});

test("supports vault-root notes and literal prefixes in date formats", () => {
  const settings = { ...DEFAULT_SETTINGS, dailyFolder: "", dateFormat: "[Daily-]YYYY-MM-DD" };
  assert.equal(dailyPath(settings, now, moment), "Daily-2026-11-05.md");
  assert.equal(previousDaily([{ path: "Daily-2026-11-04.md" }], settings, now, moment, "template.md")?.path, "Daily-2026-11-04.md");
});

test("rejects incomplete and invalid date formats", () => {
  for (const dateFormat of ["", "YYYY", "YYYY-MM", "MM-DD", "[daily]", "YYYY-MM-DD HH:mm", "YYYY-MM-DD-HH-mm"]) {
    assert.throws(() => dailyPath({ ...DEFAULT_SETTINGS, dateFormat }, now, moment));
  }
});

test("normalizes relative paths and rejects escapes, absolute and hidden paths", () => {
  assert.equal(vaultPath(" Daily\\Notes/ ", "folder"), "Daily/Notes");
  assert.equal(vaultPath("", "folder", true), "");
  for (const path of ["../Daily", "/Daily", "Daily/../Other", "C:\\Daily", ".obsidian/plugins", "Daily/.hidden", "Daily/a?b"]) {
    assert.throws(() => vaultPath(path, "folder"));
  }
});

test("renders title, date and time once, with optional formats", () => {
  const text = "# {{title}}\n{{date}} {{time}} {{date:YYYY/MM/DD}} {{time:HH:mm:ss}} {{unknown}}";
  assert.equal(renderTemplate(text, now, "2026-11-05"), "# 2026-11-05\n2026-11-05 10:45 2026/11/05 10:45:00 {{unknown}}");
});

test("loads supported settings without accepting invalid stored types", () => {
  assert.deepEqual(loadSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(loadSettings({ dailyFolder: "", templatePath: 12, dateFormat: null, carryMarker: "[carry]", unknown: true }),
    { ...DEFAULT_SETTINGS, dailyFolder: "", carryMarker: "[carry]" });
});

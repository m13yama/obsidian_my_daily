import type moment from "moment";
import type { MyDailySettings } from "./settings";

type Moment = moment.Moment;
type MomentFactory = typeof moment;

export function vaultPath(value: string, label: string, allowEmpty = false): string {
  const path = value.trim().replace(/\\/g, "/");
  if (path.startsWith("/") || /[<>:"|?*\x00-\x1f]/.test(path) || path.split("/").some((part) => part === ".." || part === ".")) {
    throw new Error(`${label}にはVault内の相対パスを指定してください。`);
  }
  const cleaned = path.replace(/\/{2,}/g, "/").replace(/\/$/, "");
  if (!cleaned && !allowEmpty) throw new Error(`${label}を設定してください。`);
  if (cleaned.split("/").some((part) => part.startsWith("."))) throw new Error(`${label}には隠しフォルダや隠しファイルを指定できません。`);
  return cleaned;
}

export function dailyPath(settings: MyDailySettings, date: Moment, parse: MomentFactory): string {
  const folder = vaultPath(settings.dailyFolder, "保存先フォルダ", true);
  const format = settings.dateFormat.trim();
  // Missing date parts can otherwise default to today's date during parsing.
  const probes = [date, date.clone().add(1, "day"), date.clone().add(1, "month"), date.clone().add(1, "year")];
  if (!format || date.clone().startOf("day").format(format) !== date.clone().endOf("day").format(format) || probes.some((probe) => {
    const parsed = parse(probe.format(format), format, true);
    return !parsed.isValid() || !parsed.isSame(probe, "day");
  })) throw new Error("日付形式には時刻を含めず、年月日を指定してください（例: YYYY-MM-DD）。");
  const filename = vaultPath(date.format(format), "日付形式");
  return `${folder ? folder + "/" : ""}${filename}.md`;
}

export function previousDaily<T extends { path: string }>(files: T[], settings: MyDailySettings, date: Moment, parse: MomentFactory, templatePath: string): T | null {
  const folder = vaultPath(settings.dailyFolder, "保存先フォルダ", true);
  const prefix = folder ? `${folder}/` : "";
  const format = settings.dateFormat.trim();
  let latest: T | null = null;
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

export function renderTemplate(template: string, date: Moment, title: string): string {
  return template.replace(/\{\{\s*(title|date|time)(?::([^{}]+))?\s*\}\}/g, (match, kind: string, format?: string) => {
    if (kind === "title") return format ? match : title;
    return date.format(format?.trim() || (kind === "date" ? "YYYY-MM-DD" : "HH:mm"));
  });
}

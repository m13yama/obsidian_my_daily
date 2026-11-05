export interface MyDailySettings {
  dailyFolder: string;
  templatePath: string;
  dateFormat: string;
  carryMarker: string;
}

export const DEFAULT_SETTINGS: MyDailySettings = {
  dailyFolder: "Daily",
  templatePath: "Templates/Daily.md",
  dateFormat: "YYYY-MM-DD",
  carryMarker: "@carry",
};

export function loadSettings(data: unknown): MyDailySettings {
  const settings = { ...DEFAULT_SETTINGS };
  if (data && typeof data === "object") {
    for (const key of Object.keys(settings) as (keyof MyDailySettings)[]) {
      const value = (data as Record<string, unknown>)[key];
      if (typeof value === "string") settings[key] = value;
    }
  }
  return settings;
}

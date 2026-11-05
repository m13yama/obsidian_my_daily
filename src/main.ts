import { App, moment, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder } from "obsidian";
import { dailyPath, previousDaily, renderTemplate, vaultPath } from "./daily";
import { hasCarrySections, mergeSections } from "./sections";
import { DEFAULT_SETTINGS, loadSettings, type MyDailySettings } from "./settings";

export default class MyDailyPlugin extends Plugin {
  settings: MyDailySettings = { ...DEFAULT_SETTINGS };
  private creating: Promise<void> | null = null;

  async onload(): Promise<void> {
    this.settings = loadSettings(await this.loadData());
    this.addCommand({
      id: "open-or-create-daily-note",
      name: "今日のデイリーノートを作成・開く",
      callback: () => { void this.openDaily(); },
    });
    this.addRibbonIcon("calendar-plus", "My Daily: 今日のデイリーノートを作成・開く", () => { void this.openDaily(); });
    this.addSettingTab(new MyDailySettingTab(this.app, this));
  }

  openDaily(): Promise<void> {
    if (this.creating) return this.creating;
    this.creating = this.createAndOpen().catch((error: unknown) => {
      console.error("My Daily:", error);
      new Notice(`My Daily: ${error instanceof Error ? error.message : "ノートの作成に失敗しました。"}`, 10000);
    }).finally(() => { this.creating = null; });
    return this.creating;
  }

  private async createAndOpen(): Promise<void> {
    const settings = { ...this.settings };
    const now = moment();
    const path = dailyPath(settings, now, moment);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.workspace.getLeaf(false).openFile(existing);
      return;
    }
    if (existing) throw new Error(`作成先「${path}」に同名のフォルダがあります。`);

    let templatePath = vaultPath(settings.templatePath, "テンプレート");
    if (!templatePath.endsWith(".md")) templatePath += ".md";
    const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
    if (!(templateFile instanceof TFile)) throw new Error(`テンプレート「${templatePath}」が見つかりません。My Dailyの設定を確認してください。`);
    const title = path.slice(path.lastIndexOf("/") + 1, -3);
    const template = renderTemplate(await this.app.vault.read(templateFile), now, title);
    const previousFile = hasCarrySections(template, settings.carryMarker)
      ? previousDaily(this.app.vault.getMarkdownFiles(), settings, now, moment, templatePath)
      : null;
    const previous = previousFile ? await this.app.vault.read(previousFile) : null;
    const result = mergeSections(template, previous, settings.carryMarker);
    await this.ensureFolder(path.slice(0, Math.max(0, path.lastIndexOf("/"))));

    // Another command or sync may have created today's note while we were reading.
    let file = this.app.vault.getAbstractFileByPath(path);
    let created = false;
    if (!file) {
      try {
        file = await this.app.vault.create(path, result.content);
        created = true;
      } catch (error) {
        file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) throw error;
      }
    }
    if (!(file instanceof TFile)) throw new Error(`作成先「${path}」がファイルではありません。`);
    await this.app.workspace.getLeaf(false).openFile(file);
    if (created && previousFile && result.carried.length > 0) {
      new Notice(`${previousFile.path} から ${result.carried.length} 個のセクションを引き継ぎました。`);
    }
    if (created && result.missing.length > 0) {
      new Notice(`前回のノートに「${result.missing.join("」「")}」がないため、その部分はテンプレートを使いました。`, 8000);
    }
  }

  private async ensureFolder(path: string): Promise<void> {
    if (!path) return;
    let current = "";
    for (const part of path.split("/")) {
      current = current ? `${current}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing instanceof TFolder) continue;
      if (existing) throw new Error(`保存先「${current}」に同名のファイルがあります。`);
      try {
        await this.app.vault.createFolder(current);
      } catch (error) {
        if (!(this.app.vault.getAbstractFileByPath(current) instanceof TFolder)) throw error;
      }
    }
  }
}

class MyDailySettingTab extends PluginSettingTab {
  constructor(app: App, private readonly dailyPlugin: MyDailyPlugin) {
    super(app, dailyPlugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("p", { text: "テンプレートの見出し名の先頭にマーカーを付けると、そのセクションを直近の過去のデイリーノートから引き継ぎます。それ以外はテンプレートを使います。" });
    const fields: { key: keyof MyDailySettings; name: string; description: string; placeholder: string }[] = [
      { key: "dailyFolder", name: "保存先フォルダ", description: "Vaultからの相対パス。空欄ならVault直下に保存します。", placeholder: "Daily" },
      { key: "templatePath", name: "テンプレート", description: "テンプレートノートのパス。.md は省略できます。", placeholder: "Templates/Daily.md" },
      { key: "dateFormat", name: "日付形式", description: "年月日を含む形式。YYYY/MM/YYYY-MM-DD のようにサブフォルダも指定できます。", placeholder: "YYYY-MM-DD" },
      { key: "carryMarker", name: "引き継ぎマーカー", description: "例: ## @carry 継続タスク。マーカーの後に空白と見出し名を書きます。子見出しや完了済みタスクも含めて引き継ぎます。", placeholder: "@carry" },
    ];
    for (const field of fields) {
      new Setting(containerEl).setName(field.name).setDesc(field.description).addText((text) => {
        text.setPlaceholder(field.placeholder).setValue(this.dailyPlugin.settings[field.key]).onChange(async (value) => {
          this.dailyPlugin.settings[field.key] = value;
          await this.dailyPlugin.saveData(this.dailyPlugin.settings);
        });
      });
    }
    containerEl.createEl("pre", { text: `## ${this.dailyPlugin.settings.carryMarker || "@carry"} 継続タスク\n- [ ] 前回から引き継ぐ内容\n\n## 日記\n毎日テンプレートから作る内容` });
    containerEl.createEl("p", { text: "作成には「My Daily: 今日のデイリーノートを作成・開く」コマンド、またはカレンダー＋のアイコンを使ってください。既存のノートは変更しません。" });
  }
}

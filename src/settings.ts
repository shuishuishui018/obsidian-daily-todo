import { App, PluginSettingTab, Setting } from 'obsidian'
import type DailyTodoPlugin from './main'
import { isZh, t } from './i18n'

export interface TodoSettings {
  todoFolder: string
  workLogFolder: string
  lookbackDays: number
  autoCarryOver: boolean
  extractOnOpen: boolean
  showDone: boolean
}

export function defaultSettings(): TodoSettings {
  const zh = isZh()
  return {
    todoFolder: zh ? '每日待办' : 'Daily Todo',
    workLogFolder: zh ? '工作日志' : 'Work Log',
    lookbackDays: 2,
    autoCarryOver: true,
    extractOnOpen: true,
    showDone: true,
  }
}

export class TodoSettingTab extends PluginSettingTab {
  plugin: DailyTodoPlugin

  constructor(app: App, plugin: DailyTodoPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    new Setting(containerEl)
      .setName(t('settingsFolder'))
      .setDesc(t('settingsFolderDesc'))
      .addText((text) =>
        text
          .setPlaceholder(defaultSettings().todoFolder)
          .setValue(this.plugin.settings.todoFolder)
          .onChange(async (value) => {
            this.plugin.settings.todoFolder = value.trim() || defaultSettings().todoFolder
            await this.plugin.saveSettings()
          }),
      )

    new Setting(containerEl)
      .setName(t('settingsWorkLog'))
      .setDesc(t('settingsWorkLogDesc'))
      .addText((text) =>
        text
          .setPlaceholder(defaultSettings().workLogFolder)
          .setValue(this.plugin.settings.workLogFolder)
          .onChange(async (value) => {
            this.plugin.settings.workLogFolder = value.trim() || defaultSettings().workLogFolder
            await this.plugin.saveSettings()
          }),
      )

    new Setting(containerEl)
      .setName(t('settingsLookback'))
      .setDesc(t('settingsLookbackDesc'))
      .addSlider((slider) =>
        slider
          .setLimits(1, 30, 1)
          .setValue(this.plugin.settings.lookbackDays)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.lookbackDays = value
            await this.plugin.saveSettings()
          }),
      )

    new Setting(containerEl)
      .setName(t('settingsAutoCarry'))
      .setDesc(t('settingsAutoCarryDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoCarryOver).onChange(async (value) => {
          this.plugin.settings.autoCarryOver = value
          await this.plugin.saveSettings()
        }),
      )

    new Setting(containerEl)
      .setName(t('settingsExtractOnOpen'))
      .setDesc(t('settingsExtractOnOpenDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.extractOnOpen).onChange(async (value) => {
          this.plugin.settings.extractOnOpen = value
          await this.plugin.saveSettings()
        }),
      )

    new Setting(containerEl)
      .setName(t('settingsShowDone'))
      .setDesc(t('settingsShowDoneDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showDone).onChange(async (value) => {
          this.plugin.settings.showDone = value
          await this.plugin.saveSettings()
        }),
      )
  }
}

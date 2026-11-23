import { Notice, Plugin, WorkspaceLeaf } from 'obsidian'
import { TodoStore } from './store'
import { TodoSettings, TodoSettingTab, defaultSettings } from './settings'
import { TodoView, VIEW_TYPE } from './view'
import { t } from './i18n'

export default class DailyTodoPlugin extends Plugin {
  settings!: TodoSettings
  store!: TodoStore
  /** 记录最近一次自动结转/提取发生的日期，避免每次打开面板都跑一遍 */
  lastMaintain = ''

  async onload(): Promise<void> {
    await this.loadSettings()
    this.store = new TodoStore(this.app, () => this.settings)

    this.registerView(VIEW_TYPE, (leaf: WorkspaceLeaf) => new TodoView(leaf, this))

    this.addRibbonIcon('list-checks', t('ribbon'), () => {
      void this.activateView()
    })

    this.addCommand({
      id: 'open-panel',
      name: t('cmdOpen'),
      callback: () => void this.activateView(),
    })

    this.addCommand({
      id: 'carry-over',
      name: t('cmdCarry'),
      callback: async () => {
        const moved = await this.store.carryOver()
        this.notify(moved > 0 ? t('carryHint', moved) : t('nothingToCarry'))
        this.refreshViews()
      },
    })

    this.addCommand({
      id: 'extract-work-log',
      name: t('cmdExtract'),
      callback: async () => {
        const res = await this.store.extractFromWorkLog()
        this.notify(res.added > 0 ? t('extractHint', res.added) : t('nothingToExtract'))
        this.refreshViews()
      },
    })

    this.addSettingTab(new TodoSettingTab(this.app, this))
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE)
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, defaultSettings(), await this.loadData())
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings)
    this.refreshViews()
  }

  notify(message: string): void {
    new Notice(message, 4000)
  }

  refreshViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const view = leaf.view
      if (view instanceof TodoView) void view.refresh()
    }
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app
    const existing = workspace.getLeavesOfType(VIEW_TYPE)
    let leaf = existing[0]
    if (!leaf) {
      const right = workspace.getRightLeaf(false)
      if (!right) return
      await right.setViewState({ type: VIEW_TYPE, active: true })
      leaf = right
    }
    await workspace.revealLeaf(leaf)
  }
}

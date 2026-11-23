import { ItemView, Menu, TFile, WorkspaceLeaf, setIcon } from 'obsidian'
import { moment } from './time'
import type DailyTodoPlugin from './main'
import { t } from './i18n'
import { Task, keyToMoment, todayKey } from './store'

export const VIEW_TYPE = 'daily-todo-panel'

export class TodoView extends ItemView {
  plugin: DailyTodoPlugin
  private refreshTimer: number | null = null
  private working = false

  constructor(leaf: WorkspaceLeaf, plugin: DailyTodoPlugin) {
    super(leaf)
    this.plugin = plugin
  }

  getViewType(): string {
    return VIEW_TYPE
  }

  getDisplayText(): string {
    return t('viewTitle')
  }

  getIcon(): string {
    return 'list-checks'
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass('dtp-root')
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (file instanceof TFile && file.path.startsWith(`${this.plugin.settings.todoFolder}/`)) {
          this.scheduleRefresh()
        }
      }),
    )
    await this.onFirstOpen()
    await this.render()
  }

  async onClose(): Promise<void> {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer)
    this.contentEl.empty()
  }

  /** 打开面板时做一次自动结转 / 提取 */
  private async onFirstOpen(): Promise<void> {
    const today = todayKey()
    if (this.plugin.lastMaintain === today) return
    this.plugin.lastMaintain = today
    try {
      if (this.plugin.settings.autoCarryOver) {
        const moved = await this.plugin.store.carryOver()
        if (moved > 0) this.plugin.notify(t('carryHint', moved))
      }
      if (this.plugin.settings.extractOnOpen) {
        const res = await this.plugin.store.extractFromWorkLog()
        if (res.added > 0) this.plugin.notify(t('extractHint', res.added))
        else if (res.missingFolder) this.plugin.notify(t('errorNoWorkLog', this.plugin.settings.workLogFolder))
      }
    } catch (err) {
      console.error('[daily-todo] maintain failed', err)
    }
  }

  /** 供插件外部（命令、设置变更）要求重绘 */
  async refresh(): Promise<void> {
    await this.render()
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer)
    this.refreshTimer = window.setTimeout(() => {
      void this.render()
    }, 180)
  }

  private async render(): Promise<void> {
    if (this.working) return
    const container = this.contentEl
    const scrollTop = container.scrollTop
    container.empty()

    const snapshot = await this.plugin.store.readToday()
    const today = todayKey()
    const pending = snapshot.tasks.filter((x) => !x.done && (!x.due || x.due <= today))
    const queued = snapshot.tasks.filter((x) => !x.done && x.due && x.due > today)
    const done = snapshot.tasks.filter((x) => x.done)

    this.renderHeader(container, pending.length, done.length)
    const body = container.createDiv({ cls: 'dtp-body' })

    if (!snapshot.tasks.length) {
      const empty = body.createDiv({ cls: 'dtp-empty' })
      empty.createDiv({ cls: 'dtp-empty-title', text: t('empty') })
      empty.createDiv({ cls: 'dtp-empty-hint', text: t('emptyHint') })
    }

    if (pending.length) this.renderSection(body, pending, today)
    if (queued.length) this.renderSection(body, queued, today, t('headerQueued'))
    if (this.plugin.settings.showDone && done.length) {
      this.renderSection(body, done, today, t('headerDone'))
    }

    this.renderAddRow(container)
    container.scrollTop = scrollTop
  }

  private renderHeader(container: HTMLElement, pendingCount: number, doneCount: number): void {
    const header = container.createDiv({ cls: 'dtp-header' })
    const titleRow = header.createDiv({ cls: 'dtp-title-row' })
    const date = keyToMoment(todayKey())
    titleRow.createDiv({ cls: 'dtp-date', text: date.format('YYYY-MM-DD') })
    titleRow.createDiv({ cls: 'dtp-weekday', text: date.format('dddd') })

    const actions = titleRow.createDiv({ cls: 'dtp-actions' })
    const extractBtn = actions.createEl('button', { cls: 'dtp-icon-btn', attr: { 'aria-label': t('cmdExtract') } })
    setIcon(extractBtn, 'inbox')
    this.registerDomEvent(extractBtn, 'click', async () => {
      await this.runAction(async () => {
        const res = await this.plugin.store.extractFromWorkLog()
        this.plugin.notify(res.added > 0 ? t('extractHint', res.added) : t('nothingToExtract'))
      })
    })

    const carryBtn = actions.createEl('button', { cls: 'dtp-icon-btn', attr: { 'aria-label': t('cmdCarry') } })
    setIcon(carryBtn, 'arrow-right-left')
    this.registerDomEvent(carryBtn, 'click', async () => {
      await this.runAction(async () => {
        const moved = await this.plugin.store.carryOver()
        this.plugin.notify(moved > 0 ? t('carryHint', moved) : t('nothingToCarry'))
      })
    })

    const stats = header.createDiv({ cls: 'dtp-stats' })
    stats.createSpan({ cls: 'dtp-stat-pending', text: `${pendingCount} ${t('headerPending')}` })
    stats.createSpan({ cls: 'dtp-stat-done', text: `${doneCount} ${t('headerDone')}` })
  }

  private renderSection(container: HTMLElement, tasks: Task[], today: string, label?: string): void {
    const section = container.createDiv({ cls: 'dtp-section' })
    if (label) section.createDiv({ cls: 'dtp-section-label', text: label })
    for (const task of tasks) this.renderItem(section, task, today)
  }

  private renderItem(container: HTMLElement, task: Task, today: string): void {
    const row = container.createDiv({ cls: task.done ? 'dtp-item is-done' : 'dtp-item' })

    const checkbox = row.createEl('input', { type: 'checkbox', cls: 'dtp-check' })
    checkbox.checked = task.done
    checkbox.setAttribute('aria-label', task.body)
    this.registerDomEvent(checkbox, 'change', async () => {
      await this.runAction(async () => {
        await this.plugin.store.toggle(task.line, checkbox.checked)
      })
    })

    const main = row.createDiv({ cls: 'dtp-item-main' })
    main.createDiv({ cls: 'dtp-text', text: task.body })

    const meta = row.createDiv({ cls: 'dtp-item-meta' })
    if (task.due) {
      const cls =
        task.due < today ? 'dtp-due is-overdue' : task.due === today ? 'dtp-due is-today' : 'dtp-due'
      meta.createSpan({ cls, text: task.due === today ? t('dueToday') : task.due })
    }

    const more = row.createEl('button', { cls: 'dtp-icon-btn dtp-more', attr: { 'aria-label': t('defer') } })
    setIcon(more, 'more-horizontal')
    this.registerDomEvent(more, 'click', (evt) => {
      const menu = new Menu()
      const base = moment(today, 'YYYY-MM-DD')
      const options: Array<[string, number]> = [
        [t('defer1'), 1],
        [t('defer3'), 3],
        [t('defer7'), 7],
      ]
      for (const [label, days] of options) {
        menu.addItem((item) =>
          item
            .setTitle(label)
            .setIcon('calendar-clock')
            .onClick(async () => {
              const target = base.clone().add(days, 'days').format('YYYY-MM-DD')
              await this.runAction(async () => {
                await this.plugin.store.defer(task.line, target)
              })
            }),
        )
      }
      if (task.marker) {
        menu.addSeparator()
        menu.addItem((item) =>
          item
            .setTitle(t('undefer'))
            .setIcon('calendar-off')
            .onClick(async () => {
              await this.runAction(async () => {
                await this.plugin.store.defer(task.line, null)
              })
            }),
        )
      }
      menu.showAtMouseEvent(evt)
    })
  }

  private renderAddRow(container: HTMLElement): void {
    const row = container.createDiv({ cls: 'dtp-add' })
    const input = row.createEl('input', {
      type: 'text',
      cls: 'dtp-add-input',
      attr: { placeholder: t('addPlaceholder') },
    })
    const submit = async () => {
      const value = input.value.trim()
      if (!value) return
      input.value = ''
      await this.runAction(async () => {
        await this.plugin.store.addTasks([value])
      })
    }
    this.registerDomEvent(input, 'keydown', (evt: KeyboardEvent) => {
      if (evt.key === 'Enter') {
        evt.preventDefault()
        void submit()
      }
    })
    const button = row.createEl('button', { cls: 'dtp-add-btn', text: t('addButton') })
    this.registerDomEvent(button, 'click', () => void submit())
  }

  private async runAction(fn: () => Promise<void>): Promise<void> {
    this.working = true
    try {
      await fn()
    } catch (err) {
      console.error('[daily-todo] action failed', err)
      this.plugin.notify(t('addFailed', String(err)))
    } finally {
      this.working = false
      await this.render()
    }
  }
}

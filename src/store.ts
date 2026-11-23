import { App, TFile, TFolder, normalizePath } from 'obsidian'
import { moment } from './time'
import type { TodoSettings } from './settings'

export interface Task {
  /** 行号（0 起） */
  line: number
  indent: string
  /** 复选框之后的完整文本，含 @ 标记 */
  text: string
  /** 去掉 @ 标记后的纯任务文本 */
  body: string
  /** 原始 @ 标记（如 @+2d），没有则为空串 */
  marker: string
  /** 解析后的绝对日期 YYYY-MM-DD，没有标记则为 null */
  due: string | null
  done: boolean
}

export interface ListSnapshot {
  file: TFile
  content: string
  lines: string[]
  tasks: Task[]
}

const TASK_RE = /^([ \t]*)[-*+][ \t]+\[([ xX])\][ \t]+(.*)$/
const DUE_RE = /[ \t]+@(\+\d{1,4}d|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}-\d{1,2})[ \t]*$/
const DAY_MS = 86400000

export function todayKey(): string {
  return moment().format('YYYY-MM-DD')
}

export function keyToMoment(key: string) {
  return moment(key, 'YYYY-MM-DD', true)
}

/** 把 @+2d / @11-24 / @2026-12-01 解析成绝对日期 */
export function resolveMarker(marker: string, base = todayKey()): string | null {
  if (!marker) return null
  const raw = marker.replace(/^@/, '')
  const baseDay = keyToMoment(base)
  if (!baseDay.isValid()) return null
  if (/^\+\d+d$/.test(raw)) {
    const n = Number(raw.slice(1, -1))
    return baseDay.clone().add(n, 'days').format('YYYY-MM-DD')
  }
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(raw)) {
    const d = moment(raw, 'YYYY-M-D', true)
    return d.isValid() ? d.format('YYYY-MM-DD') : null
  }
  if (/^\d{1,2}-\d{1,2}$/.test(raw)) {
    const d = moment(`${baseDay.format('YYYY')}-${raw}`, 'YYYY-M-D', true)
    if (!d.isValid()) return null
    // 只写月日时，若已过去则视为明年
    if (d.format('YYYY-MM-DD') < base) d.add(1, 'year')
    return d.format('YYYY-MM-DD')
  }
  return null
}

export function parseTaskLine(line: string, index: number, base = todayKey()): Task | null {
  const m = TASK_RE.exec(line)
  if (!m) return null
  const indent = m[1] ?? ''
  const done = m[2].toLowerCase() === 'x'
  const text = (m[3] ?? '').trimEnd()
  const dueMatch = DUE_RE.exec(text)
  const marker = dueMatch ? `@${dueMatch[1]}` : ''
  const body = dueMatch ? text.slice(0, dueMatch.index).trimEnd() : text
  return {
    line: index,
    indent,
    text,
    body,
    marker,
    due: resolveMarker(marker, base),
    done,
  }
}

export function parseTasks(content: string, base = todayKey()): Task[] {
  const out: Task[] = []
  content.split('\n').forEach((line, i) => {
    const task = parseTaskLine(line, i, base)
    if (task) out.push(task)
  })
  return out
}

function normalizeBody(text: string): string {
  return text
    .replace(DUE_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function formatHeadline(key: string): string {
  const d = keyToMoment(key)
  return `# ${key} ${d.isValid() ? d.format('dddd') : ''}`.trim()
}

async function updateFile(app: App, file: TFile, mutate: (data: string) => string): Promise<void> {
  const vault = app.vault as unknown as {
    process?: (f: TFile, fn: (data: string) => string) => Promise<string>
    read: (f: TFile) => Promise<string>
    modify: (f: TFile, d: string) => Promise<void>
  }
  if (typeof vault.process === 'function') {
    await vault.process(file, mutate)
    return
  }
  const data = await vault.read(file)
  const next = mutate(data)
  if (next !== data) await vault.modify(file, next)
}

export class TodoStore {
  constructor(private app: App, private getSettings: () => TodoSettings) {}

  private get folder(): string {
    return normalizePath(this.getSettings().todoFolder || 'Daily Todo')
  }

  private listPath(key = todayKey()): string {
    return normalizePath(`${this.folder}/${key}.md`)
  }

  keyToMoment(key: string) {
    return keyToMoment(key)
  }

  async ensureFolder(path: string): Promise<void> {
    const parts = normalizePath(path).split('/').filter(Boolean)
    let current = ''
    for (const part of parts) {
      current = current ? `${current}/${part}` : part
      const existing = this.app.vault.getAbstractFileByPath(current)
      if (!existing) {
        try {
          await this.app.vault.createFolder(current)
        } catch (err) {
          // 并发创建时可能已存在，忽略
          if (!this.app.vault.getAbstractFileByPath(current)) throw err
        }
      }
    }
  }

  async ensureToday(): Promise<TFile> {
    await this.ensureFolder(this.folder)
    const path = this.listPath()
    const existing = this.app.vault.getAbstractFileByPath(path)
    if (existing instanceof TFile) return existing
    return this.app.vault.create(path, `${formatHeadline(todayKey())}\n`)
  }

  async readToday(): Promise<ListSnapshot> {
    const file = await this.ensureToday()
    const content = await this.app.vault.read(file)
    return { file, content, lines: content.split('\n'), tasks: parseTasks(content) }
  }

  async readList(file: TFile): Promise<ListSnapshot> {
    const content = await this.app.vault.read(file)
    return { file, content, lines: content.split('\n'), tasks: parseTasks(content, this.keyFromPath(file) ?? todayKey()) }
  }

  private keyFromPath(file: TFile): string | null {
    const m = /(\d{4}-\d{2}-\d{2})\.md$/.exec(file.path)
    return m ? m[1] : null
  }

  /** 文件夹里按日期命名的清单，倒序（最新在前） */
  listFiles(): TFile[] {
    const prefix = `${this.folder}/`
    return this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith(prefix) && /^\d{4}-\d{2}-\d{2}\.md$/.test(f.path.slice(prefix.length)))
      .sort((a, b) => (a.path < b.path ? 1 : -1))
  }

  async toggle(line: number, done: boolean): Promise<void> {
    const file = await this.ensureToday()
    await updateFile(this.app, file, (data) => {
      const lines = data.split('\n')
      if (line < 0 || line >= lines.length) return data
      const m = TASK_RE.exec(lines[line])
      if (!m) return data
      const indent = m[1] ?? ''
      const body = m[3] ?? ''
      lines[line] = `${indent}- [${done ? 'x' : ' '}] ${body}`
      return lines.join('\n')
    })
  }

  async defer(line: number, target: string | null): Promise<void> {
    const file = await this.ensureToday()
    await updateFile(this.app, file, (data) => {
      const lines = data.split('\n')
      if (line < 0 || line >= lines.length) return data
      const m = TASK_RE.exec(lines[line])
      if (!m) return data
      const indent = m[1] ?? ''
      const done = m[2] ?? ' '
      const text = (m[3] ?? '').trimEnd()
      const dueMatch = DUE_RE.exec(text)
      const body = dueMatch ? text.slice(0, dueMatch.index).trimEnd() : text
      const nextText = target ? `${body} @${target}` : body
      lines[line] = `${indent}- [${done}] ${nextText}`
      return lines.join('\n')
    })
  }

  async addTasks(texts: string[]): Promise<void> {
    if (!texts.length) return
    const file = await this.ensureToday()
    await updateFile(this.app, file, (data) => {
      const trailing = data.replace(/\s+$/, '')
      const lastLine = trailing.split('\n').pop() ?? ''
      const isListItem = /^[ \t]*[-*+][ \t]/.test(lastLine)
      const prefix = trailing.length ? (isListItem ? '\n' : '\n\n') : ''
      return `${trailing}${prefix}${texts.map((x) => `- [ ] ${x}`).join('\n')}\n`
    })
  }

  /** 把上一份清单里未完成的任务搬到今天 */
  async carryOver(): Promise<number> {
    const today = todayKey()
    const previous = this.listFiles().find((f) => {
      const key = this.keyFromPath(f)
      return key !== null && key < today
    })
    if (!previous) return 0
    const snapshot = await this.readList(previous)
    const pending = snapshot.tasks.filter((x) => !x.done)
    if (!pending.length) return 0

    const todaySnapshot = await this.readToday()
    const existing = new Set(todaySnapshot.tasks.map((x) => normalizeBody(x.body)))
    const move = pending.filter((x) => !existing.has(normalizeBody(x.body)))
    if (!move.length) return 0

    // 从旧清单移除（只留已完成项作为归档）
    const dropLines = new Set(pending.map((x) => x.line))
    await updateFile(this.app, previous, (data) => {
      const lines = data.split('\n')
      return lines.filter((_, i) => !dropLines.has(i)).join('\n')
    })

    await this.addTasks(move.map((x) => (x.marker ? `${x.body} ${x.marker}` : x.body)))
    return move.length
  }

  /** 从工作日志文件夹提取未完成任务，返回新增条数 */
  async extractFromWorkLog(): Promise<{ added: number; missingFolder: boolean }> {
    const folderPath = normalizePath(this.getSettings().workLogFolder || 'Work Log')
    const folder = this.app.vault.getAbstractFileByPath(folderPath)
    if (!(folder instanceof TFolder)) return { added: 0, missingFolder: true }

    const since = Date.now() - Math.max(1, this.getSettings().lookbackDays) * DAY_MS
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((f) => {
        if (!f.path.startsWith(`${folderPath}/`)) return false
        if (f.path.startsWith(`${this.folder}/`)) return false
        return f.stat.mtime >= since
      })
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, 40)

    // 已出现过（本周清单里的任何状态）不再重复提取，避免完成后又被拉回来
    const seen = new Set<string>()
    for (const f of this.listFiles().slice(0, 30)) {
      const snap = await this.readList(f)
      snap.tasks.forEach((x) => seen.add(normalizeBody(x.body)))
    }

    const added: string[] = []
    for (const f of files) {
      const content = await this.app.vault.read(f)
      const tasks = parseTasks(content)
      for (const task of tasks) {
        if (task.done) continue
        const key = normalizeBody(task.body)
        if (!key || seen.has(key)) continue
        seen.add(key)
        added.push(task.marker ? `${task.body} ${task.marker}` : task.body)
      }
    }
    if (added.length) await this.addTasks(added)
    return { added: added.length, missingFolder: false }
  }
}

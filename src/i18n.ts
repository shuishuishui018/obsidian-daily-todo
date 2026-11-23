import { moment } from './time'

type Dict = Record<string, string>

const zh: Dict = {
  viewTitle: '每日待办',
  ribbon: '打开每日待办',
  cmdOpen: '打开每日待办面板',
  cmdCarry: '结转未完成任务',
  cmdExtract: '从工作日志提取任务',
  headerPending: '待办',
  headerDone: '已完成',
  headerQueued: '排队中',
  empty: '今天还没有任务。',
  emptyHint: '在工作日志里写 - [ ] 任务，或者直接点下面的按钮新建。',
  addPlaceholder: '添加一条任务…',
  addButton: '添加',
  carryHint: '昨天有 {0} 条未完成，已结转到今天。',
  extractHint: '从工作日志提取了 {0} 条任务。',
  nothingToCarry: '没有需要结转的任务。',
  nothingToExtract: '工作日志里没有新的未完成任务。',
  defer: '延后',
  defer1: '延后 1 天',
  defer3: '延后 3 天',
  defer7: '延后 1 周',
  undefer: '取消延后',
  dueToday: '今天到期',
  overdue: '已过期',
  settingsFolder: '清单文件夹',
  settingsFolderDesc: '每日清单保存在这个文件夹里，文件名是当天日期。',
  settingsWorkLog: '工作日志文件夹',
  settingsWorkLogDesc: '从这个文件夹最近的笔记里提取 - [ ] 未完成任务。',
  settingsLookback: '提取回看天数',
  settingsLookbackDesc: '只扫描最近这么多天内修改过的笔记。',
  settingsAutoCarry: '打开面板时自动结转',
  settingsAutoCarryDesc: '把上一次清单里未完成的任务带到今天。',
  settingsShowDone: '显示已完成',
  settingsShowDoneDesc: '在面板底部列出今天已完成的任务。',
  settingsExtractOnOpen: '打开面板时自动提取',
  settingsExtractOnOpenDesc: '把工作日志里新的未完成任务汇入今天。',
  noticeFolderCreated: '已创建文件夹：{0}',
  errorNoWorkLog: '找不到工作日志文件夹：{0}',
  addFailed: '写入失败：{0}',
  sourceFrom: '来自 {0}',
}

const en: Dict = {
  viewTitle: 'Daily Todo',
  ribbon: 'Open daily todo',
  cmdOpen: 'Open daily todo panel',
  cmdCarry: 'Carry over unfinished tasks',
  cmdExtract: 'Extract tasks from work log',
  headerPending: 'To do',
  headerDone: 'Done',
  headerQueued: 'Queued',
  empty: 'Nothing on today\u2019s list yet.',
  emptyHint: 'Write - [ ] items in your work log, or add one below.',
  addPlaceholder: 'Add a task…',
  addButton: 'Add',
  carryHint: 'Carried over {0} unfinished task(s) from your last list.',
  extractHint: 'Pulled {0} task(s) from your work log.',
  nothingToCarry: 'Nothing to carry over.',
  nothingToExtract: 'No new open tasks in your work log.',
  defer: 'Defer',
  defer1: 'Defer 1 day',
  defer3: 'Defer 3 days',
  defer7: 'Defer 1 week',
  undefer: 'Clear deferral',
  dueToday: 'Due today',
  overdue: 'Overdue',
  settingsFolder: 'List folder',
  settingsFolderDesc: 'Daily lists are stored here, one note per day named by date.',
  settingsWorkLog: 'Work log folder',
  settingsWorkLogDesc: 'Open - [ ] tasks are pulled from recent notes in this folder.',
  settingsLookback: 'Look-back days',
  settingsLookbackDesc: 'Only scan notes modified within this many days.',
  settingsAutoCarry: 'Carry over on open',
  settingsAutoCarryDesc: 'Bring unfinished tasks from the previous list into today.',
  settingsShowDone: 'Show completed',
  settingsShowDoneDesc: 'List today\u2019s completed tasks at the bottom of the panel.',
  settingsExtractOnOpen: 'Extract on open',
  settingsExtractOnOpenDesc: 'Pull new open tasks from the work log when the panel opens.',
  noticeFolderCreated: 'Created folder: {0}',
  errorNoWorkLog: 'Work log folder not found: {0}',
  addFailed: 'Could not write: {0}',
  sourceFrom: 'from {0}',
}

function activeDict(): Dict {
  let locale = ''
  try {
    locale = moment.locale() || ''
  } catch {
    locale = ''
  }
  if (!locale) {
    locale = (window.localStorage.getItem('language') || 'en') as string
  }
  return locale.toLowerCase().startsWith('zh') ? zh : en
}

export function t(key: keyof typeof en, ...args: (string | number)[]): string {
  const dict = activeDict()
  let out = dict[key] ?? en[key] ?? String(key)
  args.forEach((v, i) => {
    out = out.replace(`{${i}}`, String(v))
  })
  return out
}

export function isZh(): boolean {
  return activeDict() === zh
}

// 发布 Obsidian 插件：建仓 → 推送 → 打 tag（纯版本号）→ 上传 main.js / manifest.json / styles.css
// 幂等：仓库存在则跳过创建；Release 存在则只补缺失附件
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const OWNER = 'shuishuishui018'
const REPO = 'obsidian-daily-todo'
const FULL = `${OWNER}/${REPO}`

const meta = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'))
const VERSION = meta.version
const TAG = VERSION // Obsidian 要求 tag 与 manifest.version 完全一致，不带 v 前缀
const ASSETS = ['main.js', 'manifest.json', 'styles.css']

function gitEnv() {
  const env = { ...process.env }
  for (const k of ['http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'all_proxy', 'ALL_PROXY']) delete env[k]
  return env
}

function token() {
  const out = execFileSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
    env: gitEnv(),
  })
  return out.split(/\r?\n/).find((l) => l.startsWith('password=')).slice('password='.length)
}

const T = token()

async function api(p, init = {}, raw = false) {
  const res = await fetch(raw ? p : `https://api.github.com${p}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${T}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'obsidian-daily-todo-publish',
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* ignore */
  }
  return { status: res.status, json, text }
}

// 1. 仓库
let r = await api(`/repos/${FULL}`)
if (r.status === 200) {
  console.log(`[1/4] 仓库已存在: ${r.json.html_url}`)
} else {
  r = await api('/user/repos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: REPO,
      description: meta.description,
      private: false,
      has_issues: true,
      has_wiki: false,
      has_projects: false,
      auto_init: false,
    }),
  })
  if (r.status !== 201) {
    console.error(`[1/4] 创建失败 ${r.status}: ${r.json?.message || r.text.slice(0, 300)}`)
    process.exit(1)
  }
  console.log(`[1/4] 仓库已创建: ${r.json.html_url}`)
}

// 2. 推送
const remoteUrl = `https://github.com/${FULL}.git`
const remotes = execFileSync('git', ['remote'], { cwd: root, encoding: 'utf8', env: gitEnv() }).split(/\r?\n/)
if (!remotes.includes('origin')) {
  execFileSync('git', ['remote', 'add', 'origin', remoteUrl], { cwd: root, env: gitEnv() })
} else {
  execFileSync('git', ['remote', 'set-url', 'origin', remoteUrl], { cwd: root, env: gitEnv() })
}
try {
  const out = execFileSync('git', ['push', '-u', 'origin', 'main'], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
    env: gitEnv(),
  })
  console.log('[2/4] 推送成功')
  if (out.trim()) console.log('     ' + out.trim().split('\n').slice(-1)[0])
} catch (err) {
  const detail = (err.stderr || err.message || '').toString()
  if (/Everything up-to-date|up to date/i.test(detail)) {
    console.log('[2/4] 远端已是最新')
  } else {
    console.error('[2/4] 推送失败:\n' + detail.slice(0, 800))
    process.exit(1)
  }
}

// 3. tag
try {
  execFileSync('git', ['tag', '-f', TAG], { cwd: root, env: gitEnv() })
  execFileSync('git', ['push', '-f', 'origin', TAG], { cwd: root, stdio: 'pipe', env: gitEnv() })
  console.log(`[3/4] tag ${TAG} 已推送`)
} catch (err) {
  console.error('[3/4] tag 推送失败:\n' + (err.stderr || err.message).toString().slice(0, 600))
  process.exit(1)
}

// 4. Release + 附件
let rel = await api(`/repos/${FULL}/releases/tags/${TAG}`)
if (rel.status === 200) {
  console.log(`[4/4] Release ${TAG} 已存在`)
} else {
  const body = [
    '## Daily Todo Panel ' + VERSION,
    '',
    '每日清单放进侧边栏，未完成自动结转，可从工作日志提取 `- [ ]` 任务，勾选即写回笔记。',
    '',
    '### 安装',
    '把 `main.js`、`manifest.json`、`styles.css` 放进 `<vault>/.obsidian/plugins/daily-todo-inline/`，然后在设置里启用。',
    '',
    '完整说明见 [README](https://github.com/' + FULL + ')。',
  ].join('\n')
  rel = await api(`/repos/${FULL}/releases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tag_name: TAG,
      target_commitish: 'main',
      name: VERSION,
      body,
      draft: false,
      prerelease: false,
    }),
  })
  if (rel.status !== 201) {
    console.error(`[4/4] 创建 Release 失败 ${rel.status}: ${rel.json?.message || rel.text.slice(0, 300)}`)
    process.exit(1)
  }
  console.log(`[4/4] Release 已创建: ${rel.json.html_url}`)
}

const existing = await api(`/repos/${FULL}/releases/${rel.json.id}/assets`)
const have = new Set((Array.isArray(existing.json) ? existing.json : []).map((a) => a.name))
for (const name of ASSETS) {
  if (have.has(name)) {
    console.log(`      ${name} 已存在，跳过`)
    continue
  }
  const buf = fs.readFileSync(path.join(root, name))
  const up = await api(
    `https://uploads.github.com/repos/${FULL}/releases/${rel.json.id}/assets?name=${encodeURIComponent(name)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(buf.length) },
      body: buf,
    },
    true,
  )
  if (up.status === 201) console.log(`      ${name} 已上传 (${buf.length} B)`)
  else {
    console.error(`      ${name} 上传失败 ${up.status}: ${up.json?.message || up.text.slice(0, 200)}`)
    process.exit(1)
  }
}

console.log(`\n完成: https://github.com/${FULL}/releases/tag/${TAG}`)

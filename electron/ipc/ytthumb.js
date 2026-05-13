/**
 * electron/ipc/ytthumb.js
 * 1. Chrome/Edge のウィンドウタイトルから現在の動画タイトルを取得
 * 2. History バイナリでそのタイトル文字列に隣接する ?v=ID を抽出
 *    → 「最後に訪問した動画」ではなく「今表示中の動画」を正確に特定
 */
const { execFile } = require('child_process')
const { net }      = require('electron')
const fs   = require('fs')
const path = require('path')

let currentThumbUrl  = null
let currentVideoId   = null
let currentTitle     = ''
let currentAuthor    = ''
let currentPageTitle = ''
let pendingTitle     = ''
let ytPlaying        = true   // 再生状態（ローカル管理）

// PowerShell: -EncodedCommand 用に UTF-16LE → Base64 変換（動作確認済み）
function encodePS(script) {
  return Buffer.from(script, 'utf16le').toString('base64')
}
function runPS(script) {
  return new Promise((resolve) => {
    execFile('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
      '-EncodedCommand', encodePS(script),
    ], { timeout: 6000 }, (err, stdout) => resolve(err ? '' : stdout.trim()))
  })
}

// Chrome / Edge のウィンドウタイトルを取得
// YouTube Music を通常 YouTube より優先する
// 日本語タイトルの文字化け防止のため UTF-8 → Base64 で出力
const PS_GET_WINDOW_TITLE = `
$result = ''
foreach ($name in @('chrome','msedge')) {
  $procs = Get-Process $name -ErrorAction SilentlyContinue
  # YouTube Music を優先
  $w = $procs | Where-Object { $_.MainWindowTitle -match 'YouTube Music' } | Select-Object -First 1
  if (-not $w) {
    $w = $procs | Where-Object { $_.MainWindowTitle -match 'YouTube' } | Select-Object -First 1
  }
  if ($w) { $result = $w.MainWindowTitle; break }
}
$bytes = [System.Text.Encoding]::UTF8.GetBytes($result)
Write-Output ([Convert]::ToBase64String($bytes))
`

// ウィンドウタイトルから検索用タイトル文字列を抽出
// 通常YouTube: "動画名 - YouTube - Google Chrome"
// YouTube Music: "曲名 | YouTube Music - Google Chrome"
function extractPageTitle(windowTitle) {
  const cleaned = windowTitle
    .replace(/\s*-\s*Google Chrome\s*$/i, '')
    .replace(/\s*-\s*Microsoft Edge\s*$/i, '')
    .trim()
  // "YouTube" の文字が含まれていれば有効
  if (/YouTube/i.test(cleaned)) return cleaned
  return ''
}

// タイトル文字列からバリエーションを生成（SQLiteの保存形式の揺れに対応）
function titleVariants(pageTitle) {
  const variants = [pageTitle]
  // "| YouTube Music" ↔ "- YouTube Music" の揺れ
  variants.push(pageTitle.replace(/\s*\|\s*/g, ' - '))
  variants.push(pageTitle.replace(/\s*-\s*/g, ' | '))
  // ブラウザ/サービス名を除いたタイトルだけ（短縮版）
  const short = pageTitle.split(/\s*[|\-]\s*/)[0].trim()
  if (short.length > 3) variants.push(short)
  return [...new Set(variants)]  // 重複除去
}

// History バイナリから動画 ID を検索
// titleQuery: SQLite の urls.title に保存されている文字列（例: "動画名 - YouTube"）
// titleQuery が空の場合はファイル末尾の最終マッチで代替
function findVideoIdInHistory(titleQuery) {
  const localAppData = process.env.LOCALAPPDATA ||
    path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Local')

  const browserBases = [
    path.join(localAppData, 'Google', 'Chrome', 'User Data'),
    path.join(localAppData, 'Microsoft', 'Edge', 'User Data'),
    path.join(localAppData, 'Google', 'Chrome SxS', 'User Data'),
    path.join(localAppData, 'Google', 'Chrome Beta', 'User Data'),
  ]

  const ID_PAT  = /[?&]v=([a-zA-Z0-9_-]{11})/g
  const READ_SIZE = 5 * 1024 * 1024
  let matchId  = ''  // タイトルに一致したID（これだけ使う）

  for (const udBase of browserBases) {
    try { fs.accessSync(udBase) } catch { continue }

    const profiles = ['Default']
    try {
      for (const e of fs.readdirSync(udBase)) {
        if (/^Profile /i.test(e)) profiles.push(e)
      }
    } catch {}

    for (const prof of profiles) {
      for (const fname of ['History', 'History-wal']) {
        const histPath = path.join(udBase, prof, fname)
        try {
          const stat = fs.statSync(histPath)
          if (stat.size === 0) continue
          const readLen = Math.min(stat.size, READ_SIZE)
          const offset  = stat.size > READ_SIZE ? stat.size - READ_SIZE : 0
          const buf     = Buffer.alloc(readLen)
          const fd = fs.openSync(histPath, 'r')
          const { bytesRead } = fs.readSync(fd, buf, 0, readLen, offset)
          fs.closeSync(fd)
          const text = buf.slice(0, bytesRead).toString('utf8')

          // ── タイトル検索: タイトル文字列に隣接する ?v=ID を取得 ──
          // タイトルが指定されている場合は必ずタイトルマッチのみ使用
          // （URLパターン検索は古いIDを返す恐れがあるため使わない）
          if (titleQuery && !matchId) {
            for (const variant of titleVariants(titleQuery)) {
              const idx = text.indexOf(variant)
              if (idx >= 0) {
                const win = text.substring(
                  Math.max(0, idx - 400),
                  Math.min(text.length, idx + variant.length + 400)
                )
                const tm = /[?&]v=([a-zA-Z0-9_-]{11})/.exec(win)
                if (tm) { matchId = tm[1]; break }
              }
            }
          }
        } catch {}
      }
    }
  }

  return matchId
}

// YouTube oEmbed API でタイトル・チャンネル名を取得（APIキー不要）
function fetchYtMeta(videoId) {
  return new Promise((resolve) => {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch%3Fv%3D${videoId}&format=json`
    try {
      const req = net.request(url)
      let body = ''
      req.on('response', (res) => {
        res.on('data', (chunk) => { body += chunk.toString() })
        res.on('end', () => {
          try {
            const json = JSON.parse(body)
            resolve({ title: json.title || '', author: json.author_name || '' })
          } catch { resolve({ title: '', author: '' }) }
        })
      })
      req.on('error', () => resolve({ title: '', author: '' }))
      req.end()
    } catch { resolve({ title: '', author: '' }) }
  })
}

// ウィンドウタイトルから表示用タイトルを生成
function cleanTitle(pageTitle) {
  return pageTitle
    .replace(/\s*[-|]\s*YouTube Music\s*$/i, '')
    .replace(/\s*-\s*YouTube\s*$/i, '')
    .trim()
}

async function poll() {
  try {
    // 1. ウィンドウタイトルを取得（高速・リアルタイム）
    const b64       = await runPS(PS_GET_WINDOW_TITLE)
    const winTitle  = b64 ? Buffer.from(b64, 'base64').toString('utf8') : ''
    const pageTitle = winTitle ? extractPageTitle(winTitle) : ''

    // 2. タイトルが変わったら即座に反映（サムネは後から追いかける）
    if (pageTitle && pageTitle !== currentPageTitle) {
      currentPageTitle = pageTitle
      currentTitle     = cleanTitle(pageTitle)
      currentAuthor    = ''
      currentThumbUrl  = null
      currentVideoId   = null
      pendingTitle     = pageTitle
      ytPlaying        = true   // 曲が変わったら再生中にリセット
      console.log('[ytthumb] title changed:', currentTitle)
    }

    // 3. 未確定のタイトルがある場合、History から動画 ID を探す
    if (pendingTitle) {
      const id = findVideoIdInHistory(pendingTitle)
      console.log('[ytthumb] videoId:', id || '(none)')
      if (id) {
        currentVideoId  = id
        currentThumbUrl = `https://img.youtube.com/vi/${id}/maxresdefault.jpg`
        pendingTitle    = ''  // ID 確定 → 追跡終了
        console.log('[ytthumb] thumb set:', currentThumbUrl)

        // oEmbed はアーティスト名だけ取得（タイトルはウィンドウタイトルが正確）
        fetchYtMeta(id).then(({ author }) => {
          if (author) currentAuthor = author
          console.log('[ytthumb] author:', author)
        })
      }
      // ID未確定の場合は次のポーリングで再試行（Historyが更新されるまで待つ）
    }
  } catch (e) {
    console.error('[ytthumb] error:', e.message)
  }
}

function register() {
  poll()
  setInterval(poll, 2000)  // 2秒ごと（曲変更の即時検知）
}

function getYtThumb()    { return currentThumbUrl }
function getYtTitle()    { return currentTitle }
function getYtAuthor()   { return currentAuthor }
function getYtStatus()   { return ytPlaying ? 'Playing' : 'Paused' }
function toggleYtPlaying() { ytPlaying = !ytPlaying }
// タイトルまたはサムネのいずれかがある = YouTube 再生中
function isYtActive()    { return !!(currentTitle || currentThumbUrl) }

function clearYtThumb() {
  currentThumbUrl  = null
  currentVideoId   = null
  currentTitle     = ''
  currentAuthor    = ''
  currentPageTitle = ''
  pendingTitle     = ''
}

module.exports = { register, getYtThumb, getYtTitle, getYtAuthor, getYtStatus, toggleYtPlaying, isYtActive, clearYtThumb }

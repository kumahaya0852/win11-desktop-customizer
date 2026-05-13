/**
 * electron/ipc/ytthumb.js
 * ChromeのHistoryおよびセッションファイルをバイナリサーチして
 * YouTubeの動画IDを自動検出する。拡張・フラグ不要。
 */
const { execFile } = require('child_process')

let currentThumbUrl = null
let currentVideoId  = null

// PowerShell: -EncodedCommand 用に UTF-16LE → Base64 変換
function encodePS(script) {
  return Buffer.from(script, 'utf16le').toString('base64')
}

function runPS(script) {
  return new Promise((resolve) => {
    execFile('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
      '-EncodedCommand', encodePS(script),
    ], { timeout: 15000 }, (err, stdout) => resolve(err ? '' : stdout.trim()))
  })
}

// Step1: ChromeにYouTubeウィンドウがあるか確認
const PS_CHECK_YT_WINDOW = `
$w = Get-Process chrome -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowTitle -match 'YouTube' } |
  Select-Object -First 1
if ($w) { Write-Output 'yes' } else { Write-Output 'no' }
`

// デバッグ: ファイルの状態を詳しく調べて原因を特定する
const PS_DEBUG = `
$log = @()
$udBase = Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data'
$histPath = Join-Path $udBase 'Default\History'
$log += 'hist_exists:' + (Test-Path $histPath).ToString()
if (Test-Path $histPath) {
  try {
    $fi = Get-Item $histPath
    $log += 'hist_size:' + $fi.Length.ToString()
    $fs = [System.IO.File]::Open($histPath, 'Open', 'Read', 'ReadWrite')
    $size = $fs.Length
    $readLen = [math]::Min($size, 3000000)
    $bytes = New-Object byte[] $readLen
    if ($size -gt 3000000) { [void]$fs.Seek(($size - 3000000), [System.IO.SeekOrigin]::Begin) }
    $actual = $fs.Read($bytes, 0, $readLen)
    $fs.Close()
    $text = [System.Text.Encoding]::UTF8.GetString($bytes, 0, $actual)
    $log += 'hist_open:ok'
    $log += 'has_yt:' + ($text -match 'youtube').ToString()
    $log += 'has_watch:' + ($text -match 'youtube\.com/watch').ToString()
    $pat = [regex]'[?&]v=([a-zA-Z0-9_-]{11})'
    $ms = $pat.Matches($text)
    $log += 'vid_count:' + $ms.Count.ToString()
    if ($ms.Count -gt 0) { $log += 'last_vid:' + $ms[$ms.Count-1].Groups[1].Value }
  } catch {
    $log += 'hist_err:' + $_.Exception.Message
  }
} else {
  $log += 'hist_open:not_found'
}
$sessPath = Join-Path $udBase 'Default\Current Session'
$log += 'sess_exists:' + (Test-Path $sessPath).ToString()
if (Test-Path $sessPath) {
  try {
    $fi2 = Get-Item $sessPath
    $log += 'sess_size:' + $fi2.Length.ToString()
    $fs2 = [System.IO.File]::Open($sessPath, 'Open', 'Read', 'ReadWrite')
    $bytes2 = New-Object byte[] $fs2.Length
    [void]$fs2.Read($bytes2, 0, $bytes2.Length)
    $fs2.Close()
    $t8  = [System.Text.Encoding]::UTF8.GetString($bytes2)
    $t16 = [System.Text.Encoding]::Unicode.GetString($bytes2)
    $log += 'sess_yt_utf8:'  + ($t8  -match 'youtube').ToString()
    $log += 'sess_yt_utf16:' + ($t16 -match 'youtube').ToString()
    $pat2 = [regex]'[?&]v=([a-zA-Z0-9_-]{11})'
    $m16 = $pat2.Matches($t16)
    $log += 'sess_vid_utf16:' + $m16.Count.ToString()
    if ($m16.Count -gt 0) { $log += 'sess_id:' + $m16[$m16.Count-1].Groups[1].Value }
  } catch {
    $log += 'sess_err:' + $_.Exception.Message
  }
}
Write-Output ($log -join '|')
`

// Step3a: HistoryファイルからYouTube動画IDを抽出（SQLite = UTF-8テキスト）
const PS_GET_VIDEO_ID_HISTORY = `
$pat = [regex]'[?&]v=([a-zA-Z0-9_-]{11})'
$lastId = ''
$udBase = Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data'
$profiles = @('Default')
if (Test-Path $udBase) {
  $extra = Get-ChildItem $udBase -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^Profile ' } |
    Select-Object -ExpandProperty Name
  if ($extra) { $profiles += $extra }
}
foreach ($prof in $profiles) {
  $histPath = Join-Path $udBase "$prof\History"
  if (-not (Test-Path $histPath)) { continue }
  try {
    $size = (Get-Item $histPath).Length
    $readLen = [math]::Min($size, 5000000)
    $fs = [System.IO.File]::Open($histPath, 'Open', 'Read', 'ReadWrite')
    $bytes = New-Object byte[] $readLen
    if ($size -gt 5000000) { [void]$fs.Seek(($size - 5000000), [System.IO.SeekOrigin]::Begin) }
    $actual = $fs.Read($bytes, 0, $readLen)
    $fs.Close()
    $text = [System.Text.Encoding]::UTF8.GetString($bytes, 0, $actual)
    $ms = $pat.Matches($text)
    if ($ms.Count -gt 0) { $lastId = $ms[$ms.Count-1].Groups[1].Value }
  } catch {}
}
Write-Output $lastId
`

// Step3b: セッションファイルからYouTube動画IDを抽出（UTF-16LE）
const PS_GET_VIDEO_ID_SESSION = `
$pat = [regex]'[?&]v=([a-zA-Z0-9_-]{11})'
$lastId = ''
$udBase = Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data'
$profiles = @('Default')
if (Test-Path $udBase) {
  $extra = Get-ChildItem $udBase -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^Profile ' } |
    Select-Object -ExpandProperty Name
  if ($extra) { $profiles += $extra }
}
foreach ($prof in $profiles) {
  $base = Join-Path $udBase $prof
  $candidates = @()
  foreach ($name in @('Current Session','Current Tabs')) {
    $p = Join-Path $base $name
    if (Test-Path $p) { $candidates += $p }
  }
  $sessDir = Join-Path $base 'Sessions'
  if (Test-Path $sessDir) {
    $candidates += Get-ChildItem $sessDir -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 3 -ExpandProperty FullName
  }
  foreach ($path in $candidates) {
    try {
      $fs = [System.IO.File]::Open($path, 'Open', 'Read', 'ReadWrite')
      $bytes = New-Object byte[] $fs.Length
      [void]$fs.Read($bytes, 0, $bytes.Length)
      $fs.Close()
      $text = [System.Text.Encoding]::Unicode.GetString($bytes)
      $ms = $pat.Matches($text)
      if ($ms.Count -gt 0) { $lastId = $ms[$ms.Count-1].Groups[1].Value }
    } catch {}
  }
}
Write-Output $lastId
`

// デバッグモード: 初回のみ詳細ログを出す
let debugDone = false

async function poll() {
  try {
    // ChromeにYouTubeタブがなければスキップ
    const hasYt = await runPS(PS_CHECK_YT_WINDOW)
    if (hasYt !== 'yes') {
      console.log('[ytthumb] YouTube window not found')
      return
    }

    // 初回のみデバッグ情報を出力して原因特定
    if (!debugDone) {
      debugDone = true
      const dbg = await runPS(PS_DEBUG)
      console.log('[ytthumb] DEBUG:', dbg)
    }

    // まずHistoryファイル（SQLite/UTF-8）を試す
    let id = (await runPS(PS_GET_VIDEO_ID_HISTORY)).trim()
    console.log('[ytthumb] History result:', id || '(none)')

    // HistoryでIDが取れなければSessionファイル（UTF-16LE）を試す
    if (!id) {
      id = (await runPS(PS_GET_VIDEO_ID_SESSION)).trim()
      console.log('[ytthumb] Session result:', id || '(none)')
    }

    if (id && id !== currentVideoId) {
      currentVideoId  = id
      currentThumbUrl = `https://img.youtube.com/vi/${id}/maxresdefault.jpg`
      console.log('[ytthumb] thumb set:', currentThumbUrl)
    }
  } catch (e) {
    console.error('[ytthumb] error:', e.message)
  }
}

function register() {
  poll()
  setInterval(poll, 4000)
}

function getYtThumb()   { return currentThumbUrl }
function clearYtThumb() { currentThumbUrl = null; currentVideoId = null }

module.exports = { register, getYtThumb, clearYtThumb }

/**
 * electron/ipc/ytthumb.js
 * Chrome / Edge の History ファイルをバイナリサーチして
 * YouTube の動画 ID を自動検出する。拡張・フラグ不要。
 *
 * SQLite History ファイルは URL を UTF-8 テキストとして保存しているため
 * バイナリを UTF-8 デコードして正規表現で抽出できる。
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

// Step1: Chrome または Edge に YouTube タブがあるか確認
const PS_CHECK_YT_WINDOW = `
$procs = @('chrome','msedge')
$found = $false
foreach ($name in $procs) {
  $w = Get-Process $name -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -match 'YouTube' } |
    Select-Object -First 1
  if ($w) { $found = $true; break }
}
if ($found) { Write-Output 'yes' } else { Write-Output 'no' }
`

// Step2: Chrome / Edge の History から YouTube 動画 ID を抽出
// SQLite の History ファイルは URL を UTF-8 テキストとして保存している
const PS_GET_VIDEO_ID = `
$pat = [regex]'[?&]v=([a-zA-Z0-9_-]{11})'
$lastId = ''

# 検索対象ブラウザのベースパス一覧
$bases = @(
  (Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data'),
  (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\User Data'),
  (Join-Path $env:LOCALAPPDATA 'Google\Chrome SxS\User Data'),
  (Join-Path $env:LOCALAPPDATA 'Google\Chrome Beta\User Data')
)

foreach ($udBase in $bases) {
  if (-not (Test-Path $udBase)) { continue }

  # Default + Profile N を全チェック
  $profiles = @('Default')
  $extra = Get-ChildItem $udBase -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match '^Profile ' } |
    Select-Object -ExpandProperty Name
  if ($extra) { $profiles += $extra }

  foreach ($prof in $profiles) {
    $histPath = Join-Path $udBase "$prof\History"
    if (-not (Test-Path $histPath)) { continue }
    try {
      $size = (Get-Item $histPath).Length
      $readLen = [math]::Min($size, 5000000)
      $fs = [System.IO.File]::Open($histPath, 'Open', 'Read', 'ReadWrite')
      $bytes = New-Object byte[] $readLen
      if ($size -gt 5000000) {
        [void]$fs.Seek(($size - 5000000), [System.IO.SeekOrigin]::Begin)
      }
      $actual = $fs.Read($bytes, 0, $readLen)
      $fs.Close()
      $text = [System.Text.Encoding]::UTF8.GetString($bytes, 0, $actual)
      $ms = $pat.Matches($text)
      if ($ms.Count -gt 0) {
        $lastId = $ms[$ms.Count-1].Groups[1].Value
      }
    } catch {}
  }
}
Write-Output $lastId
`

async function poll() {
  try {
    // Chrome / Edge に YouTube タブがなければスキップ
    const hasYt = await runPS(PS_CHECK_YT_WINDOW)
    if (hasYt !== 'yes') {
      console.log('[ytthumb] YouTube window not found')
      return
    }

    const id = (await runPS(PS_GET_VIDEO_ID)).trim()
    console.log('[ytthumb] videoId:', id || '(none)')

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

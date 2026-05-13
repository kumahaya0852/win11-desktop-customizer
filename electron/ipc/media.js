/**
 * electron/ipc/media.js
 * Windows SMTC (System Media Transport Controls) IPC ハンドラ
 * - タイトル・アーティスト・再生状態・タイムライン（位置/長さ）
 * - サムネイル（曲変更時のみ取得してキャッシュ）
 */
const { execFile }        = require('child_process')
const { desktopCapturer } = require('electron')
const { getYtThumb, getYtTitle, getYtAuthor, getYtStatus, toggleYtPlaying, isYtActive } = require('./ytthumb')

function runPS(script) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
      '-Command', script,
    ], { timeout: 8000 }, (err, stdout) => {
      if (err) reject(err)
      else resolve(stdout.trim())
    })
  })
}

const PS_INIT = `
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media,ContentType=WindowsRuntime]
$_mgr = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync().GetAwaiter().GetResult()
$_s   = $_mgr.GetCurrentSession()
`

// 基本情報（軽量・毎回取得）
const PS_GET_INFO = `
try {
  ${PS_INIT}
  if (-not $_s) { Write-Output '{"ok":false}'; exit }
  $p  = $_s.TryGetMediaPropertiesAsync().GetAwaiter().GetResult()
  $pb = $_s.GetPlaybackInfo()
  $pos = 0; $dur = 0
  try {
    $tl  = $_s.GetTimelineProperties()
    $pos = [math]::Round($tl.Position.TotalSeconds)
    $dur = [math]::Round($tl.EndTime.TotalSeconds)
  } catch {}
  [PSCustomObject]@{
    ok       = $true
    title    = if ($p.Title)  { $p.Title  } else { '' }
    artist   = if ($p.Artist) { $p.Artist } else { '' }
    status   = $pb.PlaybackStatus.ToString()
    app      = $_s.SourceAppUserModelId
    position = $pos
    duration = $dur
  } | ConvertTo-Json -Compress
} catch { Write-Output '{"ok":false}' }
`

// サムネイル（重いので曲変更時のみ）
const PS_GET_THUMB = `
try {
  ${PS_INIT}
  if (-not $_s) { Write-Output ''; exit }
  $p = $_s.TryGetMediaPropertiesAsync().GetAwaiter().GetResult()
  if (-not $p.Thumbnail) { Write-Output ''; exit }
  $sr = $p.Thumbnail.OpenReadAsync().GetAwaiter().GetResult()
  $ms = [System.IO.MemoryStream]::new()
  $sr.AsStreamForRead().CopyTo($ms)
  Write-Output ([Convert]::ToBase64String($ms.ToArray()))
} catch { Write-Output '' }
`

function psAction(method) {
  return `
try {
  ${PS_INIT}
  if ($_s) { $_s.${method}().GetAwaiter().GetResult() | Out-Null }
} catch {}`
}

// サムネイルキャッシュ（曲が変わった時だけ再取得）
let thumbCache = { key: null, data: null, fetching: false }

function register(ipcMain) {
  ipcMain.handle('media:getInfo', async () => {
    try {
      const out  = await runPS(PS_GET_INFO)
      const info = JSON.parse(out || '{"ok":false}')

      // ytThumbは ok:false でも確認する（YouTubeはSMTCに出ないことがある）
      const ytThumb = getYtThumb()

      if (!info.ok) {
        thumbCache = { key: null, data: null, fetching: false }
        // YouTube Music / YouTube 再生中（サムネ取得中でもタイトルがあれば表示）
        if (isYtActive()) {
          return { ok: true,
                   title:     getYtTitle()  || '（取得中...）',
                   artist:    getYtAuthor() || 'YouTube Music',
                   status:    'Playing',
                   position:  0, duration: 0,
                   thumbnail: ytThumb || null,
                   fromYT:    true }
        }
        return info
      }

      // YouTube / YouTube Music が再生中なら SMTC を無視して YT データを使う
      if (isYtActive()) {
        return { ok: true,
                 title:     getYtTitle()  || info.title  || '（取得中...）',
                 artist:    getYtAuthor() || info.artist || 'YouTube Music',
                 status:    getYtStatus(),
                 position:  info.position,
                 duration:  info.duration,
                 thumbnail: ytThumb || null,
                 fromYT:    true }
      }

      // それ以外はSMTCサムネ（Spotify等）
      const key = `${info.title}|${info.artist}`
      if (key === thumbCache.key) {
        // キャッシュ済み
        info.thumbnail = thumbCache.data
      } else if (!thumbCache.fetching) {
        // バックグラウンドで取得開始（今回は前の曲のサムネイルを返す）
        thumbCache.fetching = true
        thumbCache.key      = key
        thumbCache.data     = null
        runPS(PS_GET_THUMB).then(b64 => {
          thumbCache.data     = b64 && b64.length > 100 ? `data:image/jpeg;base64,${b64}` : null
          thumbCache.fetching = false
        }).catch(() => { thumbCache.fetching = false })
      }
      info.thumbnail = thumbCache.data
      return info
    } catch {
      return { ok: false }
    }
  })

  // メディアキー送信（YouTube Music など SMTC 非対応アプリ用）
  // VK_MEDIA_PLAY_PAUSE=0xB3 / VK_MEDIA_NEXT_TRACK=0xB0 / VK_MEDIA_PREV_TRACK=0xB1
  function sendMediaKey(vk) {
    const script = `
Add-Type -TypeDefinition @"
using System.Runtime.InteropServices;
public class MK {
  [DllImport("user32.dll")] public static extern void keybd_event(byte v,byte s,int f,int e);
  public static void Press(byte v){keybd_event(v,0,0,0);keybd_event(v,0,2,0);}
}
"@
[MK]::Press(${vk})
`
    return runPS(script).catch(() => {})
  }

  ipcMain.handle('media:toggle', async () => {
    if (isYtActive()) {
      toggleYtPlaying()        // UI 状態を即反映
      return sendMediaKey(0xB3)
    }
    return runPS(psAction('TryTogglePlayPauseAsync')).catch(() => {})
  })
  ipcMain.handle('media:next', async () => {
    if (isYtActive()) return sendMediaKey(0xB0)
    return runPS(psAction('TrySkipNextAsync')).catch(() => {})
  })
  ipcMain.handle('media:prev', async () => {
    if (isYtActive()) return sendMediaKey(0xB1)
    return runPS(psAction('TrySkipPreviousAsync')).catch(() => {})
  })

  ipcMain.handle('desktopCapturer:getSources', async () => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'] })
      return sources.map(s => ({ id: s.id, name: s.name }))
    } catch { return [] }
  })
}

module.exports = { register }

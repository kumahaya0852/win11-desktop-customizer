/**
 * ipc/theme.js  (Phase 4 fix)
 * theme:apply を受け取ったウィンドウ以外にだけ theme:changed を送る。
 * 送信元に折り返すと renderer で二重適用が起きるため除外する。
 */

const path = require('path')
const fs   = require('fs')
const { execSync } = require('child_process')
const isWin = process.platform === 'win32'

const THEMES_DIR = path.join(__dirname, '../../config/themes')
let activeTheme = null

function applyAccentColor(hexColor) {
  if (!isWin || !hexColor) return
  try {
    const r = parseInt(hexColor.slice(1, 3), 16)
    const g = parseInt(hexColor.slice(3, 5), 16)
    const b = parseInt(hexColor.slice(5, 7), 16)
    const abgr = `0xFF${b.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${r.toString(16).padStart(2,'0')}`
    execSync(
      `reg add "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Accent" /v AccentColor /t REG_DWORD /d ${abgr} /f`,
      { windowsHide: true, timeout: 5000 }
    )
  } catch { /* 権限エラーは無視 */ }
}

function register(ipcMain) {

  ipcMain.handle('theme:list', async () => {
    try {
      if (!fs.existsSync(THEMES_DIR)) return []
      return fs.readdirSync(THEMES_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => { try { return JSON.parse(fs.readFileSync(path.join(THEMES_DIR, f), 'utf8')) } catch { return null } })
        .filter(Boolean)
    } catch { return [] }
  })

  ipcMain.handle('theme:save', async (_, theme) => {
    try {
      if (!fs.existsSync(THEMES_DIR)) fs.mkdirSync(THEMES_DIR, { recursive: true })
      fs.writeFileSync(path.join(THEMES_DIR, `${theme.id}.json`), JSON.stringify(theme, null, 2), 'utf8')
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('theme:apply', async (event, theme) => {
    activeTheme = theme

    // Windowsアクセントカラーをレジストリに書き込む
    if (theme.accentColor && theme.applyToSystem) {
      applyAccentColor(theme.accentColor)
    }

    // ★ 送信元ウィンドウ以外にだけ theme:changed を送る
    //   （送信元は renderer 側で既に applyCSSVars 済みなので不要）
    const { BrowserWindow } = require('electron')
    const senderWin = BrowserWindow.fromWebContents(event.sender)
    BrowserWindow.getAllWindows().forEach(win => {
      if (win !== senderWin) {
        win.webContents.send('theme:changed', theme)
      }
    })

    return { ok: true }
  })

  ipcMain.handle('theme:getActive', async () => activeTheme)
}

module.exports = { register }

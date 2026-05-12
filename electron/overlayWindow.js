const { BrowserWindow, screen } = require('electron')
const { execFile } = require('child_process')
const path = require('path')
const isDev = process.env.NODE_ENV === 'development'
const isWin = process.platform === 'win32'

let overlayWin   = null
let editMode     = false
let currentLevel = 'bottom'

function psEncode(script) {
  return Buffer.from(script, 'utf16le').toString('base64')
}

function setWindowPos(hwnd, insertAfter) {
  if (!isWin || !hwnd) return
  const script = `
Add-Type @"
using System;using System.Runtime.InteropServices;
public class WP{[DllImport("user32.dll")]public static extern bool SetWindowPos(IntPtr h,IntPtr i,int x,int y,int cx,int cy,uint f);}
"@
[WP]::SetWindowPos([IntPtr]${hwnd},[IntPtr]${insertAfter},0,0,0,0,0x13)
`.trim()
  execFile('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', psEncode(script)],
    { windowsHide: true, timeout: 3000 }, () => {}
  )
}

function getHwnd(win) {
  if (!win || win.isDestroyed()) return null
  const buf = win.getNativeWindowHandle()
  if (!buf) return null
  try { return buf.readBigInt64LE(0).toString() }
  catch { try { return buf.readInt32LE(0).toString() } catch { return null } }
}

function applyLevel(win, level) {
  if (!win || win.isDestroyed()) return
  const hwnd = getHwnd(win)
  if (level === 'bottom') {
    win.setAlwaysOnTop(false)
    if (hwnd) setWindowPos(hwnd, '1')
  } else if (level === 'top') {
    win.setAlwaysOnTop(true, 'screen-saver')
    if (hwnd) setWindowPos(hwnd, '-1')
  } else {
    win.setAlwaysOnTop(false)
  }
}

function createOverlay() {
  if (overlayWin && !overlayWin.isDestroyed()) return overlayWin

  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  overlayWin = new BrowserWindow({
    width, height, x: 0, y: 0,
    transparent:  true,
    frame:        false,
    alwaysOnTop:  false,
    skipTaskbar:  true,
    resizable:    false,
    movable:      false,
    focusable:    false,
    hasShadow:    false,
    show:         false,
    opacity:      0,
    type:         'toolbar',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  })

  overlayWin.once('ready-to-show', () => {
    overlayWin?.show()
    applyLevel(overlayWin, currentLevel)
    setTimeout(() => {
      if (!overlayWin || overlayWin.isDestroyed()) return
      overlayWin.setOpacity(1)
    }, 400)
  })

  overlayWin.setIgnoreMouseEvents(true, { forward: true })

  if (isDev) {
    overlayWin.loadURL('http://localhost:5173/overlay.html')
  } else {
    overlayWin.loadFile(path.join(__dirname, '../dist/overlay.html'))
  }

  // ★ オーバーレイ用 DevTools（デバッグ用）
  if (isDev) {
    overlayWin.webContents.openDevTools({ mode: 'detach' })
  }

  overlayWin.on('closed', () => { overlayWin = null; editMode = false })

  screen.on('display-metrics-changed', () => {
    if (!overlayWin || overlayWin.isDestroyed()) return
    const { width: w, height: h } = screen.getPrimaryDisplay().workAreaSize
    overlayWin.setBounds({ x: 0, y: 0, width: w, height: h })
    if (currentLevel === 'bottom') {
      setTimeout(() => applyLevel(overlayWin, 'bottom'), 200)
    }
  })

  return overlayWin
}

function destroyOverlay() {
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.close()
  overlayWin = null
  editMode   = false
}

function isOverlayVisible() {
  return !!(overlayWin && !overlayWin.isDestroyed())
}

function setEditMode(enabled) {
  editMode = enabled
  if (!overlayWin || overlayWin.isDestroyed()) return
  if (enabled) {
    overlayWin.setAlwaysOnTop(false)
    overlayWin.setIgnoreMouseEvents(false)
    overlayWin.setFocusable(true)
    overlayWin.focus()
  } else {
    overlayWin.setIgnoreMouseEvents(true, { forward: true })
    overlayWin.setFocusable(false)
    setTimeout(() => applyLevel(overlayWin, currentLevel), 150)
  }
  overlayWin.webContents.send('overlay:editMode', enabled)
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed() && win !== overlayWin) {
      win.webContents.send('overlay:editMode', enabled)
    }
  })
}

function syncWidgets(layout) {
  if (!overlayWin || overlayWin.isDestroyed()) return
  overlayWin.webContents.send('overlay:syncWidgets', layout, currentLevel)
}

function syncTheme(theme) {
  if (!overlayWin || overlayWin.isDestroyed()) return
  overlayWin.webContents.send('theme:changed', theme)
}

function register(ipcMain) {

  ipcMain.handle('overlay:show', async () => {
    createOverlay()
    await new Promise(resolve => {
      if (!overlayWin || overlayWin.isDestroyed()) { resolve(); return }
      if (overlayWin.webContents.isLoading()) {
        overlayWin.webContents.once('did-finish-load', resolve)
      } else { resolve() }
    })
    return { ok: true }
  })

  ipcMain.handle('overlay:hide', () => {
    destroyOverlay()
    return { ok: true }
  })

  ipcMain.handle('overlay:isVisible', () => isOverlayVisible())

  ipcMain.handle('overlay:setEditMode', (_, enabled) => {
    setEditMode(enabled)
    return { ok: true, editMode: enabled }
  })

  ipcMain.handle('overlay:syncWidgets', (_, layout) => {
    syncWidgets(layout)
    return { ok: true }
  })

  ipcMain.handle('overlay:setLevel', (_, level) => {
    if (!['bottom', 'normal', 'top', 'custom'].includes(level)) {
      return { ok: false, error: `invalid level: ${level}` }
    }
    currentLevel = level
    if (overlayWin && !overlayWin.isDestroyed() && level !== 'custom') {
      applyLevel(overlayWin, level)
    }
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed() && win !== overlayWin) {
        win.webContents.send('overlay:levelChanged', level)
      }
    })
    return { ok: true, level }
  })

  ipcMain.handle('overlay:getLevel', () => currentLevel)

  ipcMain.on('overlay:widgetMoved', (_, payload) => {
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed() && win !== overlayWin) {
        win.webContents.send('overlay:widgetMoved', payload)
      }
    })
  })
}

module.exports = {
  register, createOverlay, destroyOverlay,
  isOverlayVisible, setEditMode, syncWidgets, syncTheme,
}

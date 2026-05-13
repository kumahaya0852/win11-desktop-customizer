const { BrowserWindow, screen } = require('electron')
const { execFile } = require('child_process')
const path = require('path')
const isDev = process.env.NODE_ENV === 'development'
const isWin = process.platform === 'win32'

// ウィジェット個別ウィンドウ管理（循環依存なし）
const widgetWindows = require('./widgetWindows')

let overlayWin   = null
let editBarWin   = null   // 編集バー専用の小ウィンドウ（常時クリック可能）
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

  // 常にクリックスルー（編集バーは別ウィンドウで担当）
  overlayWin.setIgnoreMouseEvents(true, { forward: true })

  if (isDev) {
    overlayWin.loadURL('http://localhost:5173/overlay.html')
  } else {
    overlayWin.loadFile(path.join(__dirname, '../dist/overlay.html'))
  }

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

// ── 編集バー専用ウィンドウ ─────────────────────────────────
// 小さな専用ウィンドウで常時 setIgnoreMouseEvents(false) → 非同期トグル不要
function createEditBarWindow() {
  if (editBarWin && !editBarWin.isDestroyed()) return editBarWin

  const { workAreaSize } = screen.getPrimaryDisplay()
  const barW = 360, barH = 50

  editBarWin = new BrowserWindow({
    width:  barW,
    height: barH,
    x: Math.round((workAreaSize.width - barW) / 2),
    y: 14,
    transparent: true,
    frame:       false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable:   false,
    movable:     false,
    focusable:   true,
    hasShadow:   false,
    show:        false,   // ready-to-show 後に show() + setIgnoreMouseEvents を確実に適用
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  })

  // screen-saver レベルに昇格
  editBarWin.setAlwaysOnTop(true, 'screen-saver')

  // ウィンドウが完全に準備できてから setIgnoreMouseEvents(false) を適用する
  // (transparent + WS_EX_LAYERED の状態で早期に呼ぶと Windows が無視することがある)
  editBarWin.once('ready-to-show', () => {
    if (!editBarWin || editBarWin.isDestroyed()) return
    editBarWin.show()
    editBarWin.setIgnoreMouseEvents(false)
  })

  // ?bar=1 パラメータで OverlayApp がバーモードで動作
  if (isDev) {
    editBarWin.loadURL('http://localhost:5173/overlay.html?bar=1')
  } else {
    editBarWin.loadFile(path.join(__dirname, '../dist/overlay.html'), { query: { bar: '1' } })
  }

  editBarWin.on('closed', () => { editBarWin = null })

  return editBarWin
}

function destroyEditBar() {
  if (editBarWin && !editBarWin.isDestroyed()) editBarWin.close()
  editBarWin = null
}

function destroyOverlay() {
  destroyEditBar()
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.close()
  overlayWin = null
  editMode   = false
}

function isOverlayVisible() {
  return !!(overlayWin && !overlayWin.isDestroyed())
}

function setEditMode(enabled) {
  editMode = enabled

  // ── ウィジェット個別ウィンドウを先に更新 ──
  widgetWindows.setEditMode(enabled)

  if (enabled) {
    // 編集バー専用ウィンドウを作成（常時クリック可能）
    createEditBarWindow()
    // メインオーバーレイは常にクリックスルー維持（ウィジェットドラッグを妨げない）
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.setIgnoreMouseEvents(true, { forward: true })
      overlayWin.setFocusable(false)
    }
  } else {
    // 編集バーウィンドウを閉じる
    destroyEditBar()
    // メインオーバーレイを通常レベルに戻す
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.setIgnoreMouseEvents(true, { forward: true })
      overlayWin.setFocusable(false)
      overlayWin.setAlwaysOnTop(false)
      setTimeout(() => {
        if (!overlayWin || overlayWin.isDestroyed() || editMode) return
        overlayWin.setIgnoreMouseEvents(true, { forward: true })
        applyLevel(overlayWin, currentLevel)
      }, 200)
    }
  }

  // Drawer など（ウィジェットウィンドウ以外）に通知
  const widgetWinSet = new Set()
  // widgetWindows モジュールが管理する window を除外するため getAllWindows から絞る
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed() && win !== editBarWin) {
      win.webContents.send('overlay:editMode', enabled)
    }
  })
}

function syncWidgets(layout) {
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) win.webContents.send('overlay:syncWidgets', layout)
  })
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

  // overlay:setClickThrough は後方互換のため残す（現在は使用されない）
  ipcMain.handle('overlay:setClickThrough', (_, enabled) => {
    if (!overlayWin || overlayWin.isDestroyed()) return { ok: false }
    overlayWin.setIgnoreMouseEvents(enabled, { forward: true })
    return { ok: true }
  })

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

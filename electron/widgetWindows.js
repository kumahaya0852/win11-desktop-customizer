/**
 * electron/widgetWindows.js — 表示専用ウィジェットウィンドウ管理
 *
 * ウィジェットウィンドウは常に表示専用（クリックスルー）。
 * 編集はメインウィンドウ側のプレビューで行い、
 * 座標変更は IPC 経由で setBounds を呼ぶ。
 */
const { BrowserWindow } = require('electron')
const { execFile } = require('child_process')
const path  = require('path')
const isDev = process.env.NODE_ENV === 'development'
const isWin = process.platform === 'win32'

const widgetWins = new Map()

// ── WinAPI ──────────────────────────────────────────────
function psEncode(s) { return Buffer.from(s, 'utf16le').toString('base64') }
function setWindowPos(hwnd, insertAfter) {
  if (!isWin || !hwnd) return
  const script = `Add-Type @"
using System;using System.Runtime.InteropServices;
public class WP{[DllImport("user32.dll")]public static extern bool SetWindowPos(IntPtr h,IntPtr i,int x,int y,int cx,int cy,uint f);}
"@
[WP]::SetWindowPos([IntPtr]${hwnd},[IntPtr]${insertAfter},0,0,0,0,0x13)`.trim()
  execFile('powershell.exe',
    ['-NoProfile','-NonInteractive','-EncodedCommand', psEncode(script)],
    { windowsHide: true, timeout: 3000 }, () => {})
}
function getHwnd(win) {
  if (!win || win.isDestroyed()) return null
  const buf = win.getNativeWindowHandle()
  if (!buf) return null
  try { return buf.readBigInt64LE(0).toString() }
  catch { try { return buf.readInt32LE(0).toString() } catch { return null } }
}
function applyZLevel(win, zLevel) {
  if (!win || win.isDestroyed()) return
  const hwnd = getHwnd(win)
  if (zLevel === 'top') {
    win.setAlwaysOnTop(true, 'screen-saver')
    if (hwnd) setWindowPos(hwnd, '-1')
  } else if (zLevel === 'bottom') {
    win.setAlwaysOnTop(false)
    if (hwnd) setWindowPos(hwnd, '1')
  } else {
    win.setAlwaysOnTop(false)
  }
}

// ── ウィンドウ作成（常に表示専用） ────────────────────────
function _createWin(widget) {
  const { id, x, y, w, h, zLevel = 'normal' } = widget

  const win = new BrowserWindow({
    x: Math.round(x), y: Math.round(y),
    width:  Math.round(w),
    height: Math.round(h),
    transparent: true,
    frame:       false,
    alwaysOnTop: false,
    skipTaskbar: true,
    resizable:   false,
    movable:     false,
    focusable:   false,   // 常にフォーカス不可
    hasShadow:   false,
    show:        false,
    opacity:     0,
    type:        'toolbar',  // 常にtoolbar型
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  })

  win.once('ready-to-show', () => {
    win.show()
    win.setIgnoreMouseEvents(true, { forward: true })  // 常にクリックスルー
    applyZLevel(win, zLevel)
    setTimeout(() => { if (!win.isDestroyed()) win.setOpacity(1) }, 200)
  })

  const url = isDev
    ? `http://localhost:5173/overlay.html?widgetId=${id}`
    : `file://${path.join(__dirname, '../dist/overlay.html')}?widgetId=${id}`
  win.loadURL(url)
  win.on('closed', () => { widgetWins.delete(id) })
  return win
}

// ── 公開 API ─────────────────────────────────────────────
function createWidgetWindow(widget) {
  const { id, visible = true } = widget
  if (!visible) return null
  const existing = widgetWins.get(id)
  if (existing && !existing.isDestroyed()) return existing
  const win = _createWin(widget)
  widgetWins.set(id, win)
  return win
}

function updateWidgetWindow(widget) {
  const { id, x, y, w, h, zLevel = 'normal', visible = true } = widget
  const win = widgetWins.get(id)
  if (!visible) {
    if (win && !win.isDestroyed()) win.destroy()
    widgetWins.delete(id); return
  }
  if (!win || win.isDestroyed()) {
    widgetWins.set(id, _createWin(widget)); return
  }
  win.setBounds({ x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) })
  applyZLevel(win, zLevel)
}

function syncAll(widgets) {
  const activeIds = new Set()
  for (const w of widgets) {
    if (w.visible !== false) { activeIds.add(w.id); updateWidgetWindow(w) }
    else { const win = widgetWins.get(w.id); if (win && !win.isDestroyed()) win.destroy(); widgetWins.delete(w.id) }
  }
  for (const [id, win] of widgetWins) {
    if (!activeIds.has(id) && !win.isDestroyed()) { win.destroy(); widgetWins.delete(id) }
  }
}

function broadcastTheme(theme) {
  for (const win of widgetWins.values()) {
    if (!win.isDestroyed()) win.webContents.send('theme:changed', theme)
  }
}

function destroyAll() {
  for (const win of widgetWins.values()) { if (!win.isDestroyed()) win.destroy() }
  widgetWins.clear()
}

function getAll()       { return widgetWins }
function isAnyVisible() { return widgetWins.size > 0 }

// ── IPC ──────────────────────────────────────────────────
function register(ipcMain_, getMainWindow) {
  ipcMain_.handle('widgets:syncAll', (_, widgets) => { syncAll(widgets); return { ok: true } })
  ipcMain_.handle('widgets:update',  (_, widget)  => { updateWidgetWindow(widget); return { ok: true } })
  ipcMain_.handle('widgets:remove',  (_, id)      => {
    const win = widgetWins.get(id)
    if (win && !win.isDestroyed()) win.destroy()
    widgetWins.delete(id); return { ok: true }
  })
  // 編集モードはウィンドウ側では何もしない（メインウィンドウのプレビューで編集する）
  ipcMain_.handle('widgets:setEditMode', (_, enabled) => {
    const mw = getMainWindow?.()
    if (mw && !mw.isDestroyed()) mw.webContents.send('overlay:editMode', enabled)
    return { ok: true }
  })
  // 位置を直接 setBounds で変更（メインのプレビューからドラッグ中に呼ばれる）
  ipcMain_.handle('widgets:setPosition', (_, { id, x, y }) => {
    const win = widgetWins.get(id)
    if (win && !win.isDestroyed()) {
      const b = win.getBounds()
      win.setBounds({ x: Math.round(x), y: Math.round(y), width: b.width, height: b.height })
    }
    return { ok: true }
  })
  // サイズ変更
  ipcMain_.handle('widgets:resize', (_, { id, w, h }) => {
    const win = widgetWins.get(id)
    if (win && !win.isDestroyed()) {
      const b = win.getBounds()
      win.setBounds({ x: b.x, y: b.y, width: Math.round(w), height: Math.round(h) })
    }
    return { ok: true }
  })
  ipcMain_.handle('widgets:destroyAll', () => { destroyAll(); return { ok: true } })
  ipcMain_.handle('widgets:isAnyVisible', () => isAnyVisible())

  // 移動完了通知（メインのプレビューから）→ ストア保存はメイン側で行う
  ipcMain_.on('widget:moved', (_, payload) => {
    const win = widgetWins.get(payload.id)
    if (win && !win.isDestroyed()) {
      const b = win.getBounds()
      win.setBounds({ x: Math.round(payload.x), y: Math.round(payload.y), width: b.width, height: b.height })
    }
  })
  ipcMain_.on('widget:resized', (_, payload) => {
    const win = widgetWins.get(payload.id)
    if (win && !win.isDestroyed()) {
      const b = win.getBounds()
      win.setBounds({ x: b.x, y: b.y, width: Math.round(payload.w), height: Math.round(payload.h) })
    }
  })
}

module.exports = {
  register, createWidgetWindow, updateWidgetWindow,
  syncAll, destroyAll, broadcastTheme,
  getAll, isAnyVisible,
}

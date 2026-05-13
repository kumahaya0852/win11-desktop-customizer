/**
 * electron/widgetWindows.js — ウィジェット個別ウィンドウ管理
 *
 * 各ウィジェットが独立した透明 BrowserWindow で表示される。
 * - 通常時: setIgnoreMouseEvents(true, { forward: true }) でクリックスルー
 * - 編集時: setMovable(true) + -webkit-app-region:drag でネイティブドラッグ
 */
const { BrowserWindow, screen } = require('electron')
const path = require('path')
const isDev = process.env.NODE_ENV === 'development'

/** widgetId → BrowserWindow */
const windows = new Map()
let editMode = false
let storeRef  = null   // main.js から setStore() で渡される

// ── ウィンドウ生成 ─────────────────────────────────────────
function createWidgetWindow(widget) {
  if (windows.has(widget.id)) return windows.get(widget.id)

  const win = new BrowserWindow({
    x: widget.x ?? 100, y: widget.y ?? 100,
    width:  widget.w ?? 220,
    height: widget.h ?? 120,
    transparent: true,
    frame:       false,
    alwaysOnTop: widget.zLevel === 'top',
    skipTaskbar: true,
    resizable:   false,
    movable:     false,
    focusable:   false,
    hasShadow:   false,
    type:        'toolbar',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  })

  if (widget.zLevel === 'top') win.setAlwaysOnTop(true, 'pop-up-menu')
  // 通常時は常にクリックスルーON
  win.setIgnoreMouseEvents(true, { forward: true })

  const url = isDev
    ? `http://localhost:5173/widget.html?id=${encodeURIComponent(widget.id)}`
    : null

  if (isDev) {
    win.loadURL(url)
  } else {
    win.loadFile(path.join(__dirname, '../dist/widget.html'), {
      query: { id: widget.id },
    })
  }

  // ロード完了後に config を送信
  win.webContents.once('did-finish-load', () => {
    if (!win.isDestroyed()) {
      win.webContents.send('widget:config', widget)
      if (editMode) applyEditModeToWindow(win, true)
    }
  })

  // 編集モード中: ドラッグ終了時に新しい位置をストアに保存
  win.on('moved', () => {
    if (!editMode) return
    const [x, y] = win.getPosition()
    persistWidgetPatch(widget.id, { x, y })
  })

  win.on('closed', () => windows.delete(widget.id))

  windows.set(widget.id, win)
  return win
}

// ── ストア更新 + 全 UI ウィンドウへブロードキャスト ──────
function persistWidgetPatch(id, patch) {
  if (!storeRef) return
  const layout  = storeRef.get('widgets.layout') ?? []
  const updated = layout.map(w => w.id === id ? { ...w, ...patch } : w)
  storeRef.set('widgets.layout', updated)
  broadcastLayout(updated)
}

/** ウィジェット以外の全ウィンドウ（ドロワーなど）にレイアウト変更を通知 */
function broadcastLayout(layout) {
  const widgetWinSet = new Set(windows.values())
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed() && !widgetWinSet.has(win)) {
      win.webContents.send('overlay:syncWidgets', layout)
    }
  })
}

// ── 編集モード ────────────────────────────────────────────
function applyEditModeToWindow(win, enabled) {
  if (!win || win.isDestroyed()) return
  if (enabled) {
    win.setMovable(true)
    win.setFocusable(true)
    win.setIgnoreMouseEvents(false)
    win.setAlwaysOnTop(true, 'pop-up-menu')
  } else {
    win.setMovable(false)
    win.setFocusable(false)
    win.setIgnoreMouseEvents(true, { forward: true })
    win.setAlwaysOnTop(false)
  }
  win.webContents.send('widget:editMode', enabled)
}

function setEditMode(enabled) {
  editMode = enabled
  for (const [, win] of windows) {
    applyEditModeToWindow(win, enabled)
  }
}

// ── レイアウト同期 ────────────────────────────────────────
function updateLayout(layout) {
  const visible = layout.filter(w => w.visible !== false)
  const newIds  = new Set(visible.map(w => w.id))

  // 不要なウィンドウを破棄
  for (const [id, win] of windows) {
    if (!newIds.has(id)) {
      if (!win.isDestroyed()) win.close()
      windows.delete(id)
    }
  }

  // 新規作成 or 既存ウィンドウ更新
  for (const widget of visible) {
    if (!windows.has(widget.id)) {
      createWidgetWindow(widget)
    } else {
      const win = windows.get(widget.id)
      if (!win.isDestroyed()) {
        win.setBounds({
          x: widget.x, y: widget.y,
          width: widget.w, height: widget.h,
        })
        win.webContents.send('widget:config', widget)
        // z-level を更新
        if (widget.zLevel === 'top') {
          win.setAlwaysOnTop(true, 'pop-up-menu')
        } else {
          win.setAlwaysOnTop(false)
        }
      }
    }
  }
}

function destroyAll() {
  for (const [, win] of windows) {
    if (!win.isDestroyed()) win.close()
  }
  windows.clear()
}

// ── IPC ハンドラ登録 ───────────────────────────────────────
function register(ipcMain_) {

  // レイアウト全体を同期（Drawer から addWidget / removeWidget 時など）
  ipcMain_.handle('widgets:syncAll', (_, layout) => {
    if (Array.isArray(layout)) {
      updateLayout(layout)
      broadcastLayout(layout) // ドロワー UI を更新
    }
    return { ok: true }
  })

  // 個別ウィジェット更新（z-level 変更など）
  ipcMain_.handle('widgets:update', (_, patch) => {
    if (storeRef) {
      const layout  = storeRef.get('widgets.layout') ?? []
      const updated = layout.map(w => w.id === patch.id ? { ...w, ...patch } : w)
      storeRef.set('widgets.layout', updated)
      updateLayout(updated)
      broadcastLayout(updated)
    }
    return { ok: true }
  })

  // ウィジェット削除
  ipcMain_.handle('widgets:remove', (_, id) => {
    const win = windows.get(id)
    if (win && !win.isDestroyed()) win.close()
    windows.delete(id)
    return { ok: true }
  })

  ipcMain_.handle('widgets:destroyAll',   () => { destroyAll(); return { ok: true } })
  ipcMain_.handle('widgets:isAnyVisible', () => windows.size > 0)

  // ---- ウィジェットウィンドウ自身からの IPC ----

  // 準備完了通知: widget.html が読み込まれたら config を送信
  ipcMain_.handle('widget:ready', (event, widgetId) => {
    if (!storeRef || !widgetId) return { ok: false }
    const layout = storeRef.get('widgets.layout') ?? []
    const cfg    = layout.find(w => w.id === widgetId)
    if (cfg) {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (win && !win.isDestroyed()) {
        win.webContents.send('widget:config', cfg)
        if (editMode) applyEditModeToWindow(win, true)
      }
    }
    return { ok: true }
  })

  // リサイズ: マウスが外れても追えるようウィンドウを画面端まで拡張
  ipcMain_.handle('widget:expandForResize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return { ok: false }
    const [x, y] = win.getPosition()
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
    win.setBounds({ x, y, width: Math.max(60, sw - x), height: Math.max(40, sh - y) })
    return { ok: true }
  })

  // リサイズ中の一時サイズ適用
  ipcMain_.handle('widget:setSize', (event, { w, h }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return { ok: false }
    const [x, y] = win.getPosition()
    win.setBounds({ x, y, width: Math.max(60, w), height: Math.max(40, h) })
    return { ok: true }
  })

  // リサイズ確定: 最終サイズをストアに保存
  ipcMain_.handle('widget:commitResize', (event, { w, h }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return { ok: false }
    const [x, y] = win.getPosition()
    const fw = Math.max(60, w), fh = Math.max(40, h)
    win.setBounds({ x, y, width: fw, height: fh })
    // widgetId を逆引きして保存
    for (const [id, wn] of windows) {
      if (wn === win) {
        persistWidgetPatch(id, { w: fw, h: fh })
        break
      }
    }
    return { ok: true }
  })

  // 各ウィジェットウィンドウのクリックスルー切り替え（通常モードの hover 検出用）
  ipcMain_.handle('widget:setClickThrough', (event, enabled) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && !win.isDestroyed()) {
      win.setIgnoreMouseEvents(enabled, { forward: true })
    }
    return { ok: true }
  })

  // 旧スタブ（後方互換）
  ipcMain_.handle('widgets:setPosition', () => ({ ok: true }))
  ipcMain_.handle('widgets:resize',      () => ({ ok: true }))
  ipcMain_.on('widget:moved',   () => {})
  ipcMain_.on('widget:resized', () => {})
}

function setStore(store) { storeRef = store }

module.exports = {
  register, updateLayout, destroyAll, setEditMode, setStore,
  broadcastLayout,
}

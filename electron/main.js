const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen } = require('electron')
const path = require('path')
const isDev = process.env.NODE_ENV === 'development'

const windowHandlers    = require('./ipc/window')
const registryHandlers  = require('./ipc/registry')
const wallpaperHandlers = require('./ipc/wallpaper')
const themeHandlers     = require('./ipc/theme')
const storeModule       = require('./store')
const pluginLoader      = require('./plugins/pluginLoader')
const overlayWindow     = require('./overlayWindow')
const widgetWindows     = require('./widgetWindows')
const sysmon            = require('./native/sysmon')

let mainWindow   = null
let detailWindow = null
let tray         = null

// ── メインドロワー ────────────────────────────────────
function createMainWindow() {
  const { height } = screen.getPrimaryDisplay().workAreaSize
  mainWindow = new BrowserWindow({
    width:  340,
    height: height,
    x: 0, y: 0,
    frame:       false,
    transparent: true,
    resizable:   false,
    movable:     false,
    skipTaskbar: false,
    alwaysOnTop: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  })
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
  mainWindow.on('closed', () => { mainWindow = null })
}

// ── 詳細設定ウィンドウ ────────────────────────────────
function createDetailWindow() {
  if (detailWindow && !detailWindow.isDestroyed()) {
    detailWindow.focus(); return
  }
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  detailWindow = new BrowserWindow({
    width: 900, height: 650,
    x: Math.round((width - 900) / 2),
    y: Math.round((height - 650) / 2),
    frame:    false, transparent: false,
    resizable: true, minWidth: 720, minHeight: 500,
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  })
  if (isDev) {
    detailWindow.loadURL('http://localhost:5173?detail=1')
  } else {
    detailWindow.loadFile(path.join(__dirname, '../dist/index.html'), { query: { detail: '1' } })
  }
  detailWindow.on('closed', () => { detailWindow = null })
}

function registerIpcHandlers() {
  // ── メインウィンドウコントロール ──
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.restore()
    else mainWindow?.maximize()
  })
  ipcMain.handle('window:close', () => mainWindow?.hide())

  // ── 詳細ウィンドウコントロール ──  ★ Bug6修正: 詳細ウィンドウ専用
  ipcMain.handle('detail:minimize', () => detailWindow?.minimize())
  ipcMain.handle('detail:maximize', () => {
    if (detailWindow?.isMaximized()) detailWindow.restore()
    else detailWindow?.maximize()
  })
  ipcMain.handle('detail:close', () => detailWindow?.close())

  // ── 詳細ウィンドウ開閉 ──
  ipcMain.handle('window:openDetail',  () => { createDetailWindow(); return { ok: true } })
  ipcMain.handle('window:closeDetail', () => { detailWindow?.close(); return { ok: true } })

  // ── クリックスルー ──
  // 編集モード: メインウィンドウを全画面プレビューに拡大
  ipcMain.handle('window:setEditLayout', (_, enabled) => {
    if (!mainWindow || mainWindow.isDestroyed()) return { ok: false }
    const { width, height } = screen.getPrimaryDisplay().workAreaSize
    if (enabled) {
      // 全画面に拡大してプレビュー編集
      mainWindow.setBounds({ x: 0, y: 0, width, height })
      mainWindow.setIgnoreMouseEvents(false)
    } else {
      // 元のスリムサイズに戻す
      mainWindow.setBounds({ x: 0, y: 0, width: 340, height })
      mainWindow.setIgnoreMouseEvents(true, { forward: true })
    }
    return { ok: true }
  })

  ipcMain.handle('window:setClickThrough', (_, enabled) => {
    if (!mainWindow || mainWindow.isDestroyed()) return { ok: false }
    mainWindow.setIgnoreMouseEvents(enabled, { forward: true })
    return { ok: true }
  })

  storeModule.register(ipcMain)
  windowHandlers.register(ipcMain)
  registryHandlers.register(ipcMain)
  wallpaperHandlers.register(ipcMain)
  themeHandlers.register(ipcMain)
  pluginLoader.register(ipcMain, () => mainWindow)
  overlayWindow.register(ipcMain)
  widgetWindows.register(ipcMain, () => mainWindow)

  ipcMain.handle('app:version',  () => app.getVersion())
  ipcMain.handle('app:platform', () => process.platform)

  // 作業領域サイズを返す（プレビューのスケール計算用）
  ipcMain.handle('app:workArea', () => {
    const { workAreaSize, bounds } = screen.getPrimaryDisplay()
    return { width: workAreaSize.width, height: workAreaSize.height,
             x: bounds.x, y: bounds.y }
  })
}

function createTray() {
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  const menu = Menu.buildFromTemplate([
    { label: 'Win11 Customizer', enabled: false },
    { type: 'separator' },
    { label: 'ドロワーを表示', click: () => mainWindow?.show() },
    { label: '詳細設定',       click: () => createDetailWindow() },
    { type: 'separator' },
    { label: '終了', click: () => {
        sysmon.stop(); widgetWindows.destroyAll()
        overlayWindow.destroyOverlay(); app.quit()
      }
    },
  ])
  tray.setToolTip('Win11 Desktop Customizer')
  tray.setContextMenu(menu)
  tray.on('double-click', () => mainWindow?.show())
}

app.whenReady().then(async () => {
  registerIpcHandlers()
  await storeModule.init()
  sysmon.init()
  createMainWindow()
  createTray()
  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) createMainWindow()
  })
})

app.on('before-quit', () => {
  sysmon.stop(); widgetWindows.destroyAll(); overlayWindow.destroyOverlay()
})
app.on('window-all-closed', () => {})

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) { app.quit() }
else { app.on('second-instance', () => { mainWindow?.show(); mainWindow?.focus() }) }

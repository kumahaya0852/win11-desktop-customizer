const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, dialog, protocol, net } = require('electron')
const path = require('path')
const fs   = require('fs')
const isDev = process.env.NODE_ENV === 'development'

// http://localhost から file:// 画像をロードできるようにするカスタムスキーム
// registerSchemesAsPrivileged は app.whenReady() より前に呼ぶ必要がある
protocol.registerSchemesAsPrivileged([
  { scheme: 'localfile', privileges: { secure: true, standard: true, supportFetchAPI: true } }
])

const windowHandlers    = require('./ipc/window')
const registryHandlers  = require('./ipc/registry')
const wallpaperHandlers = require('./ipc/wallpaper')
const themeHandlers     = require('./ipc/theme')
const mediaHandlers     = require('./ipc/media')
const ytthumb           = require('./ipc/ytthumb')
const storeModule       = require('./store')
const pluginLoader      = require('./plugins/pluginLoader')
const overlayWindow     = require('./overlayWindow')
const widgetWindows     = require('./widgetWindows')
const sysmon            = require('./native/sysmon')

let mainWindow           = null
let detailWindow         = null
let wallpaperWindow      = null
let videoWallpaperWindow = null
let tray                 = null

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

// ── 動画壁紙ウィンドウ ────────────────────────────────
function createVideoWallpaperWindow(filePath) {
  if (videoWallpaperWindow && !videoWallpaperWindow.isDestroyed()) {
    videoWallpaperWindow.close()
  }
  const { bounds } = screen.getPrimaryDisplay()
  videoWallpaperWindow = new BrowserWindow({
    width: bounds.width, height: bounds.height,
    x: bounds.x, y: bounds.y,
    frame:       false,
    transparent: false,
    resizable:   false,
    movable:     false,
    skipTaskbar: true,
    alwaysOnTop: false,
    focusable:   false,
    backgroundColor: '#000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          true,
    },
  })
  const encoded = encodeURIComponent(filePath)
  if (isDev) {
    videoWallpaperWindow.loadURL(`http://localhost:5173/videowallpaper.html?path=${encoded}`)
  } else {
    videoWallpaperWindow.loadFile(
      path.join(__dirname, '../dist/videowallpaper.html'),
      { query: { path: filePath } }
    )
  }
  videoWallpaperWindow.on('closed', () => { videoWallpaperWindow = null })
}

// ── 壁紙オーバーレイウィンドウ ───────────────────────
function createWallpaperWindow() {
  if (wallpaperWindow && !wallpaperWindow.isDestroyed()) {
    wallpaperWindow.focus(); return
  }
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  wallpaperWindow = new BrowserWindow({
    width, height,
    x: 0, y: 0,
    frame:       false,
    transparent: true,
    resizable:   false,
    movable:     false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  })
  if (isDev) {
    wallpaperWindow.loadURL('http://localhost:5173/wallpaper.html')
  } else {
    wallpaperWindow.loadFile(path.join(__dirname, '../dist/wallpaper.html'))
  }
  wallpaperWindow.on('closed', () => { wallpaperWindow = null })
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

  // ── 詳細ウィンドウコントロール ──
  ipcMain.handle('detail:minimize', () => detailWindow?.minimize())
  ipcMain.handle('detail:maximize', () => {
    if (detailWindow?.isMaximized()) detailWindow.restore()
    else detailWindow?.maximize()
  })
  ipcMain.handle('detail:close', () => detailWindow?.close())

  // ── 詳細ウィンドウ開閉 ──
  ipcMain.handle('window:openDetail',  () => { createDetailWindow(); return { ok: true } })
  ipcMain.handle('window:closeDetail', () => { detailWindow?.close(); return { ok: true } })

  // ── 壁紙オーバーレイウィンドウ開閉 ──
  ipcMain.handle('wallpaperWindow:open',  () => { createWallpaperWindow(); return { ok: true } })
  ipcMain.handle('wallpaperWindow:close', () => { wallpaperWindow?.close(); return { ok: true } })

  // ── ファイルダイアログ ──
  // alwaysOnTop なウィンドウがダイアログを覆わないよう、開く前に一時解除する
  ipcMain.handle('dialog:openDir', async (event) => {
    const sender = BrowserWindow.fromWebContents(event.sender)
    sender?.setAlwaysOnTop(false)
    try {
      return await dialog.showOpenDialog(sender ?? undefined, { properties: ['openDirectory'] })
    } finally {
      sender?.setAlwaysOnTop(true)
    }
  })
  ipcMain.handle('dialog:openFile', async (event, opts = {}) => {
    const sender = BrowserWindow.fromWebContents(event.sender)
    sender?.setAlwaysOnTop(false)
    try {
      return await dialog.showOpenDialog(sender ?? undefined, {
        properties: ['openFile'],
        filters: opts.filters ?? [{ name: '画像', extensions: ['jpg','jpeg','png','bmp','webp','gif'] }],
        title: opts.title,
      })
    } finally {
      sender?.setAlwaysOnTop(true)
    }
  })

  // ── 壁紙フォルダ内の画像・動画一覧 ──
  ipcMain.handle('wallpaper:listDir', (_, dirPath) => {
    try {
      const EXTS = new Set([
        '.jpg','.jpeg','.png','.bmp','.webp','.gif',       // 画像
        '.mp4','.webm','.mov','.avi','.mkv','.wmv',        // 動画
      ])
      const files = fs.readdirSync(dirPath)
        .filter(f => EXTS.has(path.extname(f).toLowerCase()))
        .map(f => path.join(dirPath, f))
      return { ok: true, files }
    } catch (e) {
      return { ok: false, files: [], error: e.message }
    }
  })

  // ── 動画壁紙ウィンドウ ──
  ipcMain.handle('videoWallpaper:set', (_, filePath) => {
    try { createVideoWallpaperWindow(filePath); return { ok: true } }
    catch (e) { return { ok: false, error: e.message } }
  })
  ipcMain.handle('videoWallpaper:stop', () => {
    videoWallpaperWindow?.close()
    return { ok: true }
  })

  // ── クリックスルー ──
  // 編集モード: メインウィンドウを全画面プレビューに拡大
  ipcMain.handle('window:setEditLayout', (_, enabled) => {
    if (!mainWindow || mainWindow.isDestroyed()) return { ok: false }
    const { width, height } = screen.getPrimaryDisplay().workAreaSize
    if (enabled) {
      mainWindow.setBounds({ x: 0, y: 0, width, height })
      mainWindow.setIgnoreMouseEvents(false)
    } else {
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
  widgetWindows.register(ipcMain)
  mediaHandlers.register(ipcMain)
  ytthumb.register()

  // 旧アーキテクチャの後方互換ハンドラ（新アーキテクチャでは widgetWindows が担当）
  ipcMain.handle('overlay:updateWidget', (_, patch) => {
    const layout  = storeModule.get('widgets.layout') ?? []
    const updated = layout.map(w => w.id === patch.id ? { ...w, ...patch } : w)
    storeModule.set('widgets.layout', updated)
    widgetWindows.updateLayout(updated)
    widgetWindows.broadcastLayout(updated)
    return { ok: true }
  })

  ipcMain.handle('overlay:removeWidget', (_, id) => {
    const layout  = storeModule.get('widgets.layout') ?? []
    const updated = layout.filter(w => w.id !== id)
    storeModule.set('widgets.layout', updated)
    widgetWindows.updateLayout(updated)
    widgetWindows.broadcastLayout(updated)
    return { ok: true }
  })

  // 編集モードの切り替え（overlay:setEditMode は overlayWindow.register で登録済み）
  ipcMain.handle('widgets:setEditMode', (_, enabled) => {
    overlayWindow.setEditMode(enabled)
    return { ok: true }
  })

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
  // localfile:///path → fs.readFile でファイルを読み返す
  // net.fetch('file://...') は Electron の設定次第で動かないため fs を使う
  protocol.handle('localfile', async (req) => {
    try {
      const urlObj = new URL(req.url)
      // pathname = '/C:/Users/...' → Windowsでは先頭の / を除去
      let filePath = decodeURIComponent(urlObj.pathname)
      if (process.platform === 'win32') filePath = filePath.replace(/^\/([A-Za-z]:)/, '$1')
      const data = await fs.promises.readFile(filePath)
      const ext  = path.extname(filePath).slice(1).toLowerCase()
      const mime = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png',
                     bmp:'image/bmp', webp:'image/webp', gif:'image/gif' }[ext] ?? 'application/octet-stream'
      return new Response(data, { headers: { 'content-type': mime } })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })

  registerIpcHandlers()
  await storeModule.init()
  sysmon.init()

  // ウィジェット個別ウィンドウを起動時に作成
  widgetWindows.setStore(storeModule)
  const savedLayout = storeModule.get('widgets.layout') ?? []
  if (savedLayout.length > 0) widgetWindows.updateLayout(savedLayout)

  createMainWindow()
  createTray()
  // オーバーレイ（編集バーのみ）を起動時に作成
  overlayWindow.createOverlay()
  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed()) createMainWindow()
  })
})

app.on('before-quit', () => {
  sysmon.stop()
  widgetWindows.destroyAll()
  overlayWindow.destroyOverlay()
  wallpaperWindow?.destroy()
  videoWallpaperWindow?.destroy()
})
app.on('window-all-closed', () => {})

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) { app.quit() }
else { app.on('second-instance', () => { mainWindow?.show(); mainWindow?.focus() }) }

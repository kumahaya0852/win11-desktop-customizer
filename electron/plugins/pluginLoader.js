/**
 * electron/plugins/pluginLoader.js
 *
 * plugins-external/ フォルダをスキャン・監視し、
 * プラグインの meta と module を renderer に提供する。
 *
 * プラグインの構造:
 *   plugins-external/
 *     my-plugin/
 *       plugin.json   必須: { id, name, version, author, icon, tags, description }
 *       index.js      必須: module.exports = { onLoad(api){}, onUnload(){} }
 */

const path    = require('path')
const fs      = require('fs')
const chokidar = require('chokidar')

const PLUGINS_DIR = path.join(__dirname, '../../plugins-external')

// ── メモリキャッシュ ──────────────────────────────────
/** @type {Map<string, { meta, modulePath }>} */
const _cache = new Map()
let _watcher = null
let _mainWindow = null   // ホットリロード通知用

// ── スキャン ─────────────────────────────────────────
function scanPlugins() {
  _cache.clear()
  if (!fs.existsSync(PLUGINS_DIR)) return []

  const dirs = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())

  for (const dir of dirs) {
    const base        = path.join(PLUGINS_DIR, dir.name)
    const metaPath    = path.join(base, 'plugin.json')
    const modulePath  = path.join(base, 'index.js')

    if (!fs.existsSync(metaPath) || !fs.existsSync(modulePath)) continue

    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
      if (!meta.id || !meta.name) continue
      _cache.set(meta.id, { meta, modulePath })
    } catch (err) {
      console.warn(`[pluginLoader] skip ${dir.name}:`, err.message)
    }
  }

  return Array.from(_cache.values()).map(e => e.meta)
}

// ── プラグインモジュールを安全にロード ─────────────────
function loadPlugin(id) {
  const entry = _cache.get(id)
  if (!entry) return null

  try {
    // キャッシュを消してリフレッシュ（ホットリロード対応）
    delete require.cache[require.resolve(entry.modulePath)]
    const mod = require(entry.modulePath)

    // onLoad / onUnload が関数かチェック
    if (typeof mod.onLoad !== 'function') {
      throw new Error('onLoad が関数ではありません')
    }

    return {
      id,
      onLoad:   mod.onLoad.toString(),    // 関数を文字列化して renderer に送る
      onUnload: mod.onUnload?.toString() ?? null,
      hasCss:   !!mod.css,
      css:      mod.css ?? null,
    }
  } catch (err) {
    console.error(`[pluginLoader] load error (${id}):`, err.message)
    return { id, error: err.message }
  }
}

// ── ファイル監視（ホットリロード）──────────────────────
function startWatcher(win) {
  _mainWindow = win
  if (_watcher) { _watcher.close(); _watcher = null }
  if (!fs.existsSync(PLUGINS_DIR)) return

  _watcher = chokidar.watch(PLUGINS_DIR, {
    depth: 2,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  })

  _watcher.on('all', (event, filePath) => {
    // plugin.json か index.js の変更のみ対応
    const base = path.basename(filePath)
    if (base !== 'plugin.json' && base !== 'index.js') return

    console.log(`[pluginLoader] file ${event}: ${filePath} → rescan`)
    scanPlugins()

    // 変更があったプラグイン ID を特定して通知
    const pluginDir = path.basename(path.dirname(filePath))
    const entry = Array.from(_cache.values()).find(e =>
      path.dirname(e.modulePath) === path.join(PLUGINS_DIR, pluginDir)
    )
    if (entry && _mainWindow) {
      _mainWindow.webContents.send('plugin:loaded', { pluginId: entry.meta.id })
    } else if (_mainWindow) {
      // 新規追加の場合は全リロードを促す
      _mainWindow.webContents.send('plugin:loaded', { pluginId: null })
    }
  })
}

function stopWatcher() {
  _watcher?.close()
  _watcher = null
}

// ── IPC ハンドラー登録 ─────────────────────────────────
function register(ipcMain, getMainWindow) {
  // 初回スキャン
  scanPlugins()

  ipcMain.handle('plugins:list', () => {
    return Array.from(_cache.values()).map(e => e.meta)
  })

  ipcMain.handle('plugins:load', (_, id) => {
    return loadPlugin(id)
  })

  ipcMain.handle('plugins:rescan', () => {
    return scanPlugins()
  })

  ipcMain.handle('plugins:openFolder', () => {
    if (!fs.existsSync(PLUGINS_DIR)) fs.mkdirSync(PLUGINS_DIR, { recursive: true })
    const { shell } = require('electron')
    shell.openPath(PLUGINS_DIR)
    return { ok: true }
  })

  // watcher は main window が ready になってから
  setTimeout(() => {
    const win = getMainWindow?.()
    if (win) startWatcher(win)
  }, 2000)
}

module.exports = { register, scanPlugins, loadPlugin, startWatcher, stopWatcher }

/**
 * electron/store.js
 * electron-store を main プロセスで一元管理するモジュール。
 * renderer からは IPC (store:get / store:set / store:delete) 経由でアクセスする。
 */

let Store
let store

const DEFAULTS = {
  'theme.active': {
    id: 'default-dark',
    name: 'Default Dark',
    accentColor: '#5b8cff',
    bgColor: '#0a0a0a',
    panelColor: '#111111',
    textPrimary: 'rgba(255,255,255,0.92)',
    applyToSystem: false,
  },
  'widgets.layout': [],   // [{ id, type, x, y, w, h, config }]
  'window.rules': [],
  'plugins.enabled': [],
  'ui.sidebar': 'theme',
}

/**
 * electron-store を遅延ロード（ESM 対応）して初期化する。
 * main.js の app.whenReady() 内で必ず呼ぶこと。
 */
async function init() {
  // electron-store v9 以降は ESM only なので dynamic import
  const mod = await import('electron-store')
  Store = mod.default
  store = new Store({ defaults: DEFAULTS })
  return store
}

function get(key) {
  return store?.get(key) ?? null
}

function set(key, value) {
  store?.set(key, value)
}

function del(key) {
  store?.delete(key)
}

function getAll() {
  return store?.store ?? {}
}

/**
 * IPC ハンドラーを登録する。
 * register(ipcMain) を main.js から呼ぶ。
 */
function register(ipcMain) {
  ipcMain.handle('store:get',    (_, key)        => get(key))
  ipcMain.handle('store:set',    (_, key, value) => { set(key, value); return true })
  ipcMain.handle('store:delete', (_, key)        => { del(key); return true })
  ipcMain.handle('store:getAll', ()              => getAll())
}

module.exports = { init, get, set, del, getAll, register }

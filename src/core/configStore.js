/**
 * core/configStore.js  (Phase 2)
 * Electron 上では window.api.store (electron-store IPC) を使い、
 * ブラウザ単体モードでは localStorage にフォールバックする。
 * 呼び出し側は async/await で使う。
 */

const isElectron = typeof window !== 'undefined' && typeof window.api !== 'undefined'
const PREFIX = 'w11c:'

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
  'widgets.layout': [],
  'window.rules': [],
  'plugins.enabled': [],
  'mode.active': 'custom',
  'ui.sidebar': 'theme',
}

// ── localStorage ヘルパー（フォールバック用）──────────
function lsGet(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw !== null ? JSON.parse(raw) : null
  } catch { return null }
}
function lsSet(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true }
  catch { return false }
}

// ── 公開 API ─────────────────────────────────────────
async function get(key) {
  if (isElectron) {
    const v = await window.api.store.get(key)
    return v ?? DEFAULTS[key] ?? null
  }
  const v = lsGet(key)
  return v ?? DEFAULTS[key] ?? null
}

async function set(key, value) {
  if (isElectron) return window.api.store.set(key, value)
  return lsSet(key, value)
}

async function remove(key) {
  if (isElectron) return window.api.store.delete(key)
  localStorage.removeItem(PREFIX + key)
}

async function getAll() {
  if (isElectron) return window.api.store.getAll()
  const result = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(PREFIX)) {
      try { result[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k)) } catch { /* skip */ }
    }
  }
  return result
}

/** 未設定キーにデフォルト値を書き込む（起動時に1回呼ぶ） */
async function initDefaults() {
  for (const [key, val] of Object.entries(DEFAULTS)) {
    const existing = await get(key)
    if (existing === null || existing === undefined) {
      await set(key, val)
    }
  }
}

const configStore = { get, set, remove, getAll, initDefaults, DEFAULTS }
export default configStore

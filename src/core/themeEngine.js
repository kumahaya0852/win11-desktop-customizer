/**
 * core/themeEngine.js
 * ★ Bug3修正: window.api の参照を import 時ではなく関数呼び出し時に行う
 */
import bus, { EVENTS } from './eventBus'
import configStore from './configStore'

let _ignoreNextChange = false

function hexWithAlpha(hex, alpha) {
  try {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  } catch { return `rgba(0,0,0,${alpha})` }
}

function adjustBrightness(hex, amount) {
  try {
    const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount)
    const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount)
    const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount)
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
  } catch { return hex }
}

export function applyCSSVars(theme) {
  if (!theme) return
  const s = document.documentElement.style
  if (theme.accentColor) {
    s.setProperty('--accent',      theme.accentColor)
    s.setProperty('--accent-dim',  hexWithAlpha(theme.accentColor, 0.18))
    s.setProperty('--accent-glow', hexWithAlpha(theme.accentColor, 0.35))
  }
  if (theme.bgColor)     s.setProperty('--bg-base',    theme.bgColor)
  if (theme.panelColor)  {
    s.setProperty('--bg-panel',   theme.panelColor)
    s.setProperty('--bg-card',    adjustBrightness(theme.panelColor,  8))
    s.setProperty('--bg-hover',   adjustBrightness(theme.panelColor, 16))
  }
  if (theme.textPrimary) s.setProperty('--text-primary', theme.textPrimary)
}

export async function applyTheme(theme) {
  applyCSSVars(theme)
  await configStore.set('theme.active', theme)
  bus.emit(EVENTS.THEME_CHANGED, theme)

  // ★ Bug3修正: window.api を関数内で参照（import時は未定義の場合がある）
  const api = typeof window !== 'undefined' ? window.api : null
  if (api && theme.applyToSystem) {
    _ignoreNextChange = true
    try {
      await api.theme.apply(theme)
    } catch (e) {
      console.warn('[themeEngine] Windows側適用失敗:', e.message)
    } finally {
      setTimeout(() => { _ignoreNextChange = false }, 500)
    }
  }
}

export async function restoreTheme() {
  const saved = await configStore.get('theme.active')
  if (saved) applyCSSVars(saved)
  return saved
}

// main → renderer の theme:changed 受信
// ★ Bug3修正: DOMContentLoaded 後に登録してwindow.apiが確実にある状態で実行
function setupThemeListener() {
  const api = typeof window !== 'undefined' ? window.api : null
  if (!api) return
  api.on('theme:changed', (theme) => {
    if (_ignoreNextChange) return
    applyCSSVars(theme)
    bus.emit(EVENTS.THEME_CHANGED, theme)
  })
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupThemeListener)
  } else {
    setupThemeListener()
  }
}

const themeEngine = { applyTheme, restoreTheme, applyCSSVars }
export default themeEngine

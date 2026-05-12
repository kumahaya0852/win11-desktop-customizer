/**
 * core/modeManager.js
 *
 * モード定義と切り替えロジック。
 * 各モードはウィジェットの visible / zLevel / sysmon 更新間隔を制御する。
 */
import configStore from './configStore'
import bus from './eventBus'

// ── モード定義 ─────────────────────────────────────────
export const MODES = {
  game: {
    id:    'game',
    label: 'ゲーム',
    icon:  '🎮',
    color: 'var(--accent)',
    desc:  'パフォーマンス優先。重いウィジェットを自動非表示',
    // ウィジェット種別ごとの設定
    widgetRules: {
      clock:      { visible: true,  zLevel: 'bottom' },
      sysmonitor: { visible: false, zLevel: 'bottom' },  // 非表示
      note:       { visible: false, zLevel: 'bottom' },  // 非表示
    },
    sysmonIntervalMs: 30000,   // 30秒
  },
  monitor: {
    id:    'monitor',
    label: '監視',
    icon:  '📊',
    color: 'var(--ok)',
    desc:  '全ウィジェット表示・高頻度更新',
    widgetRules: {
      clock:      { visible: true, zLevel: 'top' },
      sysmonitor: { visible: true, zLevel: 'top' },
      note:       { visible: true, zLevel: 'normal' },
    },
    sysmonIntervalMs: 1000,    // 1秒
  },
  sleep: {
    id:    'sleep',
    label: '省電力',
    icon:  '🌙',
    color: 'var(--text-muted)',
    desc:  '最小限の表示・更新を抑制',
    widgetRules: {
      clock:      { visible: true,  zLevel: 'bottom' },
      sysmonitor: { visible: false, zLevel: 'bottom' },
      note:       { visible: false, zLevel: 'bottom' },
    },
    sysmonIntervalMs: 60000,   // 60秒
  },
  custom: {
    id:    'custom',
    label: 'カスタム',
    icon:  '⚙️',
    color: 'var(--text-secondary)',
    desc:  '手動設定を維持',
    widgetRules: null,          // null = 各ウィジェットの設定をそのまま使う
    sysmonIntervalMs: null,     // null = 現在の設定を維持
  },
}

// ── アクティブモード取得 ──────────────────────────────
export async function getActiveMode() {
  const id = await configStore.get('mode.active')
  return MODES[id] ?? MODES.custom
}

// ── モード切り替え ────────────────────────────────────
export async function applyMode(modeId) {
  const mode = MODES[modeId]
  if (!mode) return { ok: false, error: `Unknown mode: ${modeId}` }

  await configStore.set('mode.active', modeId)

  if (mode.widgetRules) {
    // ウィジェットレイアウトを取得して一括更新
    const layout = await configStore.get('widgets.layout') ?? []
    const updated = layout.map(w => {
      const rule = mode.widgetRules[w.type]
      if (!rule) return w
      return { ...w, ...rule }
    })
    await configStore.set('widgets.layout', updated)

    // Electron 側にも即時反映
    if (typeof window !== 'undefined' && window.api?.widgets) {
      await window.api.widgets.syncAll(updated).catch(() => {})
    }
  }

  // sysmon 更新間隔を変更
  if (mode.sysmonIntervalMs && typeof window !== 'undefined' && window.api?.system) {
    await window.api.system.setInterval(mode.sysmonIntervalMs).catch(() => {})
  }

  bus.emit('mode:changed', mode)
  return { ok: true, mode }
}

// ── モード一覧（配列）────────────────────────────────
export function getModeList() {
  return Object.values(MODES)
}

/**
 * widgets/WidgetRegistry.js
 * ウィジェットの種類を登録・管理するレジストリ。
 * Plugin API（Phase 5）からも register() を呼び出せる設計。
 */

const registry = new Map()

/**
 * ウィジェット定義を登録する
 * @param {{ id, name, icon, defaultSize: {w,h}, minSize: {w,h}, component: () => Promise }} def
 */
export function register(def) {
  if (!def?.id) throw new Error('Widget definition requires an id')
  registry.set(def.id, def)
}

export function get(id) {
  return registry.get(id) ?? null
}

export function getAll() {
  return Array.from(registry.values())
}

export function unregister(id) {
  registry.delete(id)
}

// ── Built-in ウィジェット登録 ─────────────────────────
register({
  id: 'clock',
  name: '時計',
  icon: '🕐',
  defaultSize: { w: 220, h: 100 },
  minSize:     { w: 160, h: 80 },
  component:   () => import('./components/ClockWidget'),
})

register({
  id: 'sysmonitor',
  name: 'システム監視',
  icon: '📊',
  defaultSize: { w: 260, h: 160 },
  minSize:     { w: 200, h: 120 },
  component:   () => import('./components/SysMonitorWidget'),
})

register({
  id: 'note',
  name: 'メモ',
  icon: '📝',
  defaultSize: { w: 240, h: 180 },
  minSize:     { w: 160, h: 120 },
  component:   () => import('./components/NoteWidget'),
})

register({
  id:          'mediaplayer',
  name:        'メディアプレイヤー',
  icon:        '🎵',
  defaultSize: { w: 280, h: 360 },
  minSize:     { w: 200, h: 260 },
  transparent: true,   // カード背景・ボーダーを非表示（透過ウィジェット）
  component:   () => import('./components/MediaPlayerWidget'),
})

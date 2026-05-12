/**
 * plugins-external/sample-weather/index.js
 *
 * 外部プラグインのサンプル実装。
 * plugin.json と同じフォルダに置く。
 *
 * このファイルは Node.js の CommonJS 形式で書く（require/module.exports）。
 * React コンポーネントはインライン文字列として定義し、
 * PluginAPI 経由でウィジェットとして登録する。
 */

module.exports = {
  /**
   * プラグインが有効化されたときに呼ばれる。
   * @param {object} api - PluginAPI インスタンス
   */
  onLoad(api) {
    api.log('sample-weather plugin loaded!')

    // ウィジェットを登録
    // component は () => Promise<module> 形式で渡す
    // 外部プラグインでは inline component を文字列評価で渡す
    api.widgets.register({
      id:   'sample-weather-widget',
      name: '天気 (サンプル)',
      icon: '🌤',
      defaultSize: { w: 240, h: 140 },
      minSize:     { w: 180, h: 100 },
      // コンポーネントは WidgetRegistry の lazy() に渡されるため
      // () => Promise<{ default: Component }> を返す必要がある
      component: () => Promise.resolve({
        default: WeatherWidget,
      }),
    })

    // テーマ変更を購読してログ
    api.theme.onChanged(theme => {
      api.log('theme changed to:', theme.name)
    })

    // 設定を読み込み（初回は 0）
    api.config.get('view_count').then(count => {
      const next = (count ?? 0) + 1
      api.config.set('view_count', next)
      api.log(`このプラグインは ${next} 回ロードされました`)
    })
  },

  /**
   * プラグインが無効化されたときに呼ばれる。
   */
  onUnload() {
    console.log('[sample-weather] unloaded')
  },
}

// ── インラインウィジェットコンポーネント ──────────────────
// 外部プラグインでは JSX が使えないため、React.createElement で書く
const WEATHER_DATA = [
  { day: '今日',   icon: '🌤', hi: 24, lo: 16 },
  { day: '明日',   icon: '🌧', hi: 19, lo: 13 },
  { day: '明後日', icon: '☀️', hi: 28, lo: 18 },
]

function WeatherWidget() {
  const { createElement: h, useState, useEffect } = require('react') // Electronでは require が使える

  const [time, setTime] = useState(new Date().toLocaleTimeString('ja-JP'))
  useEffect(() => {
    const id = setInterval(() => setTime(new Date().toLocaleTimeString('ja-JP')), 1000)
    return () => clearInterval(id)
  }, [])

  return h('div', {
    style: { padding: '10px 14px', height: '100%', display: 'flex', flexDirection: 'column', gap: 8 }
  },
    h('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
    },
      h('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, '東京 (サンプル)'),
      h('span', { style: { fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' } }, time)
    ),
    h('div', {
      style: { display: 'flex', justifyContent: 'space-between', flex: 1, alignItems: 'center' }
    },
      ...WEATHER_DATA.map(d =>
        h('div', {
          key: d.day,
          style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }
        },
          h('span', { style: { fontSize: 10, color: 'var(--text-muted)' } }, d.day),
          h('span', { style: { fontSize: 22 } }, d.icon),
          h('span', { style: { fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)' } }, `${d.hi}°`),
          h('span', { style: { fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' } }, `${d.lo}°`)
        )
      )
    )
  )
}

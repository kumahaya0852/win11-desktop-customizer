/**
 * src/plugins/PluginAPI.js
 *
 * プラグインに渡す公開 API オブジェクト。
 * プラグイン側は onLoad(api) で受け取り、以下を使う:
 *
 *   api.widgets.register(def)       ウィジェット登録
 *   api.widgets.unregister(id)      ウィジェット解除
 *   api.theme.override(patch)       CSS変数を上書き
 *   api.theme.onChanged(fn)         テーマ変更を購読
 *   api.events.on(channel, fn)      EventBus 購読
 *   api.events.emit(channel, data)  EventBus 送信
 *   api.config.get(key)             設定読み取り (async)
 *   api.config.set(key, value)      設定書き込み (async)
 *   api.store                       electron-store IPC へのショートカット
 *   api.log(...args)                プラグイン名付きコンソールログ
 */

import * as WidgetRegistry from '../widgets/WidgetRegistry'
import { applyCSSVars } from '../core/themeEngine'
import bus, { EVENTS } from '../core/eventBus'
import configStore from '../core/configStore'

/**
 * プラグイン1つ分の API インスタンスを生成する。
 * PluginHost から pluginId を渡して呼ぶ。
 */
export function createPluginAPI(pluginId) {
  // 購読リスト（unload 時に全解除するため保持）
  const _listeners = []

  const api = {

    // ── ウィジェット ────────────────────────────────
    widgets: {
      register(def) {
        if (!def?.id) throw new Error(`[${pluginId}] widget def requires id`)
        WidgetRegistry.register({ ...def, _plugin: pluginId })
        bus.emit(EVENTS.PLUGIN_LOADED, { pluginId, type: 'widget', id: def.id })
      },
      unregister(id) {
        WidgetRegistry.unregister(id)
      },
    },

    // ── テーマ ──────────────────────────────────────
    theme: {
      /**
       * CSS変数だけを上書きする（configStore には保存しない）。
       * テーマ全置換ではなく部分オーバーライド用。
       */
      override(patch) {
        // patch: { accentColor?, bgColor?, panelColor?, ... }
        applyCSSVars(patch)
      },
      onChanged(fn) {
        bus.on(EVENTS.THEME_CHANGED, fn)
        _listeners.push({ event: EVENTS.THEME_CHANGED, fn })
      },
    },

    // ── EventBus ───────────────────────────────────
    events: {
      on(channel, fn) {
        bus.on(channel, fn)
        _listeners.push({ event: channel, fn })
      },
      off(channel, fn) {
        bus.off(channel, fn)
      },
      emit(channel, data) {
        // プラグインは任意チャンネルに emit できる
        // ただし内部 EVENTS への上書きは防ぐ
        const reserved = Object.values(EVENTS)
        if (reserved.includes(channel)) {
          console.warn(`[${pluginId}] reserved channel: ${channel}`)
          return
        }
        bus.emit(channel, data)
      },
    },

    // ── 設定 ────────────────────────────────────────
    config: {
      get:    (key) => configStore.get(`plugin.${pluginId}.${key}`),
      set:    (key, value) => configStore.set(`plugin.${pluginId}.${key}`, value),
      remove: (key) => configStore.remove(`plugin.${pluginId}.${key}`),
    },

    // ── electron-store ショートカット ───────────────
    store: typeof window !== 'undefined' ? window.api?.store : null,

    // ── ログ ────────────────────────────────────────
    log(...args) {
      console.log(`[Plugin:${pluginId}]`, ...args)
    },
    warn(...args) {
      console.warn(`[Plugin:${pluginId}]`, ...args)
    },
    error(...args) {
      console.error(`[Plugin:${pluginId}]`, ...args)
    },

    // ── 内部 (PluginHost が使う) ────────────────────
    _cleanup() {
      _listeners.forEach(({ event, fn }) => bus.off(event, fn))
      _listeners.length = 0
    },
  }

  return api
}

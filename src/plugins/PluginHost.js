/**
 * src/plugins/PluginHost.js
 *
 * プラグインのライフサイクルを管理する。
 * - IPC 経由で electron 側からプラグイン一覧を取得
 * - 各プラグインを動的 import でロード
 * - onLoad / onUnload を呼ぶ
 * - エラーは EVENTS.PLUGIN_ERROR として EventBus に流す
 *
 * 使い方:
 *   import pluginHost from './PluginHost'
 *   await pluginHost.init()         // アプリ起動時
 *   await pluginHost.reload(id)     // ホットリロード
 *   pluginHost.getAll()             // 登録済み一覧
 */

import { createPluginAPI } from './PluginAPI'
import bus, { EVENTS } from '../core/eventBus'
import configStore from '../core/configStore'

class PluginHost {
  constructor() {
    /** @type {Map<string, { meta, api, module, status, error }>} */
    this._plugins = new Map()
    this._initialized = false
  }

  // ── 初期化 ────────────────────────────────────────
  async init() {
    if (this._initialized) return
    this._initialized = true   // ★ await前にセット（並列呼び出しで二重初期化しない）

    // electron 側から外部プラグイン一覧を取得
    const externals = await this._fetchExternalMetas()

    // 有効化リストを取得
    const enabledList = await configStore.get('plugins.enabled') ?? []
    const enabledSet  = new Set(enabledList)

    // 組み込みプラグイン（UIが管理するので PluginHost は meta だけ保持）
    BUILTIN_METAS.forEach(meta => {
      this._plugins.set(meta.id, {
        meta, api: null, module: null,
        status: enabledSet.has(meta.id) ? 'enabled' : 'disabled',
        error: null,
        builtin: true,
      })
    })

    // 外部プラグインをロード
    for (const meta of externals) {
      await this._load(meta, enabledSet.has(meta.id))
    }

    // electron からのホットリロード通知を受け取る
    if (window.api) {
      window.api.on('plugin:loaded', ({ pluginId }) => this.reload(pluginId))
    }
  }

  // ── 外部プラグイン一覧を IPC から取得 ─────────────
  async _fetchExternalMetas() {
    if (!window.api?.plugins) return []
    try {
      return await window.api.plugins.list()
    } catch {
      return []
    }
  }

  // ── プラグインをロード ─────────────────────────────
  async _load(meta, enabled = true) {
    const existing = this._plugins.get(meta.id)

    // 既にロード済みなら先に unload
    if (existing?.module) {
      await this._unload(meta.id)
    }

    const entry = {
      meta,
      api: null,
      module: null,
      status: 'loading',
      error: null,
      builtin: false,
    }
    this._plugins.set(meta.id, entry)

    if (!enabled) {
      entry.status = 'disabled'
      return
    }

    try {
      // 外部プラグインは IPC 経由でコードを取得し Function で評価
      // セキュリティ: プラグインは renderer プロセス内のサンドボックスで動く
      const api = createPluginAPI(meta.id)
      entry.api = api

      // electron 側からプラグインのモジュールオブジェクトを取得
      const pluginModule = await window.api.plugins.load(meta.id)

      if (!pluginModule || typeof pluginModule.onLoad !== 'function') {
        throw new Error('onLoad が見つかりません')
      }

      entry.module = pluginModule
      await pluginModule.onLoad(api)
      entry.status = 'enabled'

      api.log('loaded ✓')
      bus.emit(EVENTS.PLUGIN_LOADED, { pluginId: meta.id, meta })
    } catch (err) {
      entry.status = 'error'
      entry.error  = err.message
      bus.emit(EVENTS.PLUGIN_ERROR, { pluginId: meta.id, error: err.message })
      console.error(`[PluginHost] ${meta.id} load error:`, err)
    }
  }

  // ── プラグインを unload ────────────────────────────
  async _unload(id) {
    const entry = this._plugins.get(id)
    if (!entry) return

    try {
      if (entry.module?.onUnload) await entry.module.onUnload()
      entry.api?._cleanup()
    } catch (err) {
      console.warn(`[PluginHost] ${id} unload error:`, err)
    }

    entry.module = null
    entry.api    = null
    entry.status = 'disabled'
  }

  // ── ホットリロード ─────────────────────────────────
  async reload(id) {
    const entry = this._plugins.get(id)
    if (!entry || entry.builtin) return
    await this._load(entry.meta, true)
  }

  // ── 有効化 / 無効化 ───────────────────────────────
  async enable(id) {
    const entry = this._plugins.get(id)
    if (!entry) return
    if (!entry.builtin) await this._load(entry.meta, true)
    else entry.status = 'enabled'

    const list = await configStore.get('plugins.enabled') ?? []
    if (!list.includes(id)) {
      await configStore.set('plugins.enabled', [...list, id])
    }
    bus.emit(EVENTS.PLUGIN_LOADED, { pluginId: id })
  }

  async disable(id) {
    const entry = this._plugins.get(id)
    if (!entry) return
    if (!entry.builtin) await this._unload(id)
    else entry.status = 'disabled'

    const list = await configStore.get('plugins.enabled') ?? []
    await configStore.set('plugins.enabled', list.filter(x => x !== id))
    bus.emit(EVENTS.PLUGIN_UNLOADED, { pluginId: id })
  }

  // ── 一覧取得 ──────────────────────────────────────
  getAll() {
    return Array.from(this._plugins.values())
  }

  get(id) {
    return this._plugins.get(id) ?? null
  }

  isEnabled(id) {
    return this._plugins.get(id)?.status === 'enabled'
  }
}

// ── 組み込みプラグイン定義 ────────────────────────────
const BUILTIN_METAS = [
  { id: 'clock-widget',      name: '時計ウィジェット',      version: '1.0.0', author: 'built-in', icon: '🕐', tags: ['widget','time'],   description: 'デスクトップにリアルタイム時計を表示します。' },
  { id: 'sysmonitor-widget', name: 'システム監視ウィジェット', version: '1.0.0', author: 'built-in', icon: '📊', tags: ['widget','system'], description: 'CPU・メモリ使用率をリアルタイムで監視します。' },
  { id: 'note-widget',       name: 'メモウィジェット',       version: '1.0.0', author: 'built-in', icon: '📝', tags: ['widget','note'],   description: 'デスクトップに付箋メモを配置できます。' },
]

const pluginHost = new PluginHost()
export default pluginHost

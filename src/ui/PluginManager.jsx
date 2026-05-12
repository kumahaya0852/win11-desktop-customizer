import { useState, useEffect, useCallback } from 'react'
import pluginHost from '../plugins/PluginHost'
import bus, { EVENTS } from '../core/eventBus'
import styles from './Panel.module.css'
import pStyles from './PluginManager.module.css'

export default function PluginManager() {
  const [plugins, setPlugins]   = useState([])
  const [filter, setFilter]     = useState('')
  const [selected, setSelected] = useState(null)
  const [status, setStatus]     = useState(null)
  const [scanning, setScanning] = useState(false)

  // プラグイン一覧を pluginHost から取得
  const refresh = useCallback(() => {
    setPlugins(pluginHost.getAll())
  }, [])

  useEffect(() => {
    refresh()

    // EventBus でプラグイン状態変化を購読
    bus.on(EVENTS.PLUGIN_LOADED,   refresh)
    bus.on(EVENTS.PLUGIN_UNLOADED, refresh)
    bus.on(EVENTS.PLUGIN_ERROR,    refresh)
    return () => {
      bus.off(EVENTS.PLUGIN_LOADED,   refresh)
      bus.off(EVENTS.PLUGIN_UNLOADED, refresh)
      bus.off(EVENTS.PLUGIN_ERROR,    refresh)
    }
  }, [refresh])

  function flash(type, msg) {
    setStatus({ type, msg })
    setTimeout(() => setStatus(null), 2000)
  }

  async function handleToggle(id) {
    const entry = plugins.find(p => p.meta.id === id)
    if (!entry) return
    if (entry.status === 'enabled') {
      await pluginHost.disable(id)
      flash('ok', `"${entry.meta.name}" を無効化しました`)
    } else {
      await pluginHost.enable(id)
      flash('ok', `"${entry.meta.name}" を有効化しました`)
    }
    refresh()
  }

  async function handleRescan() {
    setScanning(true)
    try {
      if (window.api?.plugins) await window.api.plugins.rescan()
      await pluginHost.init()
      refresh()
      flash('ok', 'プラグインフォルダをスキャンしました')
    } finally {
      setScanning(false)
    }
  }

  async function handleOpenFolder() {
    if (window.api?.plugins) {
      await window.api.plugins.openFolder()
    } else {
      flash('err', 'Electron上でのみ有効です')
    }
  }

  const filtered = plugins.filter(p =>
    !filter ||
    p.meta.name.includes(filter) ||
    p.meta.tags?.some(t => t.includes(filter)) ||
    p.meta.id.includes(filter)
  )

  const selEntry = plugins.find(p => p.meta.id === selected)

  const builtins  = filtered.filter(p => p.builtin)
  const externals = filtered.filter(p => !p.builtin)

  return (
    <div className={styles.panel} style={{ padding: 0, flexDirection: 'row', gap: 0, overflow: 'hidden' }}>

      {/* ── 左：プラグイン一覧 ── */}
      <div className={pStyles.sidebar}>
        <div className={pStyles.searchWrap}>
          <input
            className={pStyles.search}
            placeholder="🔍 検索..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>

        <div className={pStyles.list}>
          {/* 組み込み */}
          {builtins.length > 0 && (
            <>
              <div className={pStyles.groupLabel}>組み込み</div>
              {builtins.map(entry => (
                <PluginItem
                  key={entry.meta.id}
                  entry={entry}
                  active={selected === entry.meta.id}
                  onClick={() => setSelected(entry.meta.id)}
                  onToggle={() => handleToggle(entry.meta.id)}
                />
              ))}
            </>
          )}

          {/* 外部 */}
          <div className={pStyles.groupLabel} style={{ marginTop: builtins.length ? 8 : 0 }}>
            外部プラグイン
            <button className={pStyles.rescanBtn} onClick={handleRescan} disabled={scanning}>
              {scanning ? '...' : '↺'}
            </button>
          </div>
          {externals.length === 0 ? (
            <div className={pStyles.emptyExternal}>
              <span style={{ fontSize: 24, opacity: 0.3 }}>⬡</span>
              <p>外部プラグインがありません</p>
              <p style={{ fontSize: 10 }}>plugins-external/ に配置してください</p>
            </div>
          ) : (
            externals.map(entry => (
              <PluginItem
                key={entry.meta.id}
                entry={entry}
                active={selected === entry.meta.id}
                onClick={() => setSelected(entry.meta.id)}
                onToggle={() => handleToggle(entry.meta.id)}
              />
            ))
          )}
        </div>

        <div className={pStyles.sidebarFooter}>
          <button className={pStyles.folderBtn} onClick={handleOpenFolder}>
            📁 プラグインフォルダを開く
          </button>
        </div>
      </div>

      {/* ── 右：詳細 ── */}
      <div className={pStyles.detail}>
        {!selEntry ? (
          <div className={pStyles.noSelect}>
            <span style={{ fontSize: 40, opacity: 0.2 }}>⬡</span>
            <p>プラグインを選択すると詳細が表示されます</p>
          </div>
        ) : (
          <PluginDetail
            entry={selEntry}
            onToggle={() => handleToggle(selEntry.meta.id)}
          />
        )}

        {/* Plugin API リファレンス */}
        <div className={pStyles.apiRef}>
          <div className={pStyles.apiRefTitle}>Plugin API リファレンス</div>
          <div className={pStyles.apiRefCode}>{API_SAMPLE}</div>
        </div>

        {status && (
          <div className={pStyles.statusBar}>
            <span className={`${pStyles.toast} ${pStyles[status.type]}`}>{status.msg}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── プラグイン1行コンポーネント ──────────────────────────
function PluginItem({ entry, active, onClick, onToggle }) {
  const { meta, status } = entry
  const isOn = status === 'enabled'
  const isErr = status === 'error'

  return (
    <div
      className={`${pStyles.item} ${active ? pStyles.itemActive : ''} ${isErr ? pStyles.itemError : ''}`}
      onClick={onClick}
    >
      <span className={pStyles.itemIcon}>{meta.icon ?? '⬡'}</span>
      <div className={pStyles.itemInfo}>
        <span className={pStyles.itemName}>{meta.name}</span>
        <span className={pStyles.itemVersion}>
          v{meta.version}
          {isErr && <span className={pStyles.errBadge}>エラー</span>}
        </span>
      </div>
      <div
        className={`${pStyles.toggle} ${isOn ? pStyles.toggleOn : ''}`}
        onClick={e => { e.stopPropagation(); onToggle() }}
        title={isOn ? '無効化' : '有効化'}
      />
    </div>
  )
}

// ── プラグイン詳細パネル ────────────────────────────────
function PluginDetail({ entry, onToggle }) {
  const { meta, status, error, builtin } = entry
  const isOn = status === 'enabled'

  return (
    <div className={pStyles.detailBody}>
      <div className={pStyles.detailHeader}>
        <span className={pStyles.detailIcon}>{meta.icon ?? '⬡'}</span>
        <div style={{ flex: 1 }}>
          <h2 className={pStyles.detailName}>{meta.name}</h2>
          <p className={pStyles.detailMeta}>
            v{meta.version} · {meta.author ?? '不明'}
            {builtin && <span className={pStyles.builtinBadge}>組み込み</span>}
          </p>
        </div>
        <button
          className={`${pStyles.toggleBtn} ${isOn ? pStyles.toggleBtnOn : ''}`}
          onClick={onToggle}
        >
          {isOn ? '有効' : '無効'}
        </button>
      </div>

      <p className={pStyles.detailDesc}>{meta.description}</p>

      {error && (
        <div className={pStyles.errorBox}>
          <span style={{ color: 'var(--err)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            ⚠ {error}
          </span>
        </div>
      )}

      {meta.tags && (
        <div className={pStyles.tags}>
          {meta.tags.map(t => <span key={t} className={pStyles.tag}>{t}</span>)}
        </div>
      )}

      <div className={pStyles.statusRow}>
        <span className={pStyles.statusLabel}>状態</span>
        <StatusDot status={status} />
      </div>
    </div>
  )
}

function StatusDot({ status }) {
  const map = {
    enabled:  { color: 'var(--ok)',   label: '動作中' },
    disabled: { color: 'var(--text-muted)', label: '無効' },
    loading:  { color: 'var(--warn)', label: '読み込み中' },
    error:    { color: 'var(--err)',  label: 'エラー' },
  }
  const s = map[status] ?? map.disabled
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
      <span style={{ color: s.color }}>{s.label}</span>
    </span>
  )
}

const API_SAMPLE = `// plugins-external/my-plugin/index.js
module.exports = {
  onLoad(api) {
    // ウィジェット登録
    api.widgets.register({
      id: 'my-widget',
      name: 'マイウィジェット',
      icon: '⭐',
      defaultSize: { w: 200, h: 120 },
      minSize:     { w: 160, h: 80 },
      component: () => import('./Widget.jsx'),
    })
    // テーマ変更を購読
    api.theme.onChanged(t => api.log('theme:', t.name))
    // 設定の読み書き
    api.config.get('count').then(n => api.log('count:', n))
  },
  onUnload() { /* cleanup */ },
}`

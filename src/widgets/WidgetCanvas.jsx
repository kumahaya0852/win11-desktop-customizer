import { useState, useEffect } from 'react'
import { useWidgets } from '../hooks/useWidgets'
import { getAll } from './WidgetRegistry'
import styles from './WidgetCanvas.module.css'

const SNAP = 12
function snap(v) { return Math.round(v / SNAP) * SNAP }

const Z_LEVELS = [
  { value: 'top',    label: '最前面',   icon: '⬆', color: 'var(--accent)' },
  { value: 'normal', label: '通常',     icon: '＝', color: 'var(--text-secondary)' },
  { value: 'bottom', label: '壁紙の上', icon: '⬇', color: 'var(--text-muted)' },
]

const isElectron = typeof window !== 'undefined' && typeof window.api !== 'undefined'

export default function WidgetCanvas() {
  const { widgets, addWidget, updateWidget, removeWidget, ready } = useWidgets()
  const [showPicker, setShowPicker] = useState(false)
  const [editMode,   setEditMode]   = useState(false)

  // オーバーレイから編集モード状態を受信
  useEffect(() => {
    if (!isElectron) return
    const handler = (enabled) => setEditMode(!!enabled)
    window.api.on('overlay:editMode', handler)
    return () => window.api.off('overlay:editMode', handler)
  }, [])

  async function toggleEditMode() {
    if (!isElectron) return
    const next = !editMode
    await window.api.overlay.setEditMode(next)
    setEditMode(next)
  }

  if (!ready) return <div className={styles.loading}>ウィジェットを読み込み中...</div>

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <h1 className={styles.title}>ウィジェット</h1>
        <div className={styles.toolbarRight}>
          {isElectron && (
            <ToolToggle
              active={editMode}
              onClick={toggleEditMode}
              icon="✏️"
              label={editMode ? '編集中' : 'デスクトップ編集'}
              activeColor="var(--accent)"
            />
          )}
          <button className={styles.addBtn}
            onClick={() => setShowPicker(v => !v)}>
            ＋ 追加
          </button>
        </div>
      </div>

      {editMode && isElectron && (
        <div className={styles.overlayBar}>
          <span className={styles.overlayDot} />
          <span>デスクトップ上でドラッグして移動・リサイズできます</span>
        </div>
      )}

      {showPicker && (
        <WidgetPicker
          onSelect={(type) => {
            addWidget(type, {
              x: snap(60 + (widgets.length % 8) * 24),
              y: snap(60 + (widgets.length % 8) * 24),
            })
            setShowPicker(false)
          }}
          onClose={() => setShowPicker(false)}
        />
      )}

      <div className={styles.list}>
        {widgets.length === 0 ? (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 10, padding: '48px 20px', textAlign: 'center',
          }}>
            <span style={{ fontSize: 38, opacity: 0.15 }}>⊞</span>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              「追加」からウィジェットを配置できます
            </p>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.6 }}>
              追加したウィジェットはデスクトップに表示されます
            </span>
          </div>
        ) : (
          widgets.map(w => (
            <WidgetRow
              key={w.id}
              widget={w}
              onToggleVisible={() => updateWidget(w.id, { visible: w.visible !== false ? false : true })}
              onRemove={() => removeWidget(w.id)}
              onChangeZLevel={(zLevel) => updateWidget(w.id, { zLevel })}
            />
          ))
        )}
      </div>
    </div>
  )
}

function ToolToggle({ active, onClick, icon, label, activeColor }) {
  return (
    <button
      className={`${styles.toolBtn} ${active ? styles.toolBtnActive : ''}`}
      style={active && activeColor ? { color: activeColor, borderColor: activeColor, background: `${activeColor}18` } : {}}
      onClick={onClick} title={label}>
      <span>{icon}</span>
      <span className={styles.toolBtnLabel}>{label}</span>
    </button>
  )
}

function WidgetRow({ widget, onToggleVisible, onRemove, onChangeZLevel }) {
  const def       = getAll().find(d => d.id === widget.type)
  const isVisible = widget.visible !== false
  const zLevel    = widget.zLevel ?? 'normal'
  const zDef      = Z_LEVELS.find(z => z.value === zLevel) ?? Z_LEVELS[1]

  function cycleZLevel() {
    const idx = Z_LEVELS.findIndex(z => z.value === zLevel)
    onChangeZLevel(Z_LEVELS[(idx + 1) % Z_LEVELS.length].value)
  }

  return (
    <div className={styles.widgetRow} style={{ opacity: isVisible ? 1 : 0.55 }}>
      <span className={styles.widgetRowIcon}>{def?.icon ?? '⊞'}</span>
      <div className={styles.widgetRowInfo}>
        <span className={styles.widgetRowName}>{def?.name ?? widget.type}</span>
        <span className={styles.widgetRowMeta}>
          {widget.x}, {widget.y} · {widget.w}×{widget.h}
        </span>
      </div>
      <div className={styles.widgetRowActions}>
        <button
          className={`${styles.rowBtn} ${isVisible ? styles.rowBtnActive : ''}`}
          onClick={onToggleVisible}
          title={isVisible ? '非表示にする' : '表示する'}
        >
          {isVisible ? '👁' : '—'}
        </button>
        {isElectron && (
          <button
            className={styles.rowBtn}
            onClick={cycleZLevel}
            title={`階層: ${zDef.label}`}
            style={{ color: zDef.color }}
          >
            {zDef.icon}
          </button>
        )}
        <button
          className={`${styles.rowBtn} ${styles.rowBtnDanger}`}
          onClick={onRemove}
          title="削除"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

function WidgetPicker({ onSelect, onClose }) {
  return (
    <div className={styles.picker}>
      <div className={styles.pickerHeader}>
        <span>ウィジェットを選択</span>
        <button className={styles.pickerClose} onClick={onClose}>✕</button>
      </div>
      <div className={styles.pickerList}>
        {getAll().map(def => (
          <button key={def.id} className={styles.pickerItem} onClick={() => onSelect(def.id)}>
            <span className={styles.pickerIcon}>{def.icon}</span>
            <div className={styles.pickerInfo}>
              <span className={styles.pickerName}>{def.name}</span>
              <span className={styles.pickerSize}>{def.defaultSize.w} × {def.defaultSize.h}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

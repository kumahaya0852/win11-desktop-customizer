import { useState, useRef, useCallback, lazy, Suspense, useEffect } from 'react'
import { useWidgets } from '../hooks/useWidgets'
import { getAll } from './WidgetRegistry'
import styles from './WidgetCanvas.module.css'

const SNAP = 12
function snap(v) { return Math.round(v / SNAP) * SNAP }

// ウィジェット個別のzLevel（ウィンドウ単位で制御）
const Z_LEVELS = [
  { value: 'top',    label: '最前面', icon: '⬆', color: 'var(--accent)', desc: '全ウィンドウの前面' },
  { value: 'normal', label: '通常',   icon: '＝', color: 'var(--text-secondary)', desc: '通常のウィンドウ階層' },
  { value: 'bottom', label: '壁紙の上', icon: '⬇', color: 'var(--text-muted)', desc: '全ウィンドウの後ろ' },
]

const isElectron = typeof window !== 'undefined' && typeof window.api !== 'undefined'

export default function WidgetCanvas() {
  const { widgets, addWidget, updateWidget, removeWidget, ready } = useWidgets()
  const [showPicker, setShowPicker] = useState(false)
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [locked, setLocked] = useState(false)
  const [editMode, setEditMode] = useState(false)
  // ★ デフォルトON
  const [desktopEnabled, setDesktopEnabled] = useState(true)

  // 起動時にウィジェットウィンドウを同期（デフォルトON）
  useEffect(() => {
    if (!isElectron || !ready) return
    const visibleWidgets = widgets.filter(w => w.visible !== false)
    if (visibleWidgets.length > 0) {
      window.api.widgets.syncAll(widgets).catch(() => {})
    }
  }, [ready])

  // ウィジェット移動通知を受信
  useEffect(() => {
    if (!isElectron) return
    const handler = ({ id, x, y }) => updateWidget(id, { x, y })
    window.api.on('overlay:widgetMoved', handler)
    return () => window.api.off('overlay:widgetMoved', handler)
  }, [updateWidget])

  // 編集モード同期
  useEffect(() => {
    if (!isElectron) return
    const handler = (enabled) => setEditMode(!!enabled)
    window.api.on('overlay:editMode', handler)
    return () => window.api.off('overlay:editMode', handler)
  }, [])

  async function toggleEditMode() {
    if (!isElectron) return
    const next = !editMode
    await window.api.widgets.setEditMode(next)
    setEditMode(next)
  }

  async function toggleDesktop() {
    const next = !desktopEnabled
    setDesktopEnabled(next)
    if (!isElectron) return
    if (next) {
      // 全ウィジェットウィンドウを表示
      await window.api.widgets.syncAll(widgets)
    } else {
      // 全ウィジェットウィンドウを閉じる
      await window.api.widgets.destroyAll()
    }
  }

  if (!ready) return <div className={styles.loading}>ウィジェットを読み込み中...</div>

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <h1 className={styles.title}>ウィジェット</h1>
        <div className={styles.toolbarRight}>
          <ToolToggle active={snapEnabled} onClick={() => setSnapEnabled(v => !v)}
            icon="⊹" label={`スナップ ${snapEnabled ? 'ON' : 'OFF'}`} />
          <ToolToggle active={locked} onClick={() => setLocked(v => !v)}
            icon={locked ? '🔒' : '🔓'}
            label={locked ? 'ロック中' : 'ロック'} activeColor="var(--warn)" />

          {isElectron && (
            <>
              <div className={styles.divider} />
              <ToolToggle
                active={desktopEnabled}
                onClick={toggleDesktop}
                icon="🖥"
                label={desktopEnabled ? 'デスクトップ表示中' : 'デスクトップ表示'}
                activeColor="var(--ok)"
              />
              {desktopEnabled && (
                <ToolToggle
                  active={editMode}
                  onClick={toggleEditMode}
                  icon="✏️"
                  label={editMode ? '編集中' : 'デスクトップ編集'}
                  activeColor="var(--accent)"
                />
              )}
            </>
          )}

          <button className={styles.addBtn}
            onClick={() => setShowPicker(v => !v)} disabled={locked}>
            ＋ 追加
          </button>
        </div>
      </div>

      {desktopEnabled && isElectron && (
        <div className={styles.overlayBar}>
          <span className={styles.overlayDot} />
          <span>デスクトップ上でウィジェットを表示中（ウィジェットごとに独立したウィンドウ）</span>
        </div>
      )}

      {showPicker && (
        <WidgetPicker
          onSelect={(type) => {
            addWidget(type, { x: snap(60 + widgets.length * 24), y: snap(60 + widgets.length * 24) })
            setShowPicker(false)
          }}
          onClose={() => setShowPicker(false)}
        />
      )}

      <div className={styles.canvas}>
        {widgets.length === 0 && (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>⊞</span>
            <p>「追加」からウィジェットを配置できます</p>
            <span className={styles.emptyHint}>各ウィジェットは独立したウィンドウとしてデスクトップに表示されます</span>
          </div>
        )}
        {widgets.map(w => (
          <DraggableWidget
            key={w.id}
            widget={w}
            locked={locked}
            snapEnabled={snapEnabled}
            desktopEnabled={desktopEnabled}
            onMove={(x, y)     => updateWidget(w.id, { x, y })}
            onResize={(ww, hh) => updateWidget(w.id, { w: ww, h: hh })}
            onRemove={()       => removeWidget(w.id)}
            onUpdateConfig={(cfg) => updateWidget(w.id, { config: { ...w.config, ...cfg } })}
            onToggleVisible={() => updateWidget(w.id, { visible: w.visible === false ? true : false })}
            onChangeZLevel={(zLevel) => updateWidget(w.id, { zLevel })}
          />
        ))}
      </div>
    </div>
  )
}

function ToolToggle({ active, onClick, icon, label, activeColor, disabled }) {
  return (
    <button
      className={`${styles.toolBtn} ${active ? styles.toolBtnActive : ''}`}
      style={active && activeColor ? { color: activeColor, borderColor: activeColor, background: `${activeColor}18` } : {}}
      onClick={onClick} title={label} disabled={disabled}>
      <span>{icon}</span>
      <span className={styles.toolBtnLabel}>{label}</span>
    </button>
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

function DraggableWidget({ widget, locked, snapEnabled, desktopEnabled,
  onMove, onResize, onRemove, onUpdateConfig, onToggleVisible, onChangeZLevel }) {

  const dragRef   = useRef(null)
  const resizeRef = useRef(null)
  const zMenuRef  = useRef(null)
  const [pos,      setPos]      = useState({ x: widget.x, y: widget.y })
  const [size,     setSize]     = useState({ w: widget.w, h: widget.h })
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)
  const [showZMenu, setShowZMenu] = useState(false)

  const currentZLevel = widget.zLevel ?? 'normal'
  const isVisible = widget.visible !== false
  const applySnap = useCallback((v) => snapEnabled ? snap(v) : v, [snapEnabled])

  // 外側クリックでメニューを閉じる
  useEffect(() => {
    if (!showZMenu) return
    const handler = (e) => {
      if (zMenuRef.current && !zMenuRef.current.contains(e.target)) {
        setShowZMenu(false)
      }
    }
    const id = setTimeout(() => document.addEventListener('click', handler), 0)
    return () => { clearTimeout(id); document.removeEventListener('click', handler) }
  }, [showZMenu])

  const onDragDown = useCallback((e) => {
    if (locked || e.target.closest('[data-no-drag]')) return
    e.preventDefault()
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y }
    setDragging(true)
    const move = (e2) => {
      if (!dragRef.current) return
      setPos({
        x: Math.max(0, applySnap(dragRef.current.ox + e2.clientX - dragRef.current.sx)),
        y: Math.max(0, applySnap(dragRef.current.oy + e2.clientY - dragRef.current.sy)),
      })
    }
    const up = (e2) => {
      if (!dragRef.current) return
      onMove(
        Math.max(0, applySnap(dragRef.current.ox + e2.clientX - dragRef.current.sx)),
        Math.max(0, applySnap(dragRef.current.oy + e2.clientY - dragRef.current.sy))
      )
      dragRef.current = null; setDragging(false)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }, [locked, pos, onMove, applySnap])

  const onResizeDown = useCallback((e) => {
    e.preventDefault(); e.stopPropagation()
    const def = getAll().find(d => d.id === widget.type)
    resizeRef.current = { sx: e.clientX, sy: e.clientY, ow: size.w, oh: size.h,
      minW: def?.minSize?.w ?? 120, minH: def?.minSize?.h ?? 80 }
    setResizing(true)
    const move = (e2) => {
      if (!resizeRef.current) return
      setSize({
        w: Math.max(resizeRef.current.minW, applySnap(resizeRef.current.ow + e2.clientX - resizeRef.current.sx)),
        h: Math.max(resizeRef.current.minH, applySnap(resizeRef.current.oh + e2.clientY - resizeRef.current.sy)),
      })
    }
    const up = (e2) => {
      if (!resizeRef.current) return
      onResize(
        Math.max(resizeRef.current.minW, applySnap(resizeRef.current.ow + e2.clientX - resizeRef.current.sx)),
        Math.max(resizeRef.current.minH, applySnap(resizeRef.current.oh + e2.clientY - resizeRef.current.sy))
      )
      resizeRef.current = null; setResizing(false)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }, [size, onResize, widget.type, applySnap])

  const WidgetContent = getWidgetComponent(widget.type)
  const zDef = Z_LEVELS.find(z => z.value === currentZLevel) ?? Z_LEVELS[1]

  return (
    <div
      className={[
        styles.widget,
        dragging ? styles.dragging : '',
        resizing ? styles.resizing : '',
        locked ? styles.widgetLocked : '',
        !isVisible ? styles.widgetHidden : '',
      ].join(' ')}
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
      onMouseDown={onDragDown}
    >
      <div className={styles.widgetHeader}>
        <span className={styles.widgetDragIcon}>{locked ? '🔒' : '⠿'}</span>
        <span className={styles.widgetTitle}>{getWidgetName(widget.type)}</span>

        {!locked && (
          <div data-no-drag className={styles.widgetActions}>

            {/* ★ デスクトップ表示トグル */}
            {isElectron && desktopEnabled && (
              <button
                data-no-drag
                className={`${styles.visBtn} ${isVisible ? styles.visBtnOn : styles.visBtnOff}`}
                onClick={onToggleVisible}
                title={isVisible ? 'デスクトップ非表示にする' : 'デスクトップに表示する'}
              >
                {isVisible ? '🖥' : '🖥̶'}
              </button>
            )}

            {/* ★ 個別zLevelセレクター */}
            <ZLevelMenu
              zDef={zDef}
              currentZLevel={currentZLevel}
              showZMenu={showZMenu}
              setShowZMenu={setShowZMenu}
              zMenuRef={zMenuRef}
              onChangeZLevel={onChangeZLevel}
              widgetPos={pos}
              widgetSize={size}
            />

            <button data-no-drag className={styles.widgetClose} onClick={onRemove} title="削除">✕</button>
          </div>
        )}
      </div>

      <div className={styles.widgetBody} data-no-drag style={{ opacity: isVisible ? 1 : 0.4 }}>
        <Suspense fallback={<div className={styles.widgetLoading}>...</div>}>
          <WidgetContent config={widget.config} />
        </Suspense>
      </div>

      {!locked && (
        <div data-no-drag
          className={`${styles.resizeHandle} ${resizing ? styles.resizeHandleActive : ''}`}
          onMouseDown={onResizeDown} />
      )}
    </div>
  )
}

// ── ZLevelMenu: 常に最前面・下で見切れるときだけ上に出す ─
const MENU_HEIGHT = 148  // メニューの実高さ（px）

function ZLevelMenu({ zDef, currentZLevel, showZMenu, setShowZMenu, zMenuRef, onChangeZLevel }) {
  const btnRef = useRef(null)
  const [openUpward, setOpenUpward] = useState(false)

  useEffect(() => {
    if (!showZMenu || !btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    // ボタン下端からウィンドウ下端までのスペースが足りなければ上に出す
    const spaceBelow = window.innerHeight - rect.bottom
    setOpenUpward(spaceBelow < MENU_HEIGHT + 8)
  }, [showZMenu])

  return (
    <div data-no-drag style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        data-no-drag
        className={`${styles.zBtn} ${showZMenu ? styles.zBtnOpen : ''}`}
        style={{ color: zDef.color }}
        onClick={() => setShowZMenu(v => !v)}
        title={`階層: ${zDef.label}`}
      >
        {zDef.icon}
      </button>
      {showZMenu && (
        <div
          ref={zMenuRef}
          className={styles.zMenu}
          style={{
            position: 'fixed',   // ★ fixed で最前面・見切れなし
            zIndex: 99999,
            // ボタン位置を基準に計算
            ...(() => {
              if (!btnRef.current) return {}
              const r = btnRef.current.getBoundingClientRect()
              if (openUpward) {
                return { bottom: window.innerHeight - r.top + 4, right: window.innerWidth - r.right, top: 'auto' }
              }
              return { top: r.bottom + 4, right: window.innerWidth - r.right, bottom: 'auto' }
            })(),
          }}
        >
          <div className={styles.zMenuHeader}>ウィンドウ階層</div>
          {Z_LEVELS.map(z => (
            <button key={z.value} data-no-drag
              className={`${styles.zMenuItem} ${currentZLevel === z.value ? styles.zMenuItemActive : ''}`}
              onClick={() => { onChangeZLevel(z.value); setShowZMenu(false) }}
            >
              <span className={styles.zMenuItemIcon} style={{ color: z.color }}>{z.icon}</span>
              <div className={styles.zMenuItemInfo}>
                <span className={styles.zMenuItemLabel}>{z.label}</span>
                <span className={styles.zMenuItemDesc}>{z.desc}</span>
              </div>
              {currentZLevel === z.value && <span className={styles.zMenuItemCheck}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const componentCache = new Map()
function getWidgetComponent(type) {
  if (componentCache.has(type)) return componentCache.get(type)
  const def = getAll().find(d => d.id === type)
  if (!def) { const F = () => <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 12 }}>不明: {type}</div>; componentCache.set(type, F); return F }
  const C = lazy(def.component); componentCache.set(type, C); return C
}
function getWidgetName(type) { return getAll().find(d => d.id === type)?.name ?? type }

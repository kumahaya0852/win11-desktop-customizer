import { useState, useEffect, useRef } from 'react'
import { getActiveMode, getModeList, applyMode } from '../core/modeManager'
import { useWidgets } from '../hooks/useWidgets'
import { useTheme } from '../hooks/useTheme'
import bus from '../core/eventBus'
import styles from './Drawer.module.css'

const THEME_PRESETS = [
  { id: 'default-dark', name: 'Dark',       accent: '#5b8cff' },
  { id: 'nordic',       name: 'Nordic',     accent: '#88c0d0' },
  { id: 'rose-pine',    name: 'Rose',       accent: '#eb6f92' },
  { id: 'gruvbox',      name: 'Gruvbox',    accent: '#d79921' },
  { id: 'catppuccin',   name: 'Catppuccin', accent: '#cba6f7' },
]

export default function Drawer() {
  const [open,        setOpen]        = useState(false)
  const [editMode,    setEditMode]    = useState(false)
  const [activeMode,  setActiveMode]  = useState(null)
  const [accentColor, setAccentColor] = useState('#5b8cff')
  const { widgets, updateWidget } = useWidgets()
  const { theme, apply: applyTheme } = useTheme()

  // クリックスルー制御
  useEffect(() => {
    if (editMode) return  // 編集中は setEditLayout が制御する
    window.api?.window?.setClickThrough?.(!open)
  }, [open, editMode])

  // 編集モード切り替え
  useEffect(() => {
    if (editMode) {
      setOpen(false)
      window.api?.window?.setEditLayout?.(true)
    } else {
      window.api?.window?.setEditLayout?.(false)
    }
  }, [editMode])

  useEffect(() => {
    getActiveMode().then(m => setActiveMode(m))
    const handler = m => setActiveMode(m)
    bus.on('mode:changed', handler)
    return () => bus.off('mode:changed', handler)
  }, [])

  useEffect(() => {
    if (theme?.accentColor) setAccentColor(theme.accentColor)
  }, [theme])

  async function handleModeSelect(modeId) {
    const r = await applyMode(modeId)
    if (r.ok) setActiveMode(r.mode)
  }

  async function handleThemeSelect(preset) {
    await applyTheme({
      id: preset.id, name: preset.name,
      accentColor: preset.accent,
      bgColor: '#0a0a0a', panelColor: '#111111',
      applyToSystem: false,
    })
    setAccentColor(preset.accent)
  }

  if (editMode) {
    return (
      <EditCanvas
        widgets={widgets}
        accentColor={accentColor}
        onDone={() => setEditMode(false)}
        onMove={(id, x, y) => {
          updateWidget(id, { x, y })
          window.api?.widgets?.setPosition?.(id, x, y)
        }}
        onResize={(id, w, h) => {
          updateWidget(id, { w, h })
          window.api?.widgets?.resize?.(id, w, h)
        }}
      />
    )
  }

  return (
    <div className={styles.root}>
      {/* トグルボタン（上下ドラッグで位置変更） */}
      <DraggableToggle
        open={open}
        accentColor={accentColor}
        onClick={() => setOpen(v => !v)}
      />

      {/* ドロワー本体 */}
      <div className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`}
        style={{ '--accent': accentColor }}>

        <div className={styles.header}>
          <span className={styles.headerLogo} style={{ color: accentColor }}>◈</span>
          <span className={styles.headerTitle}>Win11 Customizer</span>
          <button className={styles.headerClose} onClick={() => setOpen(false)}>✕</button>
        </div>

        <div className={styles.content}>
          <section className={styles.section}>
            <div className={styles.sectionTitle}>モード</div>
            <div className={styles.modeGrid}>
              {getModeList().map(mode => (
                <button key={mode.id}
                  className={`${styles.modeBtn} ${activeMode?.id === mode.id ? styles.modeBtnActive : ''}`}
                  style={activeMode?.id === mode.id ? { '--m': mode.color } : {}}
                  onClick={() => handleModeSelect(mode.id)}
                  title={mode.desc}
                >
                  <span className={styles.modeBtnIcon}>{mode.icon}</span>
                  <span className={styles.modeBtnLabel}>{mode.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionTitle}>テーマ</div>
            <div className={styles.themeRow}>
              {THEME_PRESETS.map(p => (
                <button key={p.id}
                  className={`${styles.themeBtn} ${theme?.id === p.id ? styles.themeBtnActive : ''}`}
                  onClick={() => handleThemeSelect(p)}
                  title={p.name} style={{ '--c': p.accent }}
                >
                  <span className={styles.themeDot} style={{ background: p.accent }} />
                  <span className={styles.themeLabel}>{p.name}</span>
                </button>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionTitleRow}>
              <span className={styles.sectionTitle}>ウィジェット</span>
              <button
                className={styles.editBtn}
                style={{ '--accent': accentColor }}
                onClick={() => setEditMode(true)}
              >
                ✏ 配置を編集
              </button>
            </div>
            <div className={styles.widgetList}>
              {widgets.length === 0 && (
                <div className={styles.widgetEmpty}>
                  ウィジェットがありません<br/>
                  <span style={{ fontSize:10, opacity:0.6 }}>詳細設定から追加できます</span>
                </div>
              )}
              {widgets.map(w => (
                <div key={w.id} className={styles.widgetRow}>
                  <span className={styles.widgetIcon}>{WIDGET_ICONS[w.type] ?? '⊞'}</span>
                  <span className={styles.widgetName}>{getWidgetName(w.type)}</span>
                  <ToggleSwitch
                    value={w.visible !== false}
                    onChange={v => updateWidget(w.id, { visible: v })}
                    accent={accentColor}
                  />
                </div>
              ))}
            </div>
          </section>

          <div className={styles.footerBtns}>
            <button className={styles.detailBtn}
              onClick={() => window.api?.window?.openDetail?.()}
              style={{ '--accent': accentColor }}>
              <span>⚙</span>
              <span>詳細設定</span>
              <span className={styles.detailBtnArrow}>›</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 全画面プレビュー編集キャンバス ────────────────────────
const SNAP = 12
function snap(v) { return Math.round(v / SNAP) * SNAP }

function EditCanvas({ widgets, accentColor, onDone, onMove, onResize }) {
  const [dragging, setDragging] = useState(null)
  const [resizing, setResizing] = useState(null)
  const [scaleX,   setScaleX]   = useState(1)
  const [scaleY,   setScaleY]   = useState(1)
  const dragRef    = useRef(null)

  // プレビュー座標で管理するローカルウィジェット
  // scaleX/Y が確定してから初期化する
  const [localWidgets, setLocalWidgets] = useState([])
  const initialized = useRef(false)

  // workArea を IPC で取得してスケールを確定
  useEffect(() => {
    async function init() {
      let sx = 1, sy = 1
      try {
        const wa = await window.api?.app?.workArea?.()
        if (wa) {
          sx = window.innerWidth  / wa.width
          sy = window.innerHeight / wa.height
        } else {
          sx = window.innerWidth  / window.screen.availWidth
          sy = window.innerHeight / window.screen.availHeight
        }
      } catch {
        sx = window.innerWidth  / window.screen.availWidth
        sy = window.innerHeight / window.screen.availHeight
      }
      setScaleX(sx)
      setScaleY(sy)
      // スケール確定後に localWidgets を初期化（プレビュー座標に変換）
      setLocalWidgets(widgets.map(w => ({
        ...w,
        vx: w.x * sx,
        vy: w.y * sy,
        vw: w.w * sx,
        vh: w.h * sy,
      })))
      initialized.current = true
    }
    init()
  }, [])  // 初回のみ

  function toScreen(px, py) {
    return { x: Math.round(px / scaleX), y: Math.round(py / scaleY) }
  }

  function startDrag(e, widget) {
    e.preventDefault()
    dragRef.current = {
      id: widget.id,
      sx: e.clientX, sy: e.clientY,
      ox: widget.vx, oy: widget.vy,
    }
    setDragging(widget.id)

    const move = (e2) => {
      if (!dragRef.current) return
      const nx = Math.max(0, snap(dragRef.current.ox + e2.clientX - dragRef.current.sx))
      const ny = Math.max(0, snap(dragRef.current.oy + e2.clientY - dragRef.current.sy))
      // localWidgets の vx/vy を直接更新（_vx/_vy 不使用）
      setLocalWidgets(prev => prev.map(w =>
        w.id === widget.id ? { ...w, vx: nx, vy: ny } : w
      ))
      const sc = toScreen(nx, ny)
      window.api?.widgets?.setPosition?.(widget.id, sc.x, sc.y)
    }
    const up = (e2) => {
      if (!dragRef.current) return
      const nx = Math.max(0, snap(dragRef.current.ox + e2.clientX - dragRef.current.sx))
      const ny = Math.max(0, snap(dragRef.current.oy + e2.clientY - dragRef.current.sy))
      const sc = toScreen(nx, ny)
      // localWidgets を確定座標で更新してから onMove を呼ぶ
      setLocalWidgets(prev => prev.map(w =>
        w.id === widget.id ? { ...w, vx: nx, vy: ny, x: sc.x, y: sc.y } : w
      ))
      onMove(widget.id, sc.x, sc.y)
      dragRef.current = null
      setDragging(null)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  function startResize(e, widget) {
    e.preventDefault(); e.stopPropagation()
    dragRef.current = {
      id: widget.id,
      sx: e.clientX, sy: e.clientY,
      ow: widget.vw, oh: widget.vh,
    }
    setResizing(widget.id)

    const move = (e2) => {
      if (!dragRef.current) return
      const nw = Math.max(120 * scaleX, snap(dragRef.current.ow + e2.clientX - dragRef.current.sx))
      const nh = Math.max(80  * scaleY, snap(dragRef.current.oh + e2.clientY - dragRef.current.sy))
      setLocalWidgets(prev => prev.map(w =>
        w.id === widget.id ? { ...w, vw: nw, vh: nh } : w
      ))
      window.api?.widgets?.resize?.(widget.id, Math.round(nw / scaleX), Math.round(nh / scaleY))
    }
    const up = (e2) => {
      if (!dragRef.current) return
      const nw = Math.max(120 * scaleX, snap(dragRef.current.ow + e2.clientX - dragRef.current.sx))
      const nh = Math.max(80  * scaleY, snap(dragRef.current.oh + e2.clientY - dragRef.current.sy))
      const sw = Math.round(nw / scaleX)
      const sh = Math.round(nh / scaleY)
      setLocalWidgets(prev => prev.map(w =>
        w.id === widget.id ? { ...w, vw: nw, vh: nh, w: sw, h: sh } : w
      ))
      onResize(widget.id, sw, sh)
      dragRef.current = null
      setResizing(null)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  if (!initialized.current || localWidgets.length === 0) {
    return (
      <div style={{ position:'fixed', inset:0, display:'flex', alignItems:'center',
        justifyContent:'center', background:'rgba(0,0,0,0.3)', color:'rgba(255,255,255,0.5)',
        fontSize:14, fontFamily:'var(--font-ui)' }}>
        読み込み中...
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.15)',
      backdropFilter: 'blur(2px)',
      cursor: 'default',
      userSelect: 'none',
    }}>
      {/* 完了バー */}
      <div style={{
        position: 'absolute', top: 16, left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '8px 20px',
        background: 'rgba(8,8,18,0.92)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: 99,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        zIndex: 100,
        whiteSpace: 'nowrap',
      }}>
        <span style={{ width:8, height:8, borderRadius:'50%', background: accentColor,
          animation: 'blink 1.2s ease-in-out infinite', flexShrink:0 }} />
        <span style={{ fontSize:12, color:'rgba(255,255,255,0.8)', fontWeight:500 }}>
          編集モード — ドラッグで移動・右下でリサイズ
        </span>
        <button onClick={onDone} style={{
          padding: '5px 16px', border:'none', borderRadius:99,
          background: accentColor, color:'#fff',
          fontSize:12, fontWeight:600, cursor:'pointer',
        }}>完了</button>
      </div>

      {/* ウィジェットプレビュー */}
      {localWidgets.filter(w => w.visible !== false).map(w => {
        const isDrag = dragging === w.id
        const isRes  = resizing === w.id
        return (
          <div
            key={w.id}
            onMouseDown={(e) => startDrag(e, w)}
            style={{
              position: 'absolute',
              left: w.vx, top: w.vy,
              width: w.vw, height: w.vh,
              background: 'rgba(17,17,17,0.6)',
              border: `2px solid ${isDrag || isRes ? accentColor : 'rgba(255,255,255,0.25)'}`,
              borderRadius: 12,
              cursor: isDrag ? 'grabbing' : 'grab',
              boxShadow: isDrag || isRes
                ? `0 16px 48px rgba(0,0,0,0.6), 0 0 0 3px ${accentColor}44`
                : '0 4px 20px rgba(0,0,0,0.4)',
              transition: isDrag || isRes ? 'none' : 'border-color 0.15s',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
            }}
          >
            <div style={{
              padding: '5px 10px', fontSize: 10,
              background: 'rgba(0,0,0,0.4)',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', gap: 6,
              color: 'rgba(255,255,255,0.6)', flexShrink: 0,
              fontFamily: 'sans-serif',
            }}>
              <span>⠿</span>
              <span style={{ flex:1 }}>{WIDGET_NAMES[w.type] ?? w.type}</span>
              <span style={{
                fontSize: 9, padding:'1px 6px', borderRadius:99,
                background:`${accentColor}22`, color:accentColor,
                border:`1px solid ${accentColor}44`,
              }}>
                {w.zLevel === 'top' ? '最前面' : w.zLevel === 'bottom' ? '壁紙の上' : '通常'}
              </span>
            </div>
            <div
              onMouseDown={(e) => startResize(e, w)}
              style={{
                position: 'absolute', right:0, bottom:0,
                width:20, height:20, cursor:'se-resize',
                display:'flex', alignItems:'flex-end', justifyContent:'flex-end',
                padding:3, zIndex:10,
              }}
            >
              <span style={{ fontSize:13,
                color: isRes ? accentColor : 'rgba(255,255,255,0.35)', lineHeight:1 }}>⊿</span>
            </div>
          </div>
        )
      })}
      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  )
}


// ── ドラッグで位置変更できるトグルボタン ─────────────────
const STORAGE_KEY = 'ui.toggle-pos-y'

function DraggableToggle({ open, accentColor, onClick }) {
  const btnRef   = useRef(null)
  const posYRef  = useRef(Math.round(window.innerHeight / 2 - 40))
  const dragRef  = useRef(null)

  // 起動時に保存済み位置を読み込んで DOM に反映
  useEffect(() => {
    async function loadPos() {
      const saved = await window.api?.store?.get?.(STORAGE_KEY)
      if (typeof saved === 'number' && btnRef.current) {
        posYRef.current = saved
        btnRef.current.style.top = saved + 'px'
      }
    }
    loadPos()
  }, [])

  const onMouseDown = (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    dragRef.current = { sy: e.clientY, oy: posYRef.current, moved: false }
    window.api?.window?.setClickThrough?.(false)

    let rafId = null
    const move = (e2) => {
      if (!dragRef.current) return
      const dy = Math.abs(e2.clientY - dragRef.current.sy)
      if (dy > 4) dragRef.current.moved = true
      if (!dragRef.current.moved) return

      // ★ rAF でスロットリング（60fps に制限・さらに滑らかに）
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        if (!dragRef.current) return
        const ny = Math.max(0, Math.min(
          window.innerHeight - 80,
          dragRef.current.oy + e2.clientY - dragRef.current.sy
        ))
        posYRef.current = ny
        if (btnRef.current) btnRef.current.style.top = ny + 'px'
      })
    }

    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      if (!dragRef.current) return
      const wasDragging = dragRef.current.moved
      dragRef.current = null

      if (wasDragging) {
        // ★ configStore 経由で保存（Electron でも確実に永続化）
        window.api?.store?.set?.(STORAGE_KEY, posYRef.current)
        if (!open) window.api?.window?.setClickThrough?.(true)
        // ドラッグ中はクラスでビジュアルを更新
        btnRef.current?.classList.remove(styles.toggleDragging)
      } else {
        onClick()
      }
    }

    btnRef.current?.classList.add(styles.toggleDragging)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <button
      ref={btnRef}
      className={`${styles.toggle} ${open ? styles.toggleOpen : ''}`}
      style={{
        '--accent': accentColor,
        position: 'absolute',
        left: 0,
        top: posYRef.current,
        transform: 'none',
        cursor: 'grab',
      }}
      onMouseDown={onMouseDown}
      onMouseEnter={() => { if (!open) window.api?.window?.setClickThrough?.(false) }}
      onMouseLeave={() => { if (!open) window.api?.window?.setClickThrough?.(true) }}
    >
      <span className={styles.toggleIcon}>◈</span>
      <span className={styles.toggleArrow}>{open ? '‹' : '›'}</span>
    </button>
  )
}

function ToggleSwitch({ value, onChange, accent }) {
  return (
    <div className={`${styles.toggle2} ${value ? styles.toggle2On : ''}`}
      style={value ? { background: accent } : {}}
      onClick={() => onChange(!value)}>
      <div className={styles.toggle2Knob} />
    </div>
  )
}

const WIDGET_NAMES = { clock: '時計', sysmonitor: 'システム監視', note: 'メモ' }
const WIDGET_ICONS = { clock: '🕐', sysmonitor: '📊', note: '📝' }
function getWidgetName(type) { return WIDGET_NAMES[type] ?? type }

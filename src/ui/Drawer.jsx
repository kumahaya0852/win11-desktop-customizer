import { useState, useEffect, useRef } from 'react'
import { getActiveMode, getModeList, applyMode } from '../core/modeManager'
import { useWidgets } from '../hooks/useWidgets'
import { useTheme } from '../hooks/useTheme'
import { getAll } from '../widgets/WidgetRegistry'
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
  const [showPicker,  setShowPicker]  = useState(false)
  const [activeMode,  setActiveMode]  = useState(null)
  const [accentColor, setAccentColor] = useState('#5b8cff')
  const { widgets, addWidget, removeWidget } = useWidgets()
  const { theme, apply: applyTheme } = useTheme()

  // クリックスルー制御
  useEffect(() => {
    window.api?.window?.setClickThrough?.(!open)
  }, [open])

  // オーバーレイ編集モード開始時にドロワーを閉じる
  useEffect(() => {
    if (!window.api) return
    const handler = (enabled) => { if (enabled) setOpen(false) }
    window.api.on('overlay:editMode', handler)
  }, [])

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
              <div className={styles.sectionBtns}>
                <button
                  className={styles.addBtn}
                  style={{ '--accent': accentColor }}
                  onClick={() => setShowPicker(v => !v)}
                >
                  ＋ 追加
                </button>
                <button
                  className={styles.editBtn}
                  style={{ '--accent': accentColor }}
                  onClick={() => window.api?.overlay?.setEditMode?.(true)}
                >
                  ✏ 配置を編集
                </button>
              </div>
            </div>
            {showPicker && (
              <DrawerWidgetPicker
                accentColor={accentColor}
                onSelect={(type) => {
                  const snap = v => Math.round(v / 12) * 12
                  addWidget(type, {
                    x: snap(60 + (widgets.length % 8) * 24),
                    y: snap(60 + (widgets.length % 8) * 24),
                  })
                  setShowPicker(false)
                }}
                onClose={() => setShowPicker(false)}
              />
            )}
            <div className={styles.widgetList}>
              {widgets.length === 0 && (
                <div className={styles.widgetEmpty}>
                  ウィジェットがありません<br/>
                  <span style={{ fontSize:10, opacity:0.6 }}>「追加」から配置できます</span>
                </div>
              )}
              {widgets.map(w => (
                <div key={w.id} className={styles.widgetRow}>
                  <span className={styles.widgetIcon}>{WIDGET_ICONS[w.type] ?? '⊞'}</span>
                  <span className={styles.widgetName}>{getWidgetName(w.type)}</span>
                  <button
                    className={styles.widgetDeleteBtn}
                    onClick={() => removeWidget(w.id)}
                    title="削除"
                  >✕</button>
                </div>
              ))}
            </div>
          </section>

          <div className={styles.footerBtns}>
            <button className={styles.wallpaperBtn}
              onClick={() => window.api?.wallpaperWindow?.open?.()}
              style={{ '--accent': accentColor }}>
              <span>🖼</span>
              <span>壁紙を変更</span>
            </button>
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

const WIDGET_NAMES = { clock: '時計', sysmonitor: 'システム監視', note: 'メモ', mediaplayer: 'メディアプレイヤー' }
const WIDGET_ICONS = { clock: '🕐', sysmonitor: '📊', note: '📝', mediaplayer: '🎵' }
function getWidgetName(type) { return WIDGET_NAMES[type] ?? type }

function DrawerWidgetPicker({ accentColor, onSelect, onClose }) {
  const defs = getAll()
  return (
    <div className={styles.picker} style={{ '--accent': accentColor }}>
      <div className={styles.pickerHeader}>
        <span className={styles.pickerTitle}>追加するウィジェット</span>
        <button className={styles.pickerClose} onClick={onClose}>✕</button>
      </div>
      {defs.map(def => (
        <button key={def.id} className={styles.pickerItem} onClick={() => onSelect(def.id)}>
          <span className={styles.pickerIcon}>{def.icon}</span>
          <div className={styles.pickerInfo}>
            <span className={styles.pickerName}>{def.name}</span>
            <span className={styles.pickerSize}>{def.defaultSize.w}×{def.defaultSize.h}</span>
          </div>
        </button>
      ))}
    </div>
  )
}

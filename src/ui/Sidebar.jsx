import { useState, useEffect, useRef } from 'react'
import { MODES, getModeList, getActiveMode, applyMode } from '../core/modeManager'
import bus from '../core/eventBus'
import styles from './Sidebar.module.css'

const NAV_TOP = [
  { id: 'theme',     icon: '◑', label: 'テーマ' },
  { id: 'wallpaper', icon: '🖼', label: '壁紙' },
  { id: 'widgets',   icon: '⊞', label: 'ウィジェット' },
  { id: 'windows',   icon: '⧉', label: 'ウィンドウ' },
  { id: 'plugins',   icon: '⬡', label: 'プラグイン' },
]

const NAV_BOTTOM = [
  { id: 'settings', icon: '⚙', label: '設定' },
]

export default function Sidebar({ active, onChange }) {
  return (
    <nav className={styles.nav}>
      <div className={styles.items}>
        {NAV_TOP.map(item => <NavItem key={item.id} item={item} active={active} onClick={onChange} />)}
      </div>
      <div className={styles.bottomItems}>
        {/* ★ モード切り替え */}
        <ModeButton />
        {NAV_BOTTOM.map(item => <NavItem key={item.id} item={item} active={active} onClick={onChange} />)}
        <div className={styles.version}>v0.1.0</div>
      </div>
    </nav>
  )
}

function NavItem({ item, active, onClick }) {
  return (
    <button
      className={`${styles.item} ${active === item.id ? styles.active : ''}`}
      onClick={() => onClick(item.id)}
      title={item.label}
    >
      <span className={styles.icon}>{item.icon}</span>
      <span className={styles.label}>{item.label}</span>
    </button>
  )
}

// ── モード切り替えボタン ──────────────────────────────
function ModeButton() {
  const [activeMode, setActiveMode] = useState(MODES.custom)
  const [showMenu,   setShowMenu]   = useState(false)
  const [applying,   setApplying]   = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    getActiveMode().then(m => setActiveMode(m))
    const handler = (m) => setActiveMode(m)
    bus.on('mode:changed', handler)
    return () => bus.off('mode:changed', handler)
  }, [])

  // 外クリックで閉じる
  useEffect(() => {
    if (!showMenu) return
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false)
    }
    const id = setTimeout(() => document.addEventListener('click', handler), 0)
    return () => { clearTimeout(id); document.removeEventListener('click', handler) }
  }, [showMenu])

  async function handleSelect(modeId) {
    if (applying) return
    setApplying(true)
    setShowMenu(false)
    try {
      const result = await applyMode(modeId)
      if (result.ok) setActiveMode(result.mode)
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className={styles.modeWrap} ref={menuRef}>
      <button
        className={`${styles.modeBtn} ${showMenu ? styles.modeBtnOpen : ''}`}
        onClick={() => setShowMenu(v => !v)}
        title={`モード: ${activeMode.label}`}
        disabled={applying}
      >
        <span className={styles.modeBtnIcon}>
          {applying ? '⏳' : activeMode.icon}
        </span>
        <span className={styles.modeBtnLabel}>{activeMode.label}</span>
      </button>

      {showMenu && (
        <div className={styles.modeMenu}>
          <div className={styles.modeMenuTitle}>モード</div>
          {getModeList().map(mode => (
            <button
              key={mode.id}
              className={`${styles.modeMenuItem} ${activeMode.id === mode.id ? styles.modeMenuItemActive : ''}`}
              onClick={() => handleSelect(mode.id)}
            >
              <span className={styles.modeMenuIcon}>{mode.icon}</span>
              <div className={styles.modeMenuInfo}>
                <span className={styles.modeMenuLabel}
                  style={{ color: activeMode.id === mode.id ? mode.color : undefined }}>
                  {mode.label}
                </span>
                <span className={styles.modeMenuDesc}>{mode.desc}</span>
              </div>
              {activeMode.id === mode.id && <span style={{ fontSize: 10, color: 'var(--accent)' }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

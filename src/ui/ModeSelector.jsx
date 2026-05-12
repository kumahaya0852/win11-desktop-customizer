/**
 * ui/ModeSelector.jsx
 * モード切り替えUI。TitleBar に常駐表示。
 */
import { useState, useEffect, useRef } from 'react'
import { MODES, getModeList, getActiveMode, applyMode } from '../core/modeManager'
import bus from '../core/eventBus'
import styles from './ModeSelector.module.css'

export default function ModeSelector() {
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
    <div className={styles.wrap} ref={menuRef}>
      <button
        className={`${styles.btn} ${showMenu ? styles.btnOpen : ''}`}
        onClick={() => setShowMenu(v => !v)}
        title={`現在のモード: ${activeMode.label}`}
        disabled={applying}
      >
        <span className={styles.icon}>{applying ? '⏳' : activeMode.icon}</span>
        <span className={styles.label}>{activeMode.label}</span>
        <span className={styles.arrow}>▾</span>
      </button>

      {showMenu && (
        <div className={styles.menu}>
          <div className={styles.menuTitle}>モード切り替え</div>
          {getModeList().map(mode => (
            <button
              key={mode.id}
              className={`${styles.menuItem} ${activeMode.id === mode.id ? styles.menuItemActive : ''}`}
              onClick={() => handleSelect(mode.id)}
            >
              <span className={styles.menuIcon}>{mode.icon}</span>
              <div className={styles.menuInfo}>
                <span className={styles.menuLabel}
                  style={{ color: activeMode.id === mode.id ? mode.color : undefined }}>
                  {mode.label}
                </span>
                <span className={styles.menuDesc}>{mode.desc}</span>
              </div>
              {activeMode.id === mode.id && <span className={styles.menuCheck}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

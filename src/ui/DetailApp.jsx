/**
 * DetailApp.jsx
 * 詳細設定ウィンドウ（フル設定パネル）
 */
import { useEffect, useState } from 'react'
import ThemeEditor from './ThemeEditor'
import WallpaperEditor from './WallpaperEditor'
import WidgetCanvas from '../widgets/WidgetCanvas'
import WindowRulesPanel from './WindowRulesPanel'
import PluginManager from './PluginManager'
import SettingsPanel from './SettingsPanel'
import configStore from '../core/configStore'
import themeEngine from '../core/themeEngine'
import bus from '../core/eventBus'
import styles from './DetailApp.module.css'

const NAV = [
  { id: 'theme',     icon: '◑', label: 'テーマ',       Panel: ThemeEditor },
  { id: 'wallpaper', icon: '🖼', label: '壁紙',         Panel: WallpaperEditor },
  { id: 'widgets',   icon: '⊞', label: 'ウィジェット', Panel: WidgetCanvas },
  { id: 'windows',   icon: '⧉', label: 'ウィンドウ',   Panel: WindowRulesPanel },
  { id: 'plugins',   icon: '⬡', label: 'プラグイン',   Panel: PluginManager },
  { id: 'settings',  icon: '⚙', label: '設定',         Panel: SettingsPanel },
]

export default function DetailApp() {
  const [activeId, setActiveId] = useState('theme')
  const [accentColor, setAccentColor] = useState('#5b8cff')

  useEffect(() => {
    configStore.get('ui.detail-tab').then(saved => {
      if (saved && NAV.find(n => n.id === saved)) setActiveId(saved)
    })
    configStore.get('theme.active').then(t => {
      if (t?.accentColor) setAccentColor(t.accentColor)
    })
    const handler = t => { if (t?.accentColor) setAccentColor(t.accentColor) }
    bus.on('theme:changed', handler)
    return () => bus.off('theme:changed', handler)
  }, [])

  function handleNav(id) {
    setActiveId(id)
    configStore.set('ui.detail-tab', id)
  }

  const activeNav = NAV.find(n => n.id === activeId)
  const Panel = activeNav?.Panel

  return (
    <div className={styles.shell}>
      {/* 背景グロー */}
      <div className={styles.bg}>
        <div className={styles.glow1} style={{ background: `radial-gradient(ellipse at 20% 50%, ${accentColor}22 0%, transparent 60%)` }} />
        <div className={styles.glow2} style={{ background: `radial-gradient(ellipse at 80% 20%, ${accentColor}12 0%, transparent 55%)` }} />
      </div>

      {/* タイトルバー */}
      <div className={`${styles.titlebar} drag-region`}>
        <span className={styles.titlebarLogo} style={{ color: accentColor }}>◈</span>
        <span className={styles.titlebarText}>詳細設定</span>
        <div className={`${styles.winBtns} no-drag`}>
          <button className={styles.winBtn} onClick={() => window.api?.detail?.minimize?.()}>─</button>
          <button className={styles.winBtn} onClick={() => window.api?.detail?.maximize?.()}>□</button>
          <button className={`${styles.winBtn} ${styles.winBtnClose}`}
            onClick={() => window.api?.detail?.close?.()}>✕</button>
        </div>
      </div>

      {/* ボディ */}
      <div className={styles.body}>
        {/* サイドナビ */}
        <nav className={styles.nav}>
          {NAV.map(item => (
            <button
              key={item.id}
              className={`${styles.navBtn} ${activeId === item.id ? styles.navBtnActive : ''}`}
              style={activeId === item.id ? { '--a': accentColor } : {}}
              onClick={() => handleNav(item.id)}
              title={item.label}
            >
              {activeId === item.id && (
                <span className={styles.navIndicator} style={{ background: accentColor }} />
              )}
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* メインパネル */}
        <main className={styles.main}>
          <div className={styles.panelHeader}>
            <h1 className={styles.panelTitle}>{activeNav?.label}</h1>
          </div>
          <div className={styles.panelContent}>
            {Panel && <Panel />}
          </div>
        </main>
      </div>
    </div>
  )
}

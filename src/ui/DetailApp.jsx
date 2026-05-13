/**
 * DetailApp.jsx
 * 詳細設定ウィンドウ — 近未来グラスモーフィズムUI
 */
import { Fragment, useEffect, useState } from 'react'
import ThemeEditor from './ThemeEditor'
import WindowRulesPanel from './WindowRulesPanel'
import PluginManager from './PluginManager'
import SettingsPanel from './SettingsPanel'
import configStore from '../core/configStore'
import bus from '../core/eventBus'
import styles from './DetailApp.module.css'

const NAV = [
  { id: 'theme',    icon: '◑', label: 'テーマ',     Panel: ThemeEditor },
  { id: 'windows',  icon: '⧉', label: 'ウィンドウ', Panel: WindowRulesPanel },
  { id: 'plugins',  icon: '⬡', label: 'プラグイン', Panel: PluginManager },
  { id: 'settings', icon: '⚙', label: '設定',       Panel: SettingsPanel },
]

export default function DetailApp() {
  const [activeId,    setActiveId]    = useState('theme')
  const [accentColor, setAccentColor] = useState('#5b8cff')

  useEffect(() => {
    configStore.get('ui.detail-tab').then(saved => {
      if (saved && saved !== 'widgets' && NAV.find(n => n.id === saved)) setActiveId(saved)
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
    <div className={styles.shell} style={{ '--accent': accentColor }}>

      {/* ── 背景 ── */}
      <div className={styles.bg}>
        <div className={styles.bgGrid} />
        <div className={styles.bgNoise} />
        <div className={styles.orb + ' ' + styles.orb1} />
        <div className={styles.orb + ' ' + styles.orb2} />
        <div className={styles.orb + ' ' + styles.orb3} />
        <div className={styles.scan} />
      </div>

      {/* ── タイトルバー ── */}
      <div className={styles.titlebar}>
        <div className={`${styles.titlebarDrag} drag-region`}>
          <span className={styles.titlebarLogo} style={{ color: accentColor }}>◈</span>
          <span className={styles.titlebarTitle}>Win11 Customizer</span>
          <span className={styles.titlebarSep} />
          <span className={styles.titlebarSub}>詳細設定</span>
        </div>
        <div className={`${styles.winBtns} no-drag`}>
          <button className={styles.winBtn}
            onClick={() => window.api?.detail?.minimize?.()}>─</button>
          <button className={styles.winBtn}
            onClick={() => window.api?.detail?.maximize?.()}>□</button>
          <button className={`${styles.winBtn} ${styles.winBtnClose}`}
            onClick={() => window.api?.detail?.close?.()}>✕</button>
        </div>
      </div>

      {/* ── ボディ ── */}
      <div className={styles.body}>

        {/* サイドナビ */}
        <nav className={styles.nav}>
          {NAV.map((item, i) => (
            <Fragment key={item.id}>
              {/* テーマとウィンドウの間に区切り */}
              {i === 1 && <div className={styles.navDivider} />}
              <button
                className={`${styles.navBtn} ${activeId === item.id ? styles.navBtnActive : ''}`}
                style={activeId === item.id ? { '--a': accentColor } : {}}
                onClick={() => handleNav(item.id)}
                title={item.label}
              >
                {activeId === item.id && (
                  <span className={styles.navIndicator}
                    style={{ background: accentColor, color: accentColor }} />
                )}
                <span className={styles.navIcon}>{item.icon}</span>
                <span className={styles.navLabel}>{item.label}</span>
              </button>
            </Fragment>
          ))}
        </nav>

        {/* メインパネル */}
        <main className={styles.main}>
          <div className={styles.panelHeader}>
            <div className={styles.panelTitleRow}>
              <h1 className={styles.panelTitle}>{activeNav?.label}</h1>
              <span className={styles.panelTitleAccent}
                style={{ background: accentColor }} />
            </div>
          </div>
          {/* key で activeId が変わるたびに panelIn アニメーションを再実行 */}
          <div key={activeId} className={styles.panelContent}>
            {Panel && <Panel />}
          </div>
        </main>

      </div>
    </div>
  )
}

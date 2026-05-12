import { useState } from 'react'
import { useTheme } from '../hooks/useTheme'
import styles from './Panel.module.css'

const PRESET_THEMES = [
  { id: 'default-dark', name: 'Default Dark',  accentColor: '#5b8cff', bgColor: '#0a0a0a', panelColor: '#111111' },
  { id: 'nordic',       name: 'Nordic',         accentColor: '#88c0d0', bgColor: '#0d1117', panelColor: '#161b22' },
  { id: 'rose-pine',    name: 'Rosé Pine',      accentColor: '#eb6f92', bgColor: '#191724', panelColor: '#1f1d2e' },
  { id: 'gruvbox',      name: 'Gruvbox Dark',   accentColor: '#d79921', bgColor: '#1d2021', panelColor: '#282828' },
  { id: 'catppuccin',   name: 'Catppuccin',     accentColor: '#cba6f7', bgColor: '#1e1e2e', panelColor: '#181825' },
]

export default function ThemeEditor() {
  const { theme, apply, applying } = useTheme()
  const [draft, setDraft] = useState(null)        // 未適用のカスタム編集
  const [applyToSystem, setApplyToSystem] = useState(false)
  const [status, setStatus] = useState(null)

  const current = draft ?? theme ?? PRESET_THEMES[0]

  async function handleApply(t) {
    const merged = { ...t, applyToSystem }
    setDraft(null)
    await apply(merged)
    setStatus({ type: 'ok', msg: `"${merged.name ?? 'カスタム'}" を適用しました` })
    setTimeout(() => setStatus(null), 2500)
  }

  function handleDraftChange(key, value) {
    setDraft(prev => ({ ...(prev ?? current), id: 'custom', name: 'カスタム', [key]: value }))
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h1 className={styles.title}>テーマ</h1>
        <p className={styles.sub}>外観カラーを変更します。設定は自動的に保存されます。</p>
      </div>

      {/* プリセット */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>プリセット</h2>
        <div className={styles.presets}>
          {PRESET_THEMES.map(t => (
            <button
              key={t.id}
              className={`${styles.presetCard} ${current?.id === t.id && !draft ? styles.presetActive : ''}`}
              onClick={() => { setDraft(null); handleApply(t) }}
            >
              <span className={styles.presetDot} style={{ background: t.accentColor }} />
              <span className={styles.presetName}>{t.name}</span>
            </button>
          ))}
        </div>
      </section>

      {/* カスタム */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>カスタム</h2>
        <div className={styles.fields}>
          <ColorField label="アクセントカラー" value={current?.accentColor ?? '#5b8cff'}
            onChange={v => handleDraftChange('accentColor', v)} />
          <ColorField label="背景色"           value={current?.bgColor ?? '#0a0a0a'}
            onChange={v => handleDraftChange('bgColor', v)} />
          <ColorField label="パネル色"         value={current?.panelColor ?? '#111111'}
            onChange={v => handleDraftChange('panelColor', v)} />
        </div>
      </section>

      {/* Windows 連携 */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Windows 統合</h2>
        <label className={styles.toggle}>
          <input type="checkbox" checked={applyToSystem}
            onChange={e => setApplyToSystem(e.target.checked)} />
          <span>アクセントカラーを Windows 側にも適用する</span>
        </label>
        <p className={styles.note}>
          ※ Electron 上で動作している場合のみ有効です。Windows のレジストリを書き換えます。
        </p>
      </section>

      <div className={styles.footer}>
        {status && <span className={`${styles.status} ${styles[status.type]}`}>{status.msg}</span>}
        {draft && (
          <button className={styles.resetBtn} onClick={() => setDraft(null)}>リセット</button>
        )}
        <button className={styles.applyBtn} onClick={() => handleApply(current)} disabled={applying}>
          {applying ? '適用中...' : '適用'}
        </button>
      </div>
    </div>
  )
}

function ColorField({ label, value, onChange }) {
  return (
    <div className={styles.colorField}>
      <label className={styles.fieldLabel}>{label}</label>
      <div className={styles.colorRow}>
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          className={styles.colorPicker} />
        <input type="text"  value={value} onChange={e => onChange(e.target.value)}
          className={`${styles.colorText} mono`} maxLength={7} spellCheck={false} />
      </div>
    </div>
  )
}

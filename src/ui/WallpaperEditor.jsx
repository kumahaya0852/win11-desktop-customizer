import { useState, useEffect } from 'react'
import styles from './Panel.module.css'
import wStyles from './WallpaperEditor.module.css'

const STYLES = [
  { value: 'fill',    label: '拡大して全体を埋める' },
  { value: 'fit',     label: '全体が見えるように縮小' },
  { value: 'stretch', label: '引き伸ばす' },
  { value: 'tile',    label: 'タイル状に並べる' },
  { value: 'center',  label: '中央に表示' },
]

export default function WallpaperEditor() {
  const [current, setCurrent] = useState(null)
  const [wallStyle, setWallStyle] = useState('fill')
  const [filePath, setFilePath] = useState('')
  const [status, setStatus] = useState(null)
  const isElectron = typeof window.api !== 'undefined'

  useEffect(() => {
    if (isElectron) {
      window.api.wallpaper.get().then(r => { if (r?.path) setCurrent(r.path) })
    }
  }, [])

  function flash(type, msg) {
    setStatus({ type, msg })
    setTimeout(() => setStatus(null), 3000)
  }

  async function handleApply() {
    if (!filePath.trim()) { flash('err', 'ファイルパスを入力してください'); return }
    if (!isElectron) { flash('err', 'Electron上でのみ有効です'); return }
    try {
      const res = await window.api.wallpaper.set(filePath.trim(), wallStyle)
      if (res.ok) {
        setCurrent(filePath.trim())
        flash('ok', '壁紙を設定しました')
      } else {
        flash('err', `失敗: ${res.error}`)
      }
    } catch (e) {
      flash('err', `エラー: ${e.message}`)
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h1 className={styles.title}>壁紙</h1>
        <p className={styles.sub}>デスクトップの壁紙を変更します。</p>
      </div>

      {/* 現在の壁紙 */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>現在の壁紙</h2>
        <div className={wStyles.currentBox}>
          {current
            ? <span className={`${wStyles.currentPath} mono`}>{current}</span>
            : <span className={wStyles.currentNone}>取得できませんでした（Electron上で有効）</span>
          }
        </div>
      </section>

      {/* ファイルパス入力 */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>壁紙を変更</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className={styles.fieldLabel}>画像ファイルパス（絶対パス）</label>
            <input
              type="text"
              value={filePath}
              onChange={e => setFilePath(e.target.value)}
              placeholder="C:\Users\...\image.jpg"
              className={wStyles.pathInput}
              spellCheck={false}
            />
            <p className={styles.note} style={{ marginTop: 8 }}>
              対応形式: JPG / PNG / BMP / WEBP。絶対パスで入力してください。
            </p>
          </div>

          {/* スタイル */}
          <div>
            <label className={styles.fieldLabel}>表示スタイル</label>
            <div className={wStyles.styleGrid}>
              {STYLES.map(s => (
                <button
                  key={s.value}
                  className={`${wStyles.styleBtn} ${wallStyle === s.value ? wStyles.styleBtnActive : ''}`}
                  onClick={() => setWallStyle(s.value)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className={styles.footer}>
        {status && <span className={`${styles.status} ${styles[status.type]}`}>{status.msg}</span>}
        <button className={styles.applyBtn} onClick={handleApply}>適用</button>
      </div>
    </div>
  )
}

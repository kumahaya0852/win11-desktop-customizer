/**
 * WallpaperEditor.jsx
 * カバーフロー型壁紙セレクター
 * ダイアログでフォルダ選択 → IPC で画像一覧取得 → file:// URL でプレビュー
 * （blob URL の Electron 互換性問題を回避）
 */
import { useState, useEffect } from 'react'
import styles from './WallpaperEditor.module.css'

const WALL_STYLES = [
  { value: 'fill',    label: '全画面フィル' },
  { value: 'fit',     label: 'フィット' },
  { value: 'stretch', label: '引き伸ばし' },
  { value: 'tile',    label: 'タイル' },
  { value: 'center',  label: '中央' },
]

export default function WallpaperEditor() {
  const [images,      setImages]      = useState([])   // { name, path, url }[]
  const [selected,    setSelected]    = useState(0)
  const [wallStyle,   setWallStyle]   = useState('fill')
  const [status,      setStatus]      = useState(null)
  const [currentWall, setCurrentWall] = useState(null)
  const [isApplying,  setIsApplying]  = useState(false)
  const isElectron = typeof window !== 'undefined' && !!window.api

  useEffect(() => {
    if (!isElectron) return
    // 現在の壁紙パスを取得
    window.api.wallpaper.get().then(r => { if (r?.path) setCurrentWall(r.path) }).catch(() => {})
    // ドロワーで選択されたフォルダがあれば自動ロード
    window.api.store.get('ui.wallpaper-folder').then(async dir => {
      if (!dir) return
      const { ok, files } = await window.api.wallpaperDir.list(dir)
      if (!ok || files.length === 0) return
      setImages(files.map(p => ({
        name: p.split(/[\\/]/).pop(),
        path: p,
        url:  'file:///' + p.replace(/\\/g, '/'),
      })))
      setSelected(0)
      // 使ったら消去（次回は空の状態で開く）
      window.api.store.delete('ui.wallpaper-folder').catch(() => {})
    }).catch(() => {})
  }, [])

  // キーボードナビ
  useEffect(() => {
    const onKey = (e) => {
      if (images.length === 0) return
      if (e.key === 'ArrowLeft')  setSelected(s => Math.max(0, s - 1))
      if (e.key === 'ArrowRight') setSelected(s => Math.min(images.length - 1, s + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [images])

  // ダイアログでフォルダを選択 → IPC で画像リスト取得 → file:// URLを生成
  async function handlePickFolder() {
    if (!isElectron) { flash('err', 'Electron上でのみ動作します'); return }
    const result = await window.api.dialog.openDir()
    if (result.canceled || !result.filePaths?.[0]) return
    const dirPath = result.filePaths[0]

    const { ok, files, error } = await window.api.wallpaperDir.list(dirPath)
    if (!ok) { flash('err', `フォルダ読み込みエラー: ${error}`); return }
    if (files.length === 0) { flash('err', '画像ファイルが見つかりませんでした'); return }

    // file:// URL で直接表示（Electron では必ずこちらが動作する）
    const imgs = files.map(p => ({
      name: p.split(/[\\/]/).pop(),
      path: p,
      url:  'file:///' + p.replace(/\\/g, '/'),
    }))
    setImages(imgs)
    setSelected(0)
    flash('ok', `${imgs.length} 枚の画像を読み込みました`)
  }

  function flash(type, msg) {
    setStatus({ type, msg })
    setTimeout(() => setStatus(null), 3500)
  }

  async function handleApply() {
    const target = images[selected]
    if (!target) { flash('err', '壁紙を選択してください'); return }
    if (!isElectron) { flash('err', 'Electron上でのみ動作します'); return }
    setIsApplying(true)
    try {
      const res = await window.api.wallpaper.set(target.path, wallStyle)
      if (res?.ok) {
        setCurrentWall(target.path)
        flash('ok', `「${target.name}」を設定しました`)
      } else {
        flash('err', `失敗: ${res?.error ?? '不明なエラー'}`)
      }
    } catch (e) {
      flash('err', `エラー: ${e.message}`)
    } finally {
      setIsApplying(false)
    }
  }

  // カードの 3D transform を計算
  function cardStyle(i) {
    const off = i - selected
    const abs = Math.abs(off)
    if (abs > 3) return null
    const sign      = Math.sign(off)
    const scale     = off === 0 ? 1 : Math.max(0.44, 1 - abs * 0.18)
    const rotateY   = sign * abs * 16
    const translateX = sign * abs * 195
    const translateZ = off === 0 ? 60 : -(abs * 55)
    const opacity   = off === 0 ? 1 : Math.max(0.3, 1 - abs * 0.24)
    const zIndex    = 20 - abs
    return {
      transform: `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
      opacity, zIndex,
    }
  }

  const currentName = currentWall ? currentWall.split(/[\\/]/).pop() : null

  return (
    <div className={styles.root}>

      {/* フォルダ選択バー */}
      <div className={styles.topBar}>
        <button className={styles.folderBtn} onClick={handlePickFolder}>
          <span>📁</span>
          <span>フォルダを選択</span>
        </button>
        {images.length > 0 && (
          <span className={styles.imageCount}>{images.length} 枚</span>
        )}
        {currentName && (
          <span className={styles.currentTag} title={currentWall}>
            <span className={styles.currentDot} />
            現在: {currentName}
          </span>
        )}
      </div>

      {/* カルーセルステージ */}
      <div className={styles.stage}>
        {images.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🖼</div>
            <p className={styles.emptyText}>フォルダを選択すると<br />壁紙が表示されます</p>
            <button className={styles.emptyBtn} onClick={handlePickFolder}>
              フォルダを選ぶ
            </button>
          </div>
        ) : (
          <>
            <div className={styles.carousel}>
              {images.map((img, i) => {
                const cs = cardStyle(i)
                if (!cs) return null
                const isCenter = i === selected
                return (
                  <div
                    key={img.path}
                    className={`${styles.card} ${isCenter ? styles.cardActive : ''}`}
                    style={cs}
                    onClick={() => isCenter ? handleApply() : setSelected(i)}
                  >
                    <img
                      src={img.url}
                      alt={img.name}
                      className={styles.cardImg}
                      draggable={false}
                    />
                    {isCenter && (
                      <div className={styles.cardOverlay}>
                        <span className={styles.cardName}>{img.name}</span>
                        <span className={styles.cardHint}>クリックで適用</span>
                      </div>
                    )}
                    {!isCenter && <div className={styles.cardSelectHint}>選択</div>}
                  </div>
                )
              })}
            </div>
            <button className={`${styles.arrow} ${styles.arrowL}`}
              onClick={() => setSelected(s => Math.max(0, s - 1))}
              disabled={selected === 0}>‹</button>
            <button className={`${styles.arrow} ${styles.arrowR}`}
              onClick={() => setSelected(s => Math.min(images.length - 1, s + 1))}
              disabled={selected === images.length - 1}>›</button>
          </>
        )}
      </div>

      {/* ドットインジケーター */}
      {images.length > 0 && (
        <div className={styles.dots}>
          {images.map((_, i) => {
            if (Math.abs(i - selected) > 5) return null
            return (
              <span key={i}
                className={`${styles.dot} ${i === selected ? styles.dotActive : ''}`}
                onClick={() => setSelected(i)} />
            )
          })}
        </div>
      )}

      {/* フッター */}
      <div className={styles.footer}>
        <div className={styles.styleRow}>
          {WALL_STYLES.map(s => (
            <button key={s.value}
              className={`${styles.styleChip} ${wallStyle === s.value ? styles.styleChipActive : ''}`}
              onClick={() => setWallStyle(s.value)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className={styles.footerRight}>
          {status && (
            <span className={`${styles.statusMsg} ${status.type === 'ok' ? styles.statusOk : styles.statusErr}`}>
              {status.msg}
            </span>
          )}
          <button
            className={`${styles.applyBtn} ${isApplying ? styles.applyBtnLoading : ''}`}
            onClick={handleApply}
            disabled={images.length === 0 || isApplying}>
            {isApplying ? '適用中...' : '壁紙を適用'}
          </button>
        </div>
      </div>

    </div>
  )
}

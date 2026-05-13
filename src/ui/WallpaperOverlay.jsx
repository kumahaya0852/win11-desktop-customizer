/**
 * WallpaperOverlay.jsx
 * 全画面透明ウィンドウ上に浮かぶ壁紙セレクター
 * - 複数フォルダをまとめて参照（永続保存）
 * - 画像 + 動画ファイルに対応
 * - スタイルチップをバックグラウンドプレビューにリアルタイム反映
 */
import { useState, useEffect, useRef } from 'react'
import styles from './WallpaperOverlay.module.css'

const WALL_STYLES = [
  { value: 'fill',    label: '全画面フィル' },
  { value: 'fit',     label: 'フィット' },
  { value: 'stretch', label: '引き伸ばし' },
  { value: 'tile',    label: 'タイル' },
  { value: 'center',  label: '中央' },
]

const BG_CSS = {
  fill:    { backgroundSize: 'cover',      backgroundRepeat: 'no-repeat', backgroundPosition: 'center' },
  fit:     { backgroundSize: 'contain',    backgroundRepeat: 'no-repeat', backgroundPosition: 'center' },
  stretch: { backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' },
  tile:    { backgroundSize: 'auto',       backgroundRepeat: 'repeat',    backgroundPosition: 'top left' },
  center:  { backgroundSize: 'auto',       backgroundRepeat: 'no-repeat', backgroundPosition: 'center' },
}

const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv', '.wmv'])

function fileEntry(p) {
  const ext = ('.' + p.split('.').pop()).toLowerCase()
  const isVideo = VIDEO_EXTS.has(ext)
  const url = encodeURI('localfile:///' + p.replace(/\\/g, '/'))
  return { name: p.split(/[\\/]/).pop(), path: p, url, isVideo }
}

export default function WallpaperOverlay() {
  const [folders,     setFolders]     = useState([])
  const [images,      setImages]      = useState([])
  const [selected,    setSelected]    = useState(0)
  const [wallStyle,   setWallStyle]   = useState('fill')
  const [status,      setStatus]      = useState(null)
  const [currentWall, setCurrentWall] = useState(null)
  const [isApplying,  setIsApplying]  = useState(false)
  const [accentColor, setAccentColor] = useState('#5b8cff')
  const wheelRef = useRef(0)
  const isElectron = typeof window !== 'undefined' && !!window.api

  useEffect(() => {
    if (!isElectron) return
    window.api.store.get('theme.active').then(t => {
      if (t?.accentColor) setAccentColor(t.accentColor)
    }).catch(() => {})
    window.api.wallpaper.get().then(r => { if (r?.path) setCurrentWall(r.path) }).catch(() => {})

    // 保存済みフォルダを復元、ドロワーから渡された単一フォルダがあれば追加
    ;(async () => {
      const saved  = await window.api.store.get('ui.wallpaper-folders').catch(() => null)
      const single = await window.api.store.get('ui.wallpaper-folder').catch(() => null)
      let folderList = Array.isArray(saved) ? [...saved] : []
      if (single && !folderList.includes(single)) {
        folderList.push(single)
        await window.api.store.delete('ui.wallpaper-folder').catch(() => {})
      }
      if (folderList.length > 0) {
        setFolders(folderList)
        const imgs = await fetchAllImages(folderList)
        setImages(imgs)
        setSelected(0)
        await window.api.store.set('ui.wallpaper-folders', folderList).catch(() => {})
      }
    })()
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') handleClose()
      if (images.length === 0) return
      if (e.key === 'ArrowLeft')  setSelected(s => Math.max(0, s - 1))
      if (e.key === 'ArrowRight') setSelected(s => Math.min(images.length - 1, s + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [images])

  async function fetchAllImages(folderList) {
    const all = []
    for (const dir of folderList) {
      const { ok, files } = await window.api.wallpaperDir.list(dir).catch(() => ({ ok: false, files: [] }))
      if (ok) all.push(...files)
    }
    return all.map(fileEntry)
  }

  async function handleAddFolder() {
    if (!isElectron) return
    const result = await window.api.dialog.openDir()
    if (result.canceled || !result.filePaths?.[0]) return
    const dir = result.filePaths[0]
    if (folders.includes(dir)) { flash('err', 'このフォルダは既に追加されています'); return }
    const newFolders = [...folders, dir]
    setFolders(newFolders)
    const imgs = await fetchAllImages(newFolders)
    setImages(imgs)
    setSelected(0)
    await window.api.store.set('ui.wallpaper-folders', newFolders).catch(() => {})
    flash('ok', `フォルダを追加しました（${imgs.length} 件）`)
  }

  async function handleRemoveFolder(dir) {
    const newFolders = folders.filter(f => f !== dir)
    setFolders(newFolders)
    const imgs = await fetchAllImages(newFolders)
    setImages(imgs)
    setSelected(s => Math.min(s, Math.max(0, imgs.length - 1)))
    await window.api.store.set('ui.wallpaper-folders', newFolders).catch(() => {})
  }

  function handleClose() {
    window.api?.wallpaperWindow?.close?.()
  }

  function handleWheel(e) {
    if (images.length === 0) return
    const now = Date.now()
    if (now - wheelRef.current < 180) return
    wheelRef.current = now
    if (e.deltaY > 0 || e.deltaX > 0) {
      setSelected(s => Math.min(images.length - 1, s + 1))
    } else {
      setSelected(s => Math.max(0, s - 1))
    }
  }

  function flash(type, msg) {
    setStatus({ type, msg })
    setTimeout(() => setStatus(null), 3200)
  }

  async function handleApply() {
    const target = images[selected]
    if (!target || !isElectron) return
    setIsApplying(true)
    try {
      if (target.isVideo) {
        const res = await window.api.videoWallpaper.set(target.path)
        if (res?.ok) {
          setCurrentWall(target.path)
          flash('ok', `「${target.name}」を動画壁紙に設定しました`)
        } else {
          flash('err', `失敗: ${res?.error ?? '不明なエラー'}`)
        }
      } else {
        const res = await window.api.wallpaper.set(target.path, wallStyle)
        if (res?.ok) {
          setCurrentWall(target.path)
          flash('ok', `「${target.name}」を設定しました`)
        } else {
          flash('err', `失敗: ${res?.error ?? '不明なエラー'}`)
        }
      }
    } catch (e) {
      flash('err', `エラー: ${e.message}`)
    } finally {
      setIsApplying(false)
    }
  }

  function cardStyle(i) {
    const off = i - selected
    const abs = Math.abs(off)
    if (abs > 3) return null
    const sign       = Math.sign(off)
    const scale      = off === 0 ? 1 : Math.max(0.44, 1 - abs * 0.18)
    const rotateY    = sign * abs * 16
    const translateX = sign * abs * 200
    const translateZ = off === 0 ? 60 : -(abs * 55)
    const opacity    = off === 0 ? 1 : Math.max(0.3, 1 - abs * 0.24)
    const zIndex     = 20 - abs
    return {
      transform: `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
      opacity, zIndex,
    }
  }

  const currentName = currentWall ? currentWall.split(/[\\/]/).pop() : null
  const currentItem = images[selected]

  return (
    <div className={styles.root} style={{ '--accent': accentColor }} onWheel={handleWheel}>

      {/* バックグラウンドプレビュー */}
      {currentItem && (
        currentItem.isVideo ? (
          <video
            key={currentItem.url}
            src={currentItem.url}
            className={styles.bgPreviewVideo}
            autoPlay muted loop playsInline
          />
        ) : (
          <div
            key={currentItem.url}
            className={styles.bgPreview}
            style={{ backgroundImage: `url("${currentItem.url}")`, ...BG_CSS[wallStyle] }}
          />
        )
      )}

      {/* バックドロップ（クリックで閉じる） */}
      <div className={styles.backdrop} onClick={handleClose} />

      {/* ── トップピル ── */}
      <div className={styles.topPill}>
        <span className={styles.topPillIcon}>🖼</span>
        <span className={styles.topPillTitle}>壁紙を選択</span>
        {images.length > 0 && (
          <span className={styles.topPillCount}>{images.length} 件</span>
        )}
        {currentName && (
          <span className={styles.topPillCurrent}>
            <span className={styles.topPillDot} />
            {currentName}
          </span>
        )}
        <button className={styles.topPillClose} onClick={handleClose} title="閉じる (Esc)">✕</button>
      </div>

      {/* ── フォルダバー ── */}
      <div className={styles.folderBar} onClick={e => e.stopPropagation()}>
        {folders.map(dir => (
          <div key={dir} className={styles.folderChip}>
            <span className={styles.folderChipIcon}>📁</span>
            <span className={styles.folderChipName}>{dir.split(/[\\/]/).pop()}</span>
            <button
              className={styles.folderChipRemove}
              onClick={() => handleRemoveFolder(dir)}
              title="フォルダを削除"
            >×</button>
          </div>
        ))}
        <button className={styles.addFolderBtn} onClick={handleAddFolder}>
          ＋ フォルダを追加
        </button>
      </div>

      {/* ── カルーセルステージ ── */}
      <div className={styles.stage} onClick={e => e.stopPropagation()}>
        {images.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🖼</div>
            <p className={styles.emptyText}>フォルダを追加すると<br />壁紙・動画が表示されます</p>
            <button className={styles.emptyBtn} onClick={handleAddFolder}>📁 フォルダを追加</button>
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
                    {img.isVideo ? (
                      <>
                        <video
                          src={img.url}
                          className={styles.cardVideo}
                          autoPlay={isCenter}
                          muted loop playsInline
                          preload="metadata"
                        />
                        <div className={styles.videoBadge}>🎬</div>
                      </>
                    ) : (
                      <>
                        <img src={img.url} aria-hidden className={styles.cardBgBlur} draggable={false} />
                        <img src={img.url} alt={img.name} className={styles.cardImg} draggable={false} />
                      </>
                    )}
                    {isCenter && (
                      <div className={styles.cardOverlay}>
                        <span className={styles.cardName}>{img.name}</span>
                        <span className={styles.cardHint}>
                          {img.isVideo ? '🎬 クリックで動画壁紙に設定' : 'クリックで適用'}
                        </span>
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

      {/* ── ドットインジケーター ── */}
      {images.length > 0 && (
        <div className={styles.dots} onClick={e => e.stopPropagation()}>
          {images.map((img, i) => {
            if (Math.abs(i - selected) > 5) return null
            return (
              <span key={i}
                className={`${styles.dot} ${i === selected ? styles.dotActive : ''} ${img.isVideo ? styles.dotVideo : ''}`}
                onClick={() => setSelected(i)} />
            )
          })}
        </div>
      )}

      {/* ── ボトムピル ── */}
      <div className={styles.bottomPill} onClick={e => e.stopPropagation()}>
        {/* 動画選択中はスタイルチップ非表示 */}
        {!currentItem?.isVideo && (
          <>
            <div className={styles.styleRow}>
              {WALL_STYLES.map(s => (
                <button key={s.value}
                  className={`${styles.styleChip} ${wallStyle === s.value ? styles.styleChipActive : ''}`}
                  onClick={() => setWallStyle(s.value)}>
                  {s.label}
                </button>
              ))}
            </div>
            <div className={styles.pipeSep} />
          </>
        )}
        {status && (
          <>
            <span className={`${styles.statusMsg} ${status.type === 'ok' ? styles.statusOk : styles.statusErr}`}>
              {status.msg}
            </span>
            <div className={styles.pipeSep} />
          </>
        )}
        <button
          className={`${styles.applyBtn} ${isApplying ? styles.applyBtnLoading : ''} ${currentItem?.isVideo ? styles.applyBtnVideo : ''}`}
          onClick={handleApply}
          disabled={images.length === 0 || isApplying}>
          {isApplying ? '設定中...' : currentItem?.isVideo ? '🎬 動画壁紙を設定' : '壁紙を適用'}
        </button>
      </div>

    </div>
  )
}

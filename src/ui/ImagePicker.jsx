/**
 * ImagePicker.jsx
 * ドロワー内の「デスクトップ画像」セクション
 * - ファイル参照ボタン → ダイアログで画像を1枚選択
 * - 選択後にサムネイルプレビューを表示（まだ表示しない）
 * - 「デスクトップに表示」ボタンを押したときだけ画像ウィンドウを出す
 */
import { useState } from 'react'
import styles from './ImagePicker.module.css'

export default function ImagePicker({ accentColor = '#5b8cff' }) {
  const [pickedFile, setPickedFile] = useState(null)  // { name, path, url }
  const [isShowing,  setIsShowing]  = useState(false)
  const [status,     setStatus]     = useState(null)
  const isElectron = typeof window !== 'undefined' && !!window.api

  function flash(type, msg) {
    setStatus({ type, msg })
    setTimeout(() => setStatus(null), 3000)
  }

  // ファイル選択ダイアログ（選択しただけでは表示しない）
  async function handlePick() {
    if (!isElectron) { flash('err', 'Electron上でのみ動作します'); return }
    const result = await window.api.dialog.openFile({
      title: 'デスクトップに表示する画像を選択',
      filters: [{ name: '画像', extensions: ['jpg','jpeg','png','bmp','webp','gif'] }],
    })
    if (result.canceled || !result.filePaths?.[0]) return
    const p = result.filePaths[0]
    setPickedFile({
      name: p.split(/[\\/]/).pop(),
      path: p,
      url:  'file:///' + p.replace(/\\/g, '/'),
    })
    // 選択しても自動では表示しない（負荷回避）
    setIsShowing(false)
  }

  // デスクトップに表示（明示的に押したときだけ）
  async function handleShow() {
    if (!pickedFile) return
    if (!isElectron) return
    if (isShowing) {
      // 既に表示中 → 隠す
      await window.api.image.hide()
      setIsShowing(false)
    } else {
      await window.api.image.show({ filePath: pickedFile.path })
      setIsShowing(true)
    }
  }

  // 閉じてリセット
  async function handleClose() {
    if (isElectron) await window.api.image.close()
    setPickedFile(null)
    setIsShowing(false)
  }

  return (
    <div className={styles.root}>
      {/* ファイル参照ボタン */}
      <button
        className={styles.pickBtn}
        style={{ '--accent': accentColor }}
        onClick={handlePick}
      >
        <span className={styles.pickIcon}>🗂</span>
        <span>{pickedFile ? 'ファイルを変更' : 'ファイルを参照'}</span>
      </button>

      {/* 選択後プレビュー */}
      {pickedFile && (
        <div className={styles.preview}>
          <div className={styles.previewImgWrap}>
            <img
              src={pickedFile.url}
              alt={pickedFile.name}
              className={styles.previewImg}
            />
            <button className={styles.clearBtn} onClick={handleClose} title="削除">✕</button>
          </div>
          <div className={styles.previewInfo}>
            <span className={styles.previewName} title={pickedFile.name}>
              {pickedFile.name}
            </span>
            <button
              className={`${styles.showBtn} ${isShowing ? styles.showBtnActive : ''}`}
              style={{ '--accent': accentColor }}
              onClick={handleShow}
            >
              {isShowing ? '▐ 非表示' : '▶ デスクトップに表示'}
            </button>
          </div>
        </div>
      )}

      {status && (
        <span className={`${styles.status} ${status.type === 'ok' ? styles.statusOk : styles.statusErr}`}>
          {status.msg}
        </span>
      )}
    </div>
  )
}

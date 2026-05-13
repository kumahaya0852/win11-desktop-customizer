/**
 * OverlayApp.jsx — 編集バー / クリックスルーオーバーレイ
 *
 * 2つのモードで動作:
 *   ?bar=1  → 編集バー専用ウィンドウとして常時バーを表示
 *             setIgnoreMouseEvents(false) な小ウィンドウなのでクリックスルー不要
 *   通常    → 常にクリックスルー ON の透明ウィンドウ（何も表示しない）
 */
import { useEffect, useCallback } from 'react'
import { applyCSSVars } from './core/themeEngine'
import configStore from './core/configStore'

// URL パラメータで動作モードを切り替え
const isBarMode = new URLSearchParams(window.location.search).has('bar')

export default function OverlayApp() {
  useEffect(() => {
    configStore.get('theme.active').then(t => { if (t) applyCSSVars(t) })
    if (!window.api) return
    window.api.on('theme:changed', applyCSSVars)
    // 通常オーバーレイは常にクリックスルーON を確認
    if (!isBarMode) {
      window.api?.overlay?.setClickThrough?.(true)
    }
  }, [])

  const exitEditMode = useCallback(() => {
    window.api?.overlay?.setEditMode?.(false)
  }, [])

  // Escape キーで編集モードを終了（バーモードのみ）
  useEffect(() => {
    if (!isBarMode) return
    const onKey = (e) => { if (e.key === 'Escape') exitEditMode() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [exitEditMode])

  // バーモード: 常に編集バーを表示（ウィンドウ自体が setIgnoreMouseEvents(false)）
  // background: rgba(0,0,0,0.01) で全ピクセルのアルファを非ゼロにし
  // WS_EX_LAYERED の透過クリック貫通を防ぐ
  if (isBarMode) {
    return (
      <div style={{ width: '100%', height: '100%', position: 'relative', background: 'rgba(0,0,0,0.01)' }}>
        <EditBar />
      </div>
    )
  }

  // 通常オーバーレイ: 何も表示しない（完全透明・クリックスルー）
  return null
}

// ── 編集バー ──────────────────────────────────────────────
function EditBar() {
  return (
    <div
      data-editbar
      style={{
        position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 14,
        background: 'rgba(12,12,22,0.92)',
        border: '1px solid rgba(91,140,255,0.4)',
        borderRadius: 99, padding: '7px 18px',
        zIndex: 9999,
        boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
        backdropFilter: 'blur(18px)',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ color: 'rgba(91,140,255,0.95)', fontWeight: 600, fontSize: 12 }}>
        ✏ 編集モード
      </span>
      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>
        ドラッグで移動 · 右下でリサイズ · <kbd style={{ color: 'rgba(91,140,255,0.7)', fontFamily: 'inherit' }}>Esc</kbd> で終了
      </span>
    </div>
  )
}

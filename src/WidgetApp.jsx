/**
 * WidgetApp.jsx — 単一ウィジェットウィンドウレンダラー
 *
 * 各ウィジェットは独立した BrowserWindow で表示される。
 * - 通常モード: mouseenter/leave でウィンドウ単位のクリックスルーを制御
 *   → 詰まっても影響はそのウィジェット面積のみ
 * - 編集モード: -webkit-app-region: drag でネイティブウィンドウドラッグ
 */
import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { getAll, get as getWidgetDef } from './widgets/WidgetRegistry'
import { applyCSSVars } from './core/themeEngine'
import configStore from './core/configStore'

const componentCache = new Map()
function getComponent(type) {
  if (componentCache.has(type)) return componentCache.get(type)
  const def = getAll().find(d => d.id === type)
  if (!def) { const F = () => null; componentCache.set(type, F); return F }
  const C = lazy(def.component)
  componentCache.set(type, C)
  return C
}

export default function WidgetApp() {
  const [widget,   setWidget]   = useState(null)
  const [editMode, setEditMode] = useState(false)
  const widgetRef  = useRef(null)
  const editRef    = useRef(false)

  useEffect(() => {
    configStore.get('theme.active').then(t => { if (t) applyCSSVars(t) })
    if (!window.api) return
    window.api.on('widget:config',   (cfg)     => { setWidget(cfg); widgetRef.current = cfg })
    window.api.on('widget:editMode', (enabled) => {
      editRef.current = !!enabled
      setEditMode(!!enabled)
    })
    window.api.on('theme:changed', applyCSSVars)
    // 準備完了をメインプロセスに通知（config を受け取るため）
    const id = new URLSearchParams(window.location.search).get('id')
    window.api.widget?.ready?.(id)
  }, [])

  // 通常モード: ウィンドウ全体の hover でクリックスルーを切り替え
  // 小さいウィンドウ単位なので詰まっても影響がそのウィジェット面積だけ
  useEffect(() => {
    if (editMode) return
    let isOver = false
    // mousemove は { forward: true } で確実に転送される → 初回で enter 検出
    const onMove = () => {
      if (!isOver) {
        isOver = true
        window.api?.widget?.setClickThrough?.(false)
      }
    }
    // mouseleave はウィンドウ境界を出た時に発火
    const onLeave = () => {
      isOver = false
      window.api?.widget?.setClickThrough?.(true)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseleave', onLeave)
    window.api?.widget?.setClickThrough?.(true) // 初期: クリックスルーON
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeave)
      // 編集モードへ移行する場合はクリックスルーを復元しない
      // （main プロセスの applyEditModeToWindow が setIgnoreMouseEvents(false) を設定済み）
      if (!editRef.current) {
        window.api?.widget?.setClickThrough?.(true)
      }
    }
  }, [editMode])

  // リサイズハンドル: 画面端まで窓を拡張してからマウスを追跡
  const handleResizeStart = useCallback((e) => {
    if (!widgetRef.current) return
    e.stopPropagation()
    const { w, h, type } = widgetRef.current
    const def  = getWidgetDef(type)
    const minW = def?.minSize?.w ?? 120
    const minH = def?.minSize?.h ?? 80
    const startX = e.clientX
    const startY = e.clientY

    // ウィンドウを画面端まで拡張 → マウスが外れても mousemove を受け取れる
    window.api.widget.expandForResize()

    const move = (e2) => {
      const nw = Math.max(minW, w + e2.clientX - startX)
      const nh = Math.max(minH, h + e2.clientY - startY)
      window.api.widget.setSize({ w: Math.round(nw), h: Math.round(nh) })
    }
    const up = (e2) => {
      const nw = Math.max(minW, w + e2.clientX - startX)
      const nh = Math.max(minH, h + e2.clientY - startY)
      window.api.widget.commitResize({ w: Math.round(nw), h: Math.round(nh) })
      window.removeEventListener('mousemove', move)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up, { once: true })
  }, [])

  if (!widget) return null

  const def = getWidgetDef(widget.type)
  const WidgetContent = getComponent(widget.type)
  const name = def?.name ?? widget.type

  // transparent フラグ付きウィジェットは編集モード時だけ輪郭を表示
  const isTransparent = !!def?.transparent

  return (
    <div style={{
      width: '100%', height: '100%',
      position: 'relative',
      background:   isTransparent ? 'transparent' : 'rgba(17,17,17,0.75)',
      borderRadius: isTransparent ? 0 : 16,
      border:       isTransparent
        ? (editMode ? '1px dashed rgba(91,140,255,0.45)' : 'none')
        : `1px solid rgba(255,255,255,${editMode ? 0.3 : 0.08})`,
      overflow: 'hidden',
      boxShadow: isTransparent
        ? (editMode ? '0 0 0 1px rgba(91,140,255,0.3)' : 'none')
        : (editMode ? '0 0 0 2px rgba(91,140,255,0.4), 0 8px 32px rgba(0,0,0,0.5)' : '0 4px 24px rgba(0,0,0,0.4)'),
      transition: 'border-color 150ms ease, box-shadow 150ms ease',
    }}>
      {/* ウィジェット本体（編集中はポインタイベント無効でドラッグ優先） */}
      <div style={{
        width: '100%', height: '100%',
        pointerEvents: editMode ? 'none' : 'auto',
      }}>
        <Suspense fallback={null}>
          <WidgetContent config={widget.config} />
        </Suspense>
      </div>

      {/* 編集モード: ネイティブドラッグ領域 */}
      {editMode && (
        <>
          {/* 全面ドラッグ: -webkit-app-region: drag で OS がウィンドウを動かす */}
          <div style={{
            position: 'absolute', inset: 0,
            WebkitAppRegion: 'drag',
            cursor: 'grab',
            zIndex: 100,
          }} />

          {/* 上部ラベル（ドラッグ領域の上に重ねる） */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            padding: '4px 8px',
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
            fontSize: 10, color: 'rgba(255,255,255,0.7)',
            display: 'flex', alignItems: 'center', gap: 5,
            pointerEvents: 'none', zIndex: 101,
            WebkitAppRegion: 'drag',
          }}>
            <span style={{ opacity: 0.7 }}>⠿</span>
            <span>{name}</span>
            <span style={{ marginLeft: 'auto', opacity: 0.45, fontSize: 9 }}>
              {widget.w}×{widget.h}
            </span>
          </div>

          {/* リサイズハンドル（no-drag でドラッグ領域から除外） */}
          <div
            onMouseDown={handleResizeStart}
            style={{
              position: 'absolute', right: 0, bottom: 0,
              width: 24, height: 24,
              cursor: 'se-resize', zIndex: 102,
              WebkitAppRegion: 'no-drag',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
              padding: 4,
            }}
          >
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1 }}>⊿</span>
          </div>
        </>
      )}
    </div>
  )
}

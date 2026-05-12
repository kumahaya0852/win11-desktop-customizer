import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { getAll, get as getWidgetDef } from './widgets/WidgetRegistry'
import { applyCSSVars } from './core/themeEngine'
import configStore from './core/configStore'

const SNAP = 12
function snap(v) { return Math.round(v / SNAP) * SNAP }
const _params   = new URLSearchParams(window.location.search)
const widgetId  = _params.get('widgetId')
// ★ URLパラメータから初期editModeを取得（ウィンドウ再作成直後から有効）
const _initEdit = _params.get('editMode') === '1'

export default function OverlayApp() {
  const [widget,   setWidget]   = useState(null)
  const [editMode, setEditMode] = useState(_initEdit)
  const [ready,    setReady]    = useState(false)
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)

  // ★ useRef で editMode を保持（useCallback のクロージャ問題を回避）
  const editModeRef = useRef(_initEdit)  // ← 初期値をURLパラメータから取得
  const widgetRef   = useRef(null)
  const dragRef     = useRef(null)

  useEffect(() => {
    async function init() {
      const theme = await configStore.get('theme.active')
      if (theme) applyCSSVars(theme)
      const layout = await configStore.get('widgets.layout')
      const w = Array.isArray(layout) ? layout.find(x => x.id === widgetId) : null
      setWidget(w ?? null)
      widgetRef.current = w ?? null
      setReady(true)
    }
    init()
  }, [])

  useEffect(() => {
    if (!window.api) return
    window.api.on('overlay:syncWidgets', (layout) => {
      if (!Array.isArray(layout)) return
      const w = layout.find(x => x.id === widgetId)
      setWidget(w ?? null)
      widgetRef.current = w ?? null
    })
    window.api.on('widget:editMode', (enabled) => {
      console.log('[OverlayApp] widget:editMode received:', enabled)
      editModeRef.current = !!enabled
      setEditMode(!!enabled)
    })
    window.api.on('theme:changed', applyCSSVars)
  }, [])

  // ── ドラッグ（ref ベースでクロージャ問題を回避）──────────
  const onDragStart = useCallback((e) => {
    console.log('[OverlayApp] mousedown, editModeRef:', editModeRef.current, 'editMode state:', document.title)
    if (!editModeRef.current) {
      console.log('[OverlayApp] blocked - editMode is false')
      return
    }
    if (e.target.closest('[data-resize]')) return
    e.preventDefault()

    const w = widgetRef.current
    dragRef.current = {
      sx: e.screenX, sy: e.screenY,
      ox: w?.x ?? 0, oy: w?.y ?? 0,
    }
    setDragging(true)

    const move = (e2) => {
      if (!dragRef.current) return
      const nx = snap(dragRef.current.ox + e2.screenX - dragRef.current.sx)
      const ny = snap(dragRef.current.oy + e2.screenY - dragRef.current.sy)
      window.api?.widgets?.update?.({ ...widgetRef.current, x: nx, y: ny })
    }
    const up = (e2) => {
      if (!dragRef.current) return
      const nx = snap(dragRef.current.ox + e2.screenX - dragRef.current.sx)
      const ny = snap(dragRef.current.oy + e2.screenY - dragRef.current.sy)
      window.api?.widgets?.notifyMoved?.({ id: widgetId, x: nx, y: ny })
      dragRef.current = null
      setDragging(false)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }, []) // deps 空 → 再作成しない、ref で最新値を参照

  // ── リサイズ ──────────────────────────────────────────
  const onResizeStart = useCallback((e) => {
    if (!editModeRef.current) return
    e.preventDefault(); e.stopPropagation()
    const w = widgetRef.current
    const def = getWidgetDef(w?.type)
    dragRef.current = {
      sx: e.screenX, sy: e.screenY,
      ow: w?.w ?? 200, oh: w?.h ?? 120,
      minW: def?.minSize?.w ?? 120, minH: def?.minSize?.h ?? 80,
    }
    setResizing(true)

    const move = (e2) => {
      if (!dragRef.current) return
      const nw = Math.max(dragRef.current.minW, snap(dragRef.current.ow + e2.screenX - dragRef.current.sx))
      const nh = Math.max(dragRef.current.minH, snap(dragRef.current.oh + e2.screenY - dragRef.current.sy))
      window.api?.widgets?.resize?.(widgetId, nw, nh)
    }
    const up = (e2) => {
      if (!dragRef.current) return
      const nw = Math.max(dragRef.current.minW, snap(dragRef.current.ow + e2.screenX - dragRef.current.sx))
      const nh = Math.max(dragRef.current.minH, snap(dragRef.current.oh + e2.screenY - dragRef.current.sy))
      window.api?.widgets?.notifyResized?.({ id: widgetId, w: nw, h: nh })
      dragRef.current = null
      setResizing(false)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }, [])

  if (!ready || !widget) return null

  const def = getWidgetDef(widget.type)
  const WidgetContent = getWidgetComponent(widget.type)

  return (
    <div
      onMouseDown={onDragStart}
      style={{
        width: '100vw', height: '100vh',
        background: 'rgba(17,17,17,0.75)',
        borderRadius: 16,
        border: `1px solid rgba(255,255,255,${editMode ? 0.35 : 0.08})`,
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        cursor: editMode ? (dragging ? 'grabbing' : 'grab') : 'default',
        boxShadow: dragging || resizing
          ? '0 20px 60px rgba(0,0,0,0.7),0 0 0 2px rgba(91,140,255,0.6)'
          : '0 4px 24px rgba(0,0,0,0.5)',
        userSelect: 'none',
        position: 'relative',
        outline: editMode ? '2px solid rgba(91,140,255,0.4)' : 'none',
        outlineOffset: '-2px',
      }}
    >
      {editMode && (
        <div style={{
          padding: '5px 10px', fontSize: 10,
          color: 'rgba(255,255,255,0.6)',
          background: 'rgba(0,0,0,0.45)',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', alignItems: 'center', gap: 6,
          flexShrink: 0, fontFamily: 'sans-serif',
        }}>
          <span>⠿</span>
          <span style={{ flex: 1 }}>{def?.name ?? widget.type}</span>
          <span style={{
            fontSize: 9, padding: '1px 6px', borderRadius: 99,
            background: 'rgba(91,140,255,0.2)', color: 'rgba(91,140,255,0.9)',
            border: '1px solid rgba(91,140,255,0.3)',
          }}>
            {widget.zLevel === 'top' ? '最前面' : widget.zLevel === 'bottom' ? '壁紙の上' : '通常'}
          </span>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Suspense fallback={null}>
          <WidgetContent config={widget.config} />
        </Suspense>
      </div>

      {editMode && (
        <div
          data-resize
          onMouseDown={onResizeStart}
          style={{
            position: 'absolute', right: 0, bottom: 0,
            width: 24, height: 24,
            cursor: 'se-resize',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
            padding: 4, zIndex: 10,
          }}
        >
          <span style={{
            fontSize: 14,
            color: resizing ? 'rgba(91,140,255,0.9)' : 'rgba(255,255,255,0.4)',
            lineHeight: 1,
          }}>⊿</span>
        </div>
      )}
    </div>
  )
}

const componentCache = new Map()
function getWidgetComponent(type) {
  if (componentCache.has(type)) return componentCache.get(type)
  const def = getAll().find(d => d.id === type)
  if (!def) { const F = () => null; componentCache.set(type, F); return F }
  const C = lazy(def.component); componentCache.set(type, C); return C
}

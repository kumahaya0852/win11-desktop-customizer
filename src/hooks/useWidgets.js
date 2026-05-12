import { useState, useEffect, useCallback, useRef } from 'react'
import configStore from '../core/configStore'
import bus, { EVENTS } from '../core/eventBus'
import { get as getWidgetDef } from '../widgets/WidgetRegistry'

const isElectron = typeof window !== 'undefined' && typeof window.api !== 'undefined'

// 新設計: ウィジェットウィンドウへ即時同期
function syncToWindows(widgets) {
  if (!isElectron || !window.api?.widgets) return
  // visible:true のウィジェットだけウィンドウを作る
  window.api.widgets.syncAll(widgets).catch(() => {})
}

export function useWidgets() {
  const [widgets, setWidgets] = useState([])
  const [ready,   setReady]   = useState(false)
  const nextId = useRef(Date.now())

  useEffect(() => {
    configStore.get('widgets.layout').then(layout => {
      if (Array.isArray(layout)) {
        setWidgets(layout)
        // ★ Bug2修正: 起動時に既存ウィジェットをデスクトップに同期
        syncToWindows(layout)
      }
      setReady(true)
    })
  }, [])

  const persist = useCallback((updater) => {
    setWidgets(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      configStore.set('widgets.layout', next)
      syncToWindows(next)
      return next
    })
  }, [])

  const addWidget = useCallback((type, pos = { x: 40, y: 40 }) => {
    const def  = getWidgetDef(type)
    const size = def?.defaultSize ?? { w: 220, h: 120 }
    const id   = `w_${nextId.current++}`
    const newWidget = {
      id, type,
      x: pos.x, y: pos.y,
      w: size.w, h: size.h,
      zLevel:  'normal',   // ウィジェットウィンドウの z-order
      visible: true,       // デスクトップ表示するか
      config:  { instanceId: id },
    }
    persist(prev => [...prev, newWidget])
    bus.emit(EVENTS.WIDGET_ADDED, newWidget)
    return newWidget
  }, [persist])

  const updateWidget = useCallback((id, patch) => {
    persist(prev => prev.map(w => {
      if (w.id !== id) return w
      if (patch.config) {
        return { ...w, ...patch, config: { ...w.config, ...patch.config } }
      }
      return { ...w, ...patch }
    }))
  }, [persist])

  const removeWidget = useCallback((id) => {
    // ウィジェットウィンドウも閉じる
    if (isElectron && window.api?.widgets) {
      window.api.widgets.remove(id).catch(() => {})
    }
    persist(prev => prev.filter(w => w.id !== id))
    bus.emit(EVENTS.WIDGET_REMOVED, { id })
  }, [persist])

  // リサイズ通知を受信してストアに反映
  useEffect(() => {
    if (!isElectron) return
    const handler = ({ id, w, h }) => {
      persist(prev => prev.map(wid => wid.id === id ? { ...wid, w, h } : wid))
    }
    window.api.on('overlay:widgetResized', handler)
    return () => window.api.off('overlay:widgetResized', handler)
  }, [persist])

  return { widgets, addWidget, updateWidget, removeWidget, ready }
}

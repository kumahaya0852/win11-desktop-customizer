import { useState, useEffect, useCallback, useRef } from 'react'
import configStore from '../core/configStore'
import bus, { EVENTS } from '../core/eventBus'
import { get as getWidgetDef } from '../widgets/WidgetRegistry'

const isElectron = typeof window !== 'undefined' && typeof window.api !== 'undefined'

// ウィジェット個別ウィンドウへレイアウト変更を送信
function syncWidgetWindows(widgets) {
  if (!isElectron || !window.api?.widgets) return
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
        // 起動時に main プロセスがすでに widgetWindows.updateLayout を呼んでいるため
        // ここでは syncWidgetWindows を呼ばない（重複作成を防止）
      }
      setReady(true)
    })
  }, [])

  // ウィジェットウィンドウからのレイアウト変更（ドラッグ/リサイズ等）を受信して UI 同期
  useEffect(() => {
    if (!isElectron) return
    const handler = (layout) => {
      if (!Array.isArray(layout)) return
      setWidgets(layout)
      // widget ウィンドウはすでに正しい位置にあるので syncWidgetWindows は呼ばない
    }
    window.api.on('overlay:syncWidgets', handler)
    return () => window.api.off('overlay:syncWidgets', handler)
  }, [])

  const persist = useCallback((updater) => {
    setWidgets(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      configStore.set('widgets.layout', next)
      syncWidgetWindows(next) // ウィジェットウィンドウへ変更を反映
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
      zLevel:  'normal',
      visible: true,
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
    persist(prev => prev.filter(w => w.id !== id))
    bus.emit(EVENTS.WIDGET_REMOVED, { id })
  }, [persist])

  return { widgets, addWidget, updateWidget, removeWidget, ready }
}

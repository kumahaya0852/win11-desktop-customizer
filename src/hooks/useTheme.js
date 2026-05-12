/**
 * hooks/useTheme.js
 * テーマの取得・適用を React から使うフック。
 */
import { useState, useEffect } from 'react'
import bus, { EVENTS } from '../core/eventBus'
import { applyTheme, restoreTheme } from '../core/themeEngine'
import configStore from '../core/configStore'

export function useTheme() {
  const [theme, setTheme] = useState(null)
  const [applying, setApplying] = useState(false)

  // 起動時に保存済みテーマを復元
  useEffect(() => {
    restoreTheme().then(t => {
      if (t) setTheme(t)
    })
  }, [])

  // EventBus でテーマ変更を購読
  useEffect(() => {
    const handler = (t) => setTheme(t)
    bus.on(EVENTS.THEME_CHANGED, handler)
    return () => bus.off(EVENTS.THEME_CHANGED, handler)
  }, [])

  async function apply(newTheme) {
    setApplying(true)
    try {
      await applyTheme(newTheme)
      setTheme(newTheme)
    } finally {
      setApplying(false)
    }
  }

  return { theme, apply, applying }
}

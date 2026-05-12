/**
 * hooks/useStore.js
 * configStore を React から使いやすくするフック。
 * const [value, setValue] = useStore('theme.active', defaultValue)
 */
import { useState, useEffect, useCallback } from 'react'
import configStore from '../core/configStore'
import bus from '../core/eventBus'

export function useStore(key, fallback = null) {
  const [value, setValue] = useState(fallback)
  const [ready, setReady] = useState(false)

  // 初回ロード
  useEffect(() => {
    let cancelled = false
    configStore.get(key).then(v => {
      if (!cancelled) {
        setValue(v ?? fallback)
        setReady(true)
      }
    })
    return () => { cancelled = true }
  }, [key])

  // EventBus 経由で他コンポーネントの変更を受け取る
  useEffect(() => {
    const handler = ({ key: k, value: v }) => {
      if (k === key) setValue(v)
    }
    bus.on('store:updated', handler)
    return () => bus.off('store:updated', handler)
  }, [key])

  const update = useCallback(async (newValue) => {
    await configStore.set(key, newValue)
    setValue(newValue)
    bus.emit('store:updated', { key, value: newValue })
  }, [key])

  return [value, update, ready]
}

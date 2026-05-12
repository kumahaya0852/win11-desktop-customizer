import { useState, useEffect, useRef } from 'react'
import configStore from '../../core/configStore'

export default function NoteWidget({ config }) {
  const storageKey = `widget.note.${config?.instanceId ?? 'default'}`
  const [text, setText] = useState('')
  const [loaded, setLoaded] = useState(false)
  const syncTimer = useRef(null)

  useEffect(() => {
    configStore.get(storageKey).then(v => {
      if (typeof v === 'string') setText(v)
      setLoaded(true)
    })
  }, [storageKey])

  function handleChange(e) {
    const v = e.target.value
    setText(v)
    configStore.set(storageKey, v)

    // ★ リアルタイム同期: 入力のたびにオーバーレイに即送信（300ms デバウンス）
    if (syncTimer.current) clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(async () => {
      if (!window.api?.overlay) return
      const isVisible = await window.api.overlay.isVisible().catch(() => false)
      if (!isVisible) return
      // widgets.layout の当該ウィジェットの config を更新してから syncWidgets
      const layout = await configStore.get('widgets.layout')
      if (!Array.isArray(layout)) return
      // ノートの内容は config.instanceId のストアキーで取るので layout 変更不要
      // オーバーレイ側は configStore から直接読むため syncWidgets を呼ぶだけでOK
      window.api.overlay.syncWidgets(layout).catch(() => {})
    }, 150)
  }

  useEffect(() => () => { if (syncTimer.current) clearTimeout(syncTimer.current) }, [])

  if (!loaded) return null

  return (
    <textarea
      value={text}
      onChange={handleChange}
      placeholder="メモを入力..."
      style={{
        width: '100%', height: '100%',
        background: 'transparent',
        border: 'none', outline: 'none',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-ui)',
        fontSize: 13, lineHeight: 1.7,
        resize: 'none',
        padding: '10px 14px',
        cursor: 'text',
      }}
    />
  )
}

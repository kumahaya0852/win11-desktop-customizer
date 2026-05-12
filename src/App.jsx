import { useEffect, useState } from 'react'
import Drawer from './ui/Drawer'
import DetailApp from './ui/DetailApp'
import configStore from './core/configStore'
import themeEngine from './core/themeEngine'

export default function App() {
  const [ready, setReady] = useState(false)
  // URLパラメータで詳細設定ウィンドウかどうか判定
  const isDetail = new URLSearchParams(window.location.search).get('detail') === '1'

  useEffect(() => {
    async function init() {
      await configStore.initDefaults()
      await themeEngine.restoreTheme()
      setReady(true)
    }
    init()
  }, [])

  if (!ready) return (
    <div style={{
      width:'100%', height:'100%',
      display:'flex', alignItems:'center', justifyContent:'center',
      background: isDetail ? '#0a0a0f' : 'transparent',
      color:'rgba(255,255,255,0.2)', fontSize: 28,
      animation: 'pulse 1.5s ease-in-out infinite',
    }}>◈</div>
  )

  return isDetail ? <DetailApp /> : <Drawer />
}

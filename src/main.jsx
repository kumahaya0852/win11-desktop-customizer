import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'
import pluginHost from './plugins/PluginHost'

// アプリ起動時にプラグインホストを初期化
pluginHost.init().catch(err => {
  console.error('[PluginHost] init error:', err)
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

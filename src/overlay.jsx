import React from 'react'
import ReactDOM from 'react-dom/client'
import OverlayApp from './OverlayApp'
import './styles/global.css'
import './styles/overlay.css'

ReactDOM.createRoot(document.getElementById('overlay-root')).render(
  <React.StrictMode>
    <OverlayApp />
  </React.StrictMode>
)

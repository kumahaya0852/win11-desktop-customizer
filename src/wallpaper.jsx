import { createRoot } from 'react-dom/client'
import WallpaperOverlay from './ui/WallpaperOverlay'

const el = document.getElementById('wallpaper-root')
createRoot(el).render(<WallpaperOverlay />)

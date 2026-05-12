import { useState, useEffect } from 'react'

export default function ClockWidget() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  const date = now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', gap: 4, padding: 12,
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 32, fontWeight: 500,
        color: 'var(--text-primary)', letterSpacing: '0.05em', lineHeight: 1,
      }}>
        {hh}<span style={{ color: 'var(--accent)', animation: 'blink 1s step-end infinite' }}>:</span>
        {mm}<span style={{ color: 'var(--accent)' }}>:</span>{ss}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{date}</div>
      <style>{`@keyframes blink { 50% { opacity: 0.3 } }`}</style>
    </div>
  )
}

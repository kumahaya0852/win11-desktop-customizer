import { useState, useEffect, useRef } from 'react'

const HIST_LEN = 20
const INTERVALS = [
  { label: '1秒', ms: 1000 },
  { label: '5秒', ms: 5000 },
  { label: '10秒', ms: 10000 },
  { label: '30秒', ms: 30000 },
]
const DEFAULT_INTERVAL = 5000

function useSysStats(pollMs) {
  const [stats, setStats] = useState({
    cpu: 0, mem: 0, disk: 0,
    uptimeSec: 0, netSend: 0, netRecv: 0, stub: true,
  })
  const [history, setHistory] = useState({ cpu: [], mem: [] })
  const timer = useRef(null)

  async function fetch() {
    try {
      const s = window.api?.system?.stats
        ? await window.api.system.stats()
        : _fake()
      setStats(s)
      setHistory(prev => ({
        cpu: [...prev.cpu.slice(-(HIST_LEN - 1)), s.cpu ?? 0],
        mem: [...prev.mem.slice(-(HIST_LEN - 1)), s.mem ?? 0],
      }))
    } catch { /* silent */ }
  }

  useEffect(() => {
    fetch()
    timer.current = setInterval(fetch, pollMs)
    return () => clearInterval(timer.current)
  }, [pollMs])

  return { stats, history }
}

function _fake() {
  return {
    cpu: Math.round(15 + Math.random() * 35),
    mem: Math.round(40 + Math.random() * 25),
    disk: Math.round(55 + Math.random() * 10),
    uptimeSec: Math.floor(Date.now() / 1000) % 86400,
    netSend: 0, netRecv: 0, stub: true,
  }
}

function Sparkline({ data, color, w = 72, h = 20 }) {
  if (data.length < 2) return <div style={{ width: w, height: h }} />
  const pts = data.map((v, i) => {
    const x = (i / (HIST_LEN - 1)) * w
    const y = h - Math.min(1, v / 100) * (h - 2) - 1
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg width={w} height={h} style={{ overflow: 'visible', flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color}
        strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
    </svg>
  )
}

function StatRow({ label, value, color, history }) {
  const c = value > 85 ? 'var(--err)' : value > 65 ? 'var(--warn)' : color
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0, width: 28 }}>{label}</span>
        <Sparkline data={history} color={c} />
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: c, minWidth: 40, textAlign: 'right' }}>
          {value.toFixed(1)}%
        </span>
      </div>
      <div style={{ height: 3, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${Math.min(100, value)}%`, background: c,
          borderRadius: 99, transition: 'width 2s ease, background 0.5s',
        }} />
      </div>
    </div>
  )
}

function MiniStat({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center' }}>
      <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '.04em' }}>
        {label}
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
        {value}
      </span>
    </div>
  )
}

function formatUptime(sec) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h >= 24) return `${Math.floor(h/24)}d${h%24}h`
  if (h > 0)   return `${h}h${String(m).padStart(2,'0')}m`
  return `${String(m).padStart(2,'0')}m`
}

export default function SysMonitorWidget({ config }) {
  const [intervalMs, setIntervalMs] = useState(
    config?.intervalMs ?? DEFAULT_INTERVAL
  )
  const [showMenu, setShowMenu] = useState(false)
  const { stats, history } = useSysStats(intervalMs)

  async function changeInterval(ms) {
    setIntervalMs(ms)
    setShowMenu(false)
    if (window.api?.system?.setInterval) {
      await window.api.system.setInterval(ms)
    }
  }

  const currentLabel = INTERVALS.find(i => i.ms === intervalMs)?.label ?? '5秒'

  return (
    <div style={{
      padding: '10px 14px', height: '100%',
      display: 'flex', flexDirection: 'column', gap: 8,
      position: 'relative',
    }}>
      <StatRow label="CPU" value={stats.cpu} color="var(--accent)" history={history.cpu} />
      <StatRow label="MEM" value={stats.mem} color="var(--ok)"    history={history.mem} />

      <div style={{
        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
        marginTop: 'auto', paddingTop: 6,
        borderTop: '1px solid var(--border)',
      }}>
        <MiniStat label="DISK" value={`${stats.disk.toFixed(0)}%`} />
        <MiniStat label="UP"   value={formatUptime(stats.uptimeSec)} />

        {/* 更新間隔セレクター */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowMenu(v => !v)}
            style={{
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 4, padding: '2px 6px',
              color: 'var(--text-muted)', fontSize: 9,
              fontFamily: 'var(--font-mono)', cursor: 'pointer',
              letterSpacing: '.04em',
            }}
            title="更新間隔"
          >
            ⟳{currentLabel}
          </button>
          {showMenu && (
            <div style={{
              position: 'absolute', bottom: 'calc(100% + 4px)', right: 0,
              background: 'var(--bg-panel)', border: '1px solid var(--border-md)',
              borderRadius: 8, overflow: 'hidden', zIndex: 9999,
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)', minWidth: 80,
            }}>
              {INTERVALS.map(iv => (
                <button key={iv.ms}
                  onClick={() => changeInterval(iv.ms)}
                  style={{
                    display: 'block', width: '100%', padding: '7px 12px',
                    background: intervalMs === iv.ms ? 'var(--accent-dim)' : 'none',
                    border: 'none', color: intervalMs === iv.ms ? 'var(--accent)' : 'var(--text-primary)',
                    fontFamily: 'var(--font-mono)', fontSize: 12, cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {iv.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {stats.stub && <MiniStat label="MODE" value="demo" />}
      </div>
    </div>
  )
}

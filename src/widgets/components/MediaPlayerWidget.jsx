/**
 * MediaPlayerWidget.jsx
 * 丸型ビジュアライザー + 回転サムネイル + 透過背景
 */
import { useEffect, useRef, useState, useCallback } from 'react'

const BAR_COUNT = 38
const POLL_MS   = 1500
const SMOOTHING = 0.55  // 低いほど瞬発力が上がる（元0.80）

// プライムステップ散布テーブル
// bar i → freq (i*17)%48（素数17ステップ、gcd(17,48)=1 → 全48本カバー）
// +17 → +17 → -31(ラップ) の繰り返しで隣接バーが不規則な帯域に対応
const FREQ_FOR_BAR = (() => {
  const arr = new Int32Array(BAR_COUNT)
  for (let i = 0; i < BAR_COUNT; i++) arr[i] = (i * 17) % BAR_COUNT
  return arr
})()

// ── ユーティリティ ────────────────────────────────────────────────
function readAccentHex() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  return v.startsWith('#') ? v : '#5b8cff'
}
function hexToRgb(hex) {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  return m ? `${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)}` : '91,140,255'
}
function fmtTime(secs) {
  if (!secs || secs <= 0) return '0:00'
  const m = Math.floor(secs / 60)
  const s = String(Math.floor(secs % 60)).padStart(2, '0')
  return `${m}:${s}`
}

// ── 音声ビジュアライザーフック ────────────────────────────────────
function useAudioVisualizer(canvasRef, accentRef) {
  const audioCtxRef = useRef(null)
  const analyserRef = useRef(null)
  const rafRef      = useRef(null)
  const streamRef   = useRef(null)
  const [enabled, setEnabled] = useState(false)
  const [error,   setError]   = useState(null)
  const buf = useRef(new Float32Array(BAR_COUNT))

  const start = useCallback(async () => {
    if (audioCtxRef.current) return
    setError(null)
    try {
      const sources = await window.api?.desktopCapturer?.getSources?.() ?? []
      if (!sources.length) throw new Error('キャプチャソースなし')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sources[0].id } },
        video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sources[0].id } },
      })
      stream.getVideoTracks().forEach(t => t.stop())
      streamRef.current = stream
      const audioCtx = new AudioContext()
      const source   = audioCtx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()))
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize               = 512
      analyser.smoothingTimeConstant = SMOOTHING
      source.connect(analyser)
      audioCtxRef.current = audioCtx
      analyserRef.current = analyser
      setEnabled(true)
    } catch (e) { setError(e.message) }
  }, [])

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    audioCtxRef.current?.close()
    audioCtxRef.current = null
    analyserRef.current = null
    streamRef.current   = null
    setEnabled(false)
  }, [])

  // 丸型描画ループ
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    function draw() {
      rafRef.current = requestAnimationFrame(draw)
      const W = canvas.width, H = canvas.height
      ctx.clearRect(0, 0, W, H)

      // 周波数データ取得 or アイドルアニメーション
      if (analyserRef.current) {
        const raw  = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(raw)
        const bins = raw.length

        // ① 対数スケールで全帯域を48バケツにサンプリング
        const freq = new Float32Array(BAR_COUNT)
        for (let f = 0; f < BAR_COUNT; f++) {
          const t   = f / (BAR_COUNT - 1)
          const idx = Math.min(Math.floor(Math.pow(bins, t * 0.84 + 0.03)), bins - 1)
          freq[f]   = raw[idx] / 255
        }
        // ② プライムステップ配置 + 感度ブースト（1.4倍、最大1にクランプ）
        for (let i = 0; i < BAR_COUNT; i++) {
          const boosted = Math.min(1, freq[FREQ_FOR_BAR[i]] * 1.8)
          buf.current[i] = buf.current[i] * 0.50 + boosted * 0.50
        }
      } else {
        const t = Date.now() / 1000
        for (let i = 0; i < BAR_COUNT; i++) {
          const target = Math.max(0, Math.sin(t * 1.2 + i * 0.20) * 0.12 + 0.10)
          buf.current[i] = buf.current[i] * 0.92 + target * 0.08
        }
      }

      const cx = W / 2, cy = H / 2
      const size    = Math.min(W, H)
      const R_in    = size * 0.285   // アルバムアートの外縁
      const R_out   = size * 0.420   // バー最大外縁（コンパクト）

      const hex = accentRef.current
      const m   = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
      const r = m ? parseInt(m[1],16) : 91
      const g = m ? parseInt(m[2],16) : 140
      const b = m ? parseInt(m[3],16) : 255

      // 空間スピルオーバー: 自分が静止中のみ隣の25%を受け取る
      const display = new Float32Array(BAR_COUNT)
      for (let i = 0; i < BAR_COUNT; i++) {
        const own      = buf.current[i]
        const spillover = 0.25 * buf.current[(i - 1 + BAR_COUNT) % BAR_COUNT]
                        + 0.25 * buf.current[(i + 1) % BAR_COUNT]
        display[i] = Math.min(1, own + spillover * (1 - own))
      }

      // 外周グローリング
      const avg = display.reduce((s, v) => s + v, 0) / BAR_COUNT
      if (avg > 0.02) {
        const glow = ctx.createRadialGradient(cx, cy, R_in, cx, cy, R_out * 1.25)
        glow.addColorStop(0, `rgba(${r},${g},${b},${avg * 0.18})`)
        glow.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.beginPath(); ctx.arc(cx, cy, R_out * 1.25, 0, Math.PI * 2)
        ctx.fillStyle = glow; ctx.fill()
      }

      // バー
      const lw = Math.max(1.5, (2 * Math.PI * R_in / BAR_COUNT) * 0.68)
      ctx.lineCap = 'round'
      ctx.lineWidth = lw

      // 音の重心ベクトル計算（偏りがある方向に楕円を動的に伸ばす）
      let ex = 0, ey = 0
      for (let i = 0; i < BAR_COUNT; i++) {
        const a = (i / BAR_COUNT) * Math.PI * 2 - Math.PI / 2
        ex += display[i] * Math.cos(a)
        ey += display[i] * Math.sin(a)
      }
      const eAngle = Math.atan2(ey, ex)
      const ellipseStr = Math.min(0.7, Math.sqrt(ex * ex + ey * ey) * 0.28)

      for (let i = 0; i < BAR_COUNT; i++) {
        const angle  = (i / BAR_COUNT) * Math.PI * 2 - Math.PI / 2
        const val    = display[i]
        // 重心方向に最大70%伸びる動的楕円（音が均等なら真円）
        const ellipse = 1 + ellipseStr * Math.pow(Math.cos(angle - eAngle), 2)
        const len    = Math.max(lw, val * (R_out - R_in) * ellipse)
        const alpha  = 0.30 + val * 0.70

        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(angle) * R_in,
                   cy + Math.sin(angle) * R_in)
        ctx.lineTo(cx + Math.cos(angle) * (R_in + len),
                   cy + Math.sin(angle) * (R_in + len))
        ctx.stroke()
      }

      // 内円 — 半透明の下地（アルバムアート外縁）
      ctx.beginPath(); ctx.arc(cx, cy, R_in - lw * 0.5, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill()
    }

    draw()
    return () => cancelAnimationFrame(rafRef.current)
  }, [canvasRef, enabled])

  // マウント時に自動開始を試みる
  useEffect(() => {
    const t = setTimeout(start, 300)
    return () => { clearTimeout(t); stop() }
  }, [])

  return { enabled, error, start, stop }
}

// ── メディア情報ポーリングフック ──────────────────────────────────
function useMediaInfo() {
  const [info, setInfo] = useState({ ok: false, title: '', artist: '', status: 'Stopped', app: '', position: 0, duration: 0, thumbnail: null })
  useEffect(() => {
    let alive = true
    async function poll() {
      try {
        const res = await window.api?.media?.getInfo?.()
        if (alive && res) setInfo(prev => ({ ...prev, ...res }))
      } catch {}
    }
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => { alive = false; clearInterval(id) }
  }, [])
  return info
}

// ── コントロールボタン ────────────────────────────────────────────
function CtrlBtn({ onClick, children, accentRgb, large }) {
  const [hov, setHov] = useState(false)
  const size = large ? 46 : 34
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? `rgba(${accentRgb},0.22)` : 'rgba(255,255,255,0.07)',
        border: `1px solid ${hov ? `rgba(${accentRgb},0.55)` : 'rgba(255,255,255,0.12)'}`,
        borderRadius: '50%',
        color: hov ? `rgb(${accentRgb})` : 'rgba(255,255,255,0.80)',
        width: size, height: size,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', fontSize: large ? 20 : 15,
        transition: 'all 140ms ease', flexShrink: 0,
        backdropFilter: 'blur(4px)',
      }}
    >{children}</button>
  )
}

// ── メインウィジェット ────────────────────────────────────────────
export default function MediaPlayerWidget() {
  const canvasRef      = useRef(null)
  const containerRef   = useRef(null)
  const accentRef      = useRef('#5b8cff')
  const [canvasSize, setCanvasSize] = useState(240)
  const [accentHex,  setAccentHex]  = useState('#5b8cff')

  // テーマ変更追従
  useEffect(() => {
    const v = readAccentHex()
    setAccentHex(v); accentRef.current = v
    const handler = (theme) => {
      const c = theme?.accentColor ?? readAccentHex()
      setAccentHex(c); accentRef.current = c
    }
    window.api?.on?.('theme:changed', handler)
    const mo = new MutationObserver(() => {
      const c = readAccentHex()
      accentRef.current = c; setAccentHex(c)
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
    return () => mo.disconnect()
  }, [])

  // キャンバスコンテナのリサイズ追従
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const s = Math.min(e.contentRect.width, e.contentRect.height)
      setCanvasSize(Math.max(1, Math.round(s)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const accentRgb = hexToRgb(accentHex)
  const info      = useMediaInfo()
  const { enabled, error, start, stop } = useAudioVisualizer(canvasRef, accentRef)
  const isPlaying = info.status === 'Playing'
  const progress  = info.duration > 0 ? Math.min(1, info.position / info.duration) : 0

  // 回転角（アイドルでもじっくり動く）
  const rotRef = useRef(0)
  const lastTimeRef = useRef(null)
  useEffect(() => {
    let raf
    function tick(t) {
      raf = requestAnimationFrame(tick)
      if (lastTimeRef.current != null) {
        const dt = (t - lastTimeRef.current) / 1000
        const speed = isPlaying ? 10 : 1  // 再生中は速く、停止中はゆっくり
        rotRef.current = (rotRef.current + dt * speed) % 360
        if (thumbImgRef.current) {
          thumbImgRef.current.style.transform = `rotate(${rotRef.current}deg)`
        }
      }
      lastTimeRef.current = t
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying])

  const thumbImgRef = useRef(null)
  const artSize = Math.round(canvasSize * 0.54)

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: 'transparent', overflow: 'hidden', userSelect: 'none',
    }}>
      {/* ── 円形ビジュアライザー + アルバムアート ── */}
      <div ref={containerRef} style={{
        flex: 1, position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: 0,
      }}>
        <canvas ref={canvasRef}
          width={canvasSize} height={canvasSize}
          style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: canvasSize, height: canvasSize }}
        />

        {/* 回転アルバムアート */}
        <div style={{
          position: 'relative', zIndex: 1,
          width: artSize, height: artSize,
          borderRadius: '50%', overflow: 'hidden',
          boxShadow: `0 0 20px rgba(${accentRgb},0.35), 0 4px 16px rgba(0,0,0,0.6)`,
          border: `2px solid rgba(${accentRgb},0.30)`,
          flexShrink: 0,
        }}>
          {/* 回転させる内側コンテナ */}
          <div ref={thumbImgRef} style={{
            width: '100%', height: '100%',
            willChange: 'transform',
          }}>
            {info.thumbnail ? (
              <img src={info.thumbnail}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                draggable={false}
                onError={e => {
                  // maxresdefault が存在しない場合 hqdefault にフォールバック
                  if (e.target.src.includes('maxresdefault')) {
                    e.target.src = e.target.src.replace('maxresdefault', 'hqdefault')
                  }
                }}
              />
            ) : (
              <div style={{
                width: '100%', height: '100%',
                background: `conic-gradient(from 0deg, rgba(${accentRgb},0.6), rgba(0,0,0,0.8), rgba(${accentRgb},0.6))`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: artSize * 0.3,
              }}>
                🎵
              </div>
            )}
          </div>

          {/* 中心ピン（CDっぽく） */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            width: artSize * 0.12, height: artSize * 0.12,
            borderRadius: '50%',
            background: 'rgba(15,15,20,0.95)',
            border: `1.5px solid rgba(${accentRgb},0.5)`,
            zIndex: 2,
          }} />
        </div>

        {/* ビジュアライザー ON/OFF */}
        <button onClick={enabled ? stop : start}
          title={enabled ? 'ビジュアライザーをオフ' : 'ビジュアライザーをオン'}
          style={{
            position: 'absolute', bottom: 4, right: 4,
            background: enabled ? `rgba(${accentRgb},0.18)` : 'rgba(255,255,255,0.05)',
            border: `1px solid ${enabled ? `rgba(${accentRgb},0.4)` : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 6, color: enabled ? `rgb(${accentRgb})` : 'rgba(255,255,255,0.25)',
            width: 22, height: 22, fontSize: 11, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >〜</button>
      </div>

      {/* ── 曲名・アーティスト ── */}
      <div style={{ padding: '4px 14px 0', textAlign: 'center', flexShrink: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 700, letterSpacing: '.02em',
          color: info.ok ? 'rgba(255,255,255,0.93)' : 'rgba(255,255,255,0.30)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {info.ok ? (info.title || '（タイトルなし）') : '再生なし'}
        </div>
        <div style={{
          fontSize: 10, color: 'rgba(255,255,255,0.42)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2,
        }}>
          {info.ok ? (info.artist || '不明なアーティスト') : 'Spotify / YouTube Music 等'}
        </div>
      </div>

      {/* ── プログレスバー ── */}
      <div style={{ padding: '6px 28px 2px', flexShrink: 0 }}>
        <div style={{
          height: 3, background: 'rgba(255,255,255,0.10)',
          borderRadius: 99, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: `${progress * 100}%`,
            background: `linear-gradient(90deg, rgba(${accentRgb},0.7), rgb(${accentRgb}))`,
            borderRadius: 99, transition: 'width 1.4s linear',
          }} />
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          marginTop: 3, fontSize: 9,
          color: 'rgba(255,255,255,0.28)',
          fontFamily: 'var(--font-mono)',
        }}>
          <span>{fmtTime(info.position)}</span>
          <span>{fmtTime(info.duration)}</span>
        </div>
      </div>

      {/* ── コントロール ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 10, padding: '4px 14px 10px', flexShrink: 0,
      }}>
        <CtrlBtn onClick={() => window.api?.media?.prev?.()}    accentRgb={accentRgb}>⏮</CtrlBtn>
        <CtrlBtn onClick={() => window.api?.media?.toggle?.()}  accentRgb={accentRgb} large>
          {isPlaying ? '⏸' : '▶'}
        </CtrlBtn>
        <CtrlBtn onClick={() => window.api?.media?.next?.()}    accentRgb={accentRgb}>⏭</CtrlBtn>
      </div>
    </div>
  )
}

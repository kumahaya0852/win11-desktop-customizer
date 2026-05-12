/**
 * electron/native/sysmon.js  (軽量版)
 *
 * 外部プロセス起動ゼロ。Node.js 標準の os モジュールで取得。
 * CPU は前後2回のアイドル/総時間差分で計算。
 *
 * 更新間隔はユーザー設定で変更可能（デフォルト5秒）。
 */

const os = require('os')

// ── 設定 ──────────────────────────────────────────────
let _intervalMs = 5000   // デフォルト5秒

// ── 状態 ──────────────────────────────────────────────
let _prevCpuInfo = null
let _cache = {
  cpu: 0, mem: 0, disk: 0,
  uptimeSec: 0, netSend: 0, netRecv: 0,
  stub: false,
}
let _timer = null
let _prevNet = null

// ── CPU（os.cpus() の差分で計算）─────────────────────
function _cpuPercent() {
  const cpus = os.cpus()
  const cur = cpus.reduce((acc, c) => {
    const t = Object.values(c.times).reduce((a, b) => a + b, 0)
    return { idle: acc.idle + c.times.idle, total: acc.total + t }
  }, { idle: 0, total: 0 })

  if (!_prevCpuInfo) { _prevCpuInfo = cur; return 0 }

  const idleDiff  = cur.idle  - _prevCpuInfo.idle
  const totalDiff = cur.total - _prevCpuInfo.total
  _prevCpuInfo = cur

  if (totalDiff === 0) return 0
  return Math.round((1 - idleDiff / totalDiff) * 1000) / 10
}

// ── メモリ（os.freemem / totalmem）───────────────────
function _memPercent() {
  const total = os.totalmem()
  const free  = os.freemem()
  return Math.round((1 - free / total) * 1000) / 10
}

// ── ネットワーク（os.networkInterfaces は使用量を返さないので差分は省略）
// Electron では net モジュールも使えないため、累計バイト数の差分は
// /proc/net/dev（Linux）か wmic（Windows）が必要。
// 負荷を最優先するため Windows でも取得をスキップし 0 を返す。
function _netStats() {
  return { send: 0, recv: 0 }
}

// ── ディスク（Windows: wmic を5秒キャッシュ）─────────
// ディスクは os モジュールで取れないが変化が少ないので
// 起動時に1回だけ wmic で取得してキャッシュする。
async function _fetchDiskOnce() {
  if (process.platform !== 'win32') return 50
  return new Promise(resolve => {
    require('child_process').exec(
      'wmic logicaldisk where "DeviceID=\'C:\'" get Size,FreeSpace /value',
      { windowsHide: true, timeout: 4000, encoding: 'utf8' },
      (err, stdout) => {
        if (err) { resolve(_cache.disk || 50); return }
        const free = parseInt(stdout.match(/FreeSpace=(\d+)/)?.[1] ?? '0')
        const size = parseInt(stdout.match(/Size=(\d+)/)?.[1] ?? '1')
        resolve(size > 0 ? Math.round((1 - free / size) * 1000) / 10 : 50)
      }
    )
  })
}

// ── メイン更新 ────────────────────────────────────────
function _update() {
  _cache.cpu       = _cpuPercent()
  _cache.mem       = _memPercent()
  _cache.uptimeSec = Math.floor(os.uptime())
  const net        = _netStats()
  _cache.netSend   = net.send
  _cache.netRecv   = net.recv
}

// ── 公開 API ─────────────────────────────────────────
async function init() {
  // ディスクは起動時1回だけ取得
  _cache.disk = await _fetchDiskOnce()

  // 初回実行（CPU差分計算のベースライン）
  _cpuPercent()
  await new Promise(r => setTimeout(r, 200))
  _update()

  // タイマー開始
  if (_timer) clearInterval(_timer)
  _timer = setInterval(_update, _intervalMs)
}

function stop() {
  if (_timer) { clearInterval(_timer); _timer = null }
}

function getStats() {
  return { ..._cache, ok: true }
}

function setInterval_(ms) {
  _intervalMs = Math.max(1000, ms)
  if (_timer) {
    clearInterval(_timer)
    _timer = setInterval(_update, _intervalMs)
  }
}

module.exports = { init, stop, getStats, setInterval: setInterval_ }

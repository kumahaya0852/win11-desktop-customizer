/**
 * electron/native/winapi.js  (bugfix)
 * PowerShell の呼び出し方を -EncodedCommand に変更して
 * 複数行スクリプト・特殊文字の問題を解消。
 */

const { execSync, exec } = require('child_process')
const isWin = process.platform === 'win32'

// ── PowerShell ヘルパー ──────────────────────────────────
// スクリプトを Base64 エンコードして渡す（引数のエスケープ問題を完全回避）
function psEncode(script) {
  return Buffer.from(script, 'utf16le').toString('base64')
}

// PowerShell の進捗/エラーストリームをCLIXML形式で吐かせないための前置き
const PS_PREAMBLE = "$ProgressPreference='SilentlyContinue';$ErrorActionPreference='SilentlyContinue';"

function ps(script) {
  if (!isWin) return ''
  try {
    return execSync(
      `powershell -NoProfile -NonInteractive -EncodedCommand ${psEncode(PS_PREAMBLE + script)}`,
      { windowsHide: true, encoding: 'utf8', timeout: 8000 }
    ).trim()
  } catch (e) {
    throw new Error(e.stderr?.trim() || e.message)
  }
}

function psAsync(script) {
  return new Promise((resolve, reject) => {
    if (!isWin) { resolve(''); return }
    exec(
      `powershell -NoProfile -NonInteractive -EncodedCommand ${psEncode(PS_PREAMBLE + script)}`,
      { windowsHide: true, encoding: 'utf8', timeout: 10000 },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr?.trim() || err.message))
        else resolve(stdout.trim())
      }
    )
  })
}

// JSON を安全にパースする（余分な出力が混じっても最後の { } だけ抽出）
function safeParseJSON(raw) {
  // 最後の JSON オブジェクトまたは配列を抽出
  const objMatch = raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])(?=[^}\]]*$)/)
  if (!objMatch) throw new Error(`No JSON found in: ${raw.slice(0, 100)}`)
  return JSON.parse(objMatch[0])
}

// ── ウィンドウ列挙 ────────────────────────────────────────
async function listWindows() {
  if (!isWin) return _stubWindows()
  try {
    const raw = await psAsync(`
      $r = Get-Process | Where-Object { $_.MainWindowTitle -ne '' } |
        Select-Object Id, ProcessName, MainWindowTitle |
        ConvertTo-Json -Compress
      Write-Output $r
    `)
    const items = safeParseJSON(raw)
    const arr = Array.isArray(items) ? items : [items]
    return arr.map(p => ({
      hwnd:    '0x' + (p.Id || 0).toString(16),
      pid:     p.Id,
      process: (p.ProcessName || '') + '.exe',
      title:   p.MainWindowTitle || '',
    }))
  } catch (err) {
    console.error('[winapi] listWindows error:', err.message)
    return _stubWindows()
  }
}

function _stubWindows() {
  return [
    { hwnd: '0x0001', pid: 1, process: 'notepad.exe',  title: 'メモ帳 (stub)' },
    { hwnd: '0x0002', pid: 2, process: 'explorer.exe', title: 'エクスプローラー (stub)' },
  ]
}

// ── ウィンドウ操作 ────────────────────────────────────────
async function setWindowRect(pid, x, y, w, h) {
  if (!isWin) return { ok: true, stub: true }
  try {
    ps(`
      Add-Type @"
      using System;using System.Runtime.InteropServices;
      public class WinHelper {
        [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr i,int x,int y,int cx,int cy,uint f);
        [DllImport("user32.dll")] public static extern IntPtr FindWindowEx(IntPtr p,IntPtr c,string cl,string t);
      }
"@
      $procs = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
      if($procs){ [WinHelper]::SetWindowPos($procs.MainWindowHandle,[IntPtr]::Zero,${x},${y},${w},${h},0x0040) }
    `)
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
}

async function setAlwaysOnTop(pid, onTop) {
  if (!isWin) return { ok: true, stub: true }
  try {
    const hwndInsert = onTop ? '-1' : '-2'
    ps(`
      $p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
      if($p){ 
        Add-Type @"
        using System;using System.Runtime.InteropServices;
        public class WH2{[DllImport("user32.dll")]public static extern bool SetWindowPos(IntPtr h,IntPtr i,int x,int y,int cx,int cy,uint f);}
"@
        [WH2]::SetWindowPos($p.MainWindowHandle,[IntPtr]${hwndInsert},0,0,0,0,0x0003)
      }
    `)
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
}

async function setWindowOpacity(pid, opacity) {
  if (!isWin) return { ok: true, stub: true }
  try {
    ps(`
      $p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
      if($p){
        Add-Type @"
        using System;using System.Runtime.InteropServices;
        public class WH3{
          [DllImport("user32.dll")]public static extern int SetWindowLong(IntPtr h,int i,int v);
          [DllImport("user32.dll")]public static extern int GetWindowLong(IntPtr h,int i);
          [DllImport("user32.dll")]public static extern bool SetLayeredWindowAttributes(IntPtr h,uint c,byte a,uint f);
        }
"@
        $hwnd=$p.MainWindowHandle
        $cur=[WH3]::GetWindowLong($hwnd,-20)
        [WH3]::SetWindowLong($hwnd,-20,$cur -bor 0x80000)
        [WH3]::SetLayeredWindowAttributes($hwnd,0,${opacity},2)
      }
    `)
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
}

// ── システム統計 ──────────────────────────────────────────
async function getSystemStats() {
  if (!isWin) return _fakeStats()
  try {
    const raw = await psAsync(`
      $cpu  = [int](Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
      $os   = Get-CimInstance Win32_OperatingSystem
      $memPct = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize * 100, 1)
      $drv  = Get-PSDrive C
      $diskPct = [math]::Round($drv.Used / ($drv.Used + $drv.Free) * 100, 1)
      $upSec = [int]((Get-Date) - $os.LastBootUpTime).TotalSeconds
      Write-Output ("{""cpu"":$cpu,""mem"":$memPct,""disk"":$diskPct,""uptimeSec"":$upSec}")
    `)
    // Write-Output で直接 JSON 文字列を出力しているので安全にパース
    const match = raw.match(/\{[^}]+\}/)
    if (!match) throw new Error('No JSON in output')
    return { ok: true, ...JSON.parse(match[0]) }
  } catch (err) {
    console.error('[winapi] getSystemStats error:', err.message)
    return _fakeStats()
  }
}

function _fakeStats() {
  return {
    ok: true, stub: true,
    cpu:       Math.round(15 + Math.random() * 35),
    mem:       Math.round(40 + Math.random() * 25),
    disk:      Math.round(55 + Math.random() * 10),
    uptimeSec: Math.floor(Date.now() / 1000) % 86400,
  }
}

// ── 壁紙 ─────────────────────────────────────────────────
async function setWallpaper(filePath, style = 'fill') {
  if (!isWin) return { ok: true, stub: true }
  const styleMap = { fill: 10, fit: 6, stretch: 2, tile: 0, center: 0 }
  const tileVal  = style === 'tile' ? 1 : 0
  const fitVal   = styleMap[style] ?? 10
  try {
    ps(`
      Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name WallpaperStyle -Value ${fitVal}
      Set-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name TileWallpaper   -Value ${tileVal}
      Add-Type @"
      using System;using System.Runtime.InteropServices;
      public class Wallpaper{[DllImport("user32.dll",CharSet=CharSet.Auto)]public static extern int SystemParametersInfo(int a,int b,string c,int d);}
"@
      [Wallpaper]::SystemParametersInfo(20,0,'${filePath.replace(/\\/g, '\\\\')}',3)
    `)
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
}

async function getWallpaper() {
  if (!isWin) return { ok: true, path: null, stub: true }
  try {
    const p = ps(`(Get-ItemProperty 'HKCU:\\Control Panel\\Desktop').Wallpaper`)
    return { ok: true, path: p }
  } catch (e) { return { ok: false, error: e.message } }
}

// ── タスクバー ────────────────────────────────────────────
async function setTaskbarStyle(style) {
  if (!isWin) return { ok: true, stub: true }
  try {
    if (style === 'transparent' || style === 'blur') {
      ps(`Set-ItemProperty -Path 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced' -Name TaskbarAcrylicOpacity -Value 0`)
    }
    return { ok: true }
  } catch (e) { return { ok: false, error: e.message } }
}

module.exports = {
  listWindows,
  setWindowRect,
  setAlwaysOnTop,
  setWindowOpacity,
  getSystemStats,
  setWallpaper,
  getWallpaper,
  setTaskbarStyle,
}

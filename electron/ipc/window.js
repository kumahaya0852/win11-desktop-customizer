/**
 * ipc/window.js  (Phase 4)
 * ウィンドウ操作 IPC — winapi.js に委譲する
 */
const winapi  = require('../native/winapi')
const store   = require('../store')
const sysmon  = require('../native/sysmon')

function register(ipcMain) {

  // 実行中ウィンドウ一覧（PowerShell / スタブ）
  ipcMain.handle('window:listAll', async () => {
    return winapi.listWindows()
  })

  // ルール保存
  ipcMain.handle('window:setRule', async (_, rule) => {
    if (!rule?.id) return { ok: false, error: 'rule.id required' }
    const rules = store.get('window.rules') ?? []
    const idx = rules.findIndex(r => r.id === rule.id)
    if (idx >= 0) rules[idx] = rule
    else rules.push(rule)
    store.set('window.rules', rules)
    return { ok: true }
  })

  // ルール一覧
  ipcMain.handle('window:getRules', async () => {
    return store.get('window.rules') ?? []
  })

  // ルール削除
  ipcMain.handle('window:deleteRule', async (_, id) => {
    const rules = (store.get('window.rules') ?? []).filter(r => r.id !== id)
    store.set('window.rules', rules)
    return { ok: true }
  })

  // ルールをウィンドウに即時適用
  ipcMain.handle('window:applyRule', async (_, rule) => {
    const wins = await winapi.listWindows()
    const targets = wins.filter(w => matchWindow(w, rule))
    const results = []
    for (const w of targets) {
      if (rule.action.position || rule.action.size) {
        const r = await winapi.setWindowRect(
          w.pid,
          rule.action.position?.x ?? 0,
          rule.action.position?.y ?? 0,
          rule.action.size?.w ?? 800,
          rule.action.size?.h ?? 600
        )
        results.push(r)
      }
      if (rule.action.alwaysOnTop !== undefined) {
        results.push(await winapi.setAlwaysOnTop(w.pid, rule.action.alwaysOnTop))
      }
      if (rule.action.opacity !== undefined) {
        results.push(await winapi.setWindowOpacity(w.pid, rule.action.opacity))
      }
    }
    return { ok: true, applied: targets.length, results }
  })

  // システム統計（キャッシュから即座に返す）
  ipcMain.handle('system:stats', () => {
    return sysmon.getStats()
  })

  // 更新間隔変更（ms単位、最小1000）
  ipcMain.handle('system:setInterval', (_, ms) => {
    sysmon.setInterval(ms)
    return { ok: true, ms }
  })

  // タスクバースタイル
  ipcMain.handle('taskbar:setStyle', async (_, style) => {
    return winapi.setTaskbarStyle(style)
  })

  // 壁紙
  ipcMain.handle('wallpaper:setFull', async (_, filePath, style) => {
    return winapi.setWallpaper(filePath, style)
  })
  ipcMain.handle('wallpaper:get', async () => {
    return winapi.getWallpaper()
  })
}

// マッチング判定
function matchWindow(win, rule) {
  const { matchType, matchValue } = rule
  if (!matchValue) return false
  const v = matchValue.toLowerCase()
  switch (matchType) {
    case 'process': return win.process?.toLowerCase().includes(v)
    case 'title':   return win.title?.toLowerCase().includes(v)
    default:        return false
  }
}

module.exports = { register }

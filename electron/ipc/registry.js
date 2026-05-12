/**
 * ipc/registry.js
 * Windows レジストリの読み書き IPC ハンドラー
 * winreg パッケージを使用。Windows 以外では全スタブ。
 */

const isWin = process.platform === 'win32'

function register(ipcMain) {

  ipcMain.handle('registry:read', async (_, key, name) => {
    if (!isWin) return { ok: true, value: null, stub: true }

    try {
      const Registry = require('winreg')
      const regKey = new Registry({ hive: Registry.HKCU, key })
      return await new Promise((resolve) => {
        regKey.get(name, (err, item) => {
          if (err) resolve({ ok: false, error: err.message })
          else resolve({ ok: true, value: item.value, type: item.type })
        })
      })
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('registry:write', async (_, key, name, value) => {
    if (!isWin) return { ok: true, stub: true }

    try {
      const Registry = require('winreg')
      const regKey = new Registry({ hive: Registry.HKCU, key })
      return await new Promise((resolve) => {
        regKey.set(name, Registry.REG_SZ, String(value), (err) => {
          if (err) resolve({ ok: false, error: err.message })
          else resolve({ ok: true })
        })
      })
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })
}

module.exports = { register }

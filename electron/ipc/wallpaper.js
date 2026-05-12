/**
 * ipc/wallpaper.js
 * ★ 修正: wallpaper:get / wallpaper:set は window.js (winapi経由) に統合済み。
 *         ここでは重複登録しない。
 *         wallpaper:setLegacy だけ残す（旧互換用、未使用なら呼ばれない）
 */
function register(ipcMain) {
  // 壁紙IPCは electron/ipc/window.js 内の winapi 経由で処理する。
  // 重複登録を防ぐためここでは何も登録しない。
}

module.exports = { register }

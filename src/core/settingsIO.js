/**
 * core/settingsIO.js
 * 設定の JSON エクスポート / インポート。
 * ファイル選択ダイアログは Electron の dialog API or <input type="file"> で行う。
 */
import configStore from './configStore'
import themeEngine from './themeEngine'
import bus, { EVENTS } from './eventBus'

const EXPORT_KEYS = [
  'theme.active',
  'widgets.layout',
  'window.rules',
  'plugins.enabled',
]

/** 現在の全設定を JSON 文字列として返す */
export async function exportSettings() {
  const data = { version: '1', exportedAt: new Date().toISOString() }
  for (const key of EXPORT_KEYS) {
    data[key] = await configStore.get(key)
  }
  return JSON.stringify(data, null, 2)
}

/** JSON 文字列を検証してインポート。エラー時は例外を throw */
export async function importSettings(jsonStr) {
  let data
  try { data = JSON.parse(jsonStr) }
  catch { throw new Error('JSON の解析に失敗しました') }

  if (!data.version) throw new Error('バージョン情報がありません')

  for (const key of EXPORT_KEYS) {
    if (key in data) await configStore.set(key, data[key])
  }

  // テーマを即時反映
  const theme = await configStore.get('theme.active')
  if (theme) await themeEngine.applyTheme(theme)

  bus.emit('settings:imported', data)
  return data
}

/** すべての設定をデフォルトにリセット */
export async function resetAllSettings() {
  for (const key of EXPORT_KEYS) {
    await configStore.remove(key)
  }
  await configStore.initDefaults()
  const theme = await configStore.get('theme.active')
  if (theme) await themeEngine.applyTheme(theme)
  bus.emit('settings:reset')
}

/** ブラウザの <a download> を使ってファイルとして保存する */
export function downloadJSON(jsonStr, filename = 'win11-customizer-settings.json') {
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** <input type="file"> でファイルを選ばせてテキストを返す */
export function pickJSONFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type  = 'file'
    input.accept = '.json,application/json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return reject(new Error('キャンセルされました'))
      const reader = new FileReader()
      reader.onload = e => resolve(e.target.result)
      reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'))
      reader.readAsText(file)
    }
    input.click()
  })
}

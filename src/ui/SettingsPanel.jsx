import { useState } from 'react'
import { exportSettings, importSettings, resetAllSettings, downloadJSON, pickJSONFile } from '../core/settingsIO'
import styles from './Panel.module.css'
import sStyles from './SettingsPanel.module.css'

export default function SettingsPanel() {
  const [status, setStatus]   = useState(null)
  const [confirm, setConfirm] = useState(false)

  function flash(type, msg) {
    setStatus({ type, msg })
    setTimeout(() => setStatus(null), 3000)
  }

  async function handleExport() {
    try {
      const json = await exportSettings()
      downloadJSON(json)
      flash('ok', '設定をエクスポートしました')
    } catch (e) { flash('err', `エクスポート失敗: ${e.message}`) }
  }

  async function handleImport() {
    try {
      const jsonStr = await pickJSONFile()
      await importSettings(jsonStr)
      flash('ok', '設定をインポートしました。テーマが反映されます。')
    } catch (e) {
      if (e.message !== 'キャンセルされました') flash('err', `インポート失敗: ${e.message}`)
    }
  }

  async function handleReset() {
    try {
      await resetAllSettings()
      setConfirm(false)
      flash('ok', 'すべての設定をリセットしました')
    } catch (e) { flash('err', `リセット失敗: ${e.message}`) }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h1 className={styles.title}>設定</h1>
        <p className={styles.sub}>アプリ全体の設定管理・バックアップ・リストアを行います。</p>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>バックアップ</h2>
        <div className={sStyles.card}>
          <div className={sStyles.cardInfo}>
            <span className={sStyles.cardIcon}>📤</span>
            <div>
              <div className={sStyles.cardTitle}>設定をエクスポート</div>
              <div className={sStyles.cardDesc}>テーマ・ウィジェット・ウィンドウルール・プラグイン設定を JSON として保存します。</div>
            </div>
          </div>
          <button className={sStyles.actionBtn} onClick={handleExport}>エクスポート</button>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>リストア</h2>
        <div className={sStyles.card}>
          <div className={sStyles.cardInfo}>
            <span className={sStyles.cardIcon}>📥</span>
            <div>
              <div className={sStyles.cardTitle}>設定をインポート</div>
              <div className={sStyles.cardDesc}>エクスポートした JSON ファイルから設定を復元します。現在の設定は上書きされます。</div>
            </div>
          </div>
          <button className={`${sStyles.actionBtn} ${sStyles.secondary}`} onClick={handleImport}>インポート</button>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>アプリ情報</h2>
        <div className={sStyles.infoGrid}>
          {[
            ['バージョン',     '0.1.0 (Phase 3)'],
            ['フレームワーク', 'Electron + React + Vite'],
            ['設定の保存先',   'electron-store (JSON)'],
            ['Phase 4 予定',   'WinAPI 連携・DWM フック'],
            ['Phase 5 予定',   'Plugin API 公開・外部プラグイン'],
          ].map(([l, v]) => (
            <div key={l} className={sStyles.infoRow}>
              <span className={sStyles.infoLabel}>{l}</span>
              <span className={sStyles.infoValue}>{v}</span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle} style={{ color: 'var(--err)' }}>危険な操作</h2>
        <div className={`${sStyles.card} ${sStyles.danger}`}>
          <div className={sStyles.cardInfo}>
            <span className={sStyles.cardIcon}>⚠️</span>
            <div>
              <div className={sStyles.cardTitle}>すべての設定をリセット</div>
              <div className={sStyles.cardDesc}>テーマ・ウィジェット・ルールをすべて初期状態に戻します。この操作は取り消せません。</div>
            </div>
          </div>
          {!confirm ? (
            <button className={`${sStyles.actionBtn} ${sStyles.dangerBtn}`} onClick={() => setConfirm(true)}>リセット</button>
          ) : (
            <div className={sStyles.confirmRow}>
              <span className={sStyles.confirmText}>本当にリセットしますか？</span>
              <button className={`${sStyles.actionBtn} ${sStyles.dangerBtn}`} onClick={handleReset}>はい</button>
              <button className={`${sStyles.actionBtn} ${sStyles.secondary}`} onClick={() => setConfirm(false)}>キャンセル</button>
            </div>
          )}
        </div>
      </section>

      {status && (
        <div className={`${sStyles.toast} ${sStyles[status.type]}`}>{status.msg}</div>
      )}
    </div>
  )
}

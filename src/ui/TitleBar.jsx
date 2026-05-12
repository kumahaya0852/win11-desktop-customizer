import styles from './TitleBar.module.css'

export default function TitleBar({ isElectron }) {
  const minimize = () => window.api?.window.minimize()
  const maximize = () => window.api?.window.maximize()
  const close    = () => window.api?.window.close()

  return (
    <div className={`${styles.bar} drag-region`}>
      <div className={styles.left}>
        <span className={styles.logo}>◈</span>
        <span className={styles.title}>Win11 Customizer</span>
        {!isElectron && (
          <span className={styles.badge}>browser mode</span>
        )}
      </div>

      <div className={`${styles.controls} no-drag`}>
        <button className={styles.btn} onClick={minimize} title="最小化">
          <span className={styles.icon}>─</span>
        </button>
        <button className={styles.btn} onClick={maximize} title="最大化">
          <span className={styles.icon}>□</span>
        </button>
        <button className={`${styles.btn} ${styles.close}`} onClick={close} title="閉じる">
          <span className={styles.icon}>✕</span>
        </button>
      </div>
    </div>
  )
}

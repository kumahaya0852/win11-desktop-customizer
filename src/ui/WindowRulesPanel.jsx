import { useState, useEffect, useCallback } from 'react'
import styles from './Panel.module.css'
import wr from './WindowRulesPanel.module.css'

const MATCH_TYPES = [
  { value: 'process', label: 'プロセス名' },
  { value: 'title',   label: 'ウィンドウタイトル' },
]
const DEFAULT_RULE = {
  id: '', matchType: 'process', matchValue: '',
  action: { position: null, size: null, alwaysOnTop: false, opacity: 255 },
  enabled: true,
}

export default function WindowRulesPanel() {
  const [rules,       setRules]       = useState([])
  const [windows,     setWindows]     = useState([])
  const [editing,     setEditing]     = useState(null)
  const [status,      setStatus]      = useState(null)
  const [loadingWins, setLoadingWins] = useState(false)
  const isElectron = typeof window.api !== 'undefined'

  useEffect(() => {
    if (isElectron) window.api.window.getRules().then(setRules)
  }, [])

  const refreshWindows = useCallback(async () => {
    setLoadingWins(true)
    try {
      const list = isElectron
        ? await window.api.window.listAll()
        : [{ hwnd: '0x001', pid: 1, process: 'notepad.exe', title: 'メモ帳 (stub)' }]
      setWindows(list)
    } finally { setLoadingWins(false) }
  }, [isElectron])

  function flash(type, msg) {
    setStatus({ type, msg })
    setTimeout(() => setStatus(null), 3000)
  }

  async function saveRule(rule) {
    const r = { ...rule, id: rule.id || `rule_${Date.now()}` }
    if (isElectron) await window.api.window.setRule(r)
    setRules(prev => {
      const idx = prev.findIndex(x => x.id === r.id)
      return idx >= 0 ? prev.map(x => x.id === r.id ? r : x) : [...prev, r]
    })
    setEditing(null)
    flash('ok', `ルール "${r.matchValue}" を保存しました`)
  }

  async function deleteRule(id) {
    if (isElectron) await window.api.window.deleteRule(id)
    setRules(prev => prev.filter(r => r.id !== id))
    flash('ok', 'ルールを削除しました')
  }

  async function applyRule(rule) {
    if (!isElectron) { flash('err', 'Electron上でのみ有効です'); return }
    const res = await window.api.window.applyRule(rule)
    flash(res.ok ? 'ok' : 'err',
      res.ok ? `${res.applied}個のウィンドウに適用しました` : `エラー: ${res.error}`)
  }

  // ★ Bug修正: 編集キャンセル時は editing を null に戻すだけ（削除は行わない）
  function handleCancel() {
    setEditing(null)
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h1 className={styles.title}>ウィンドウルール</h1>
        <p className={styles.sub}>アプリごとの位置・サイズ・透明度・常前面を自動設定します。</p>
      </div>

      <section className={styles.section}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h2 className={styles.sectionTitle}>実行中のウィンドウ</h2>
          <button className={wr.smallBtn} onClick={refreshWindows} disabled={loadingWins}>
            {loadingWins ? '取得中...' : '↺ 更新'}
          </button>
        </div>
        {windows.length === 0 ? (
          <div className={wr.emptyHint}>「更新」を押すと実行中のウィンドウが表示されます</div>
        ) : (
          <div className={wr.winList}>
            {windows.map(w => (
              <div key={w.hwnd} className={wr.winItem}>
                <div className={wr.winIcon}>⧉</div>
                <div className={wr.winInfo}>
                  <span className={wr.winTitle}>{w.title}</span>
                  <span className={wr.winProcess}>{w.process}</span>
                </div>
                <button className={wr.smallBtn} onClick={() =>
                  setEditing({ ...DEFAULT_RULE, matchType: 'process', matchValue: w.process.replace('.exe','') })
                }>ルール作成</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h2 className={styles.sectionTitle}>保存済みルール</h2>
          <button className={wr.addBtn} onClick={() => setEditing({ ...DEFAULT_RULE })}>＋ 新規</button>
        </div>
        {rules.length === 0 ? (
          <div className={wr.emptyHint}>ルールはまだありません</div>
        ) : (
          <div className={wr.ruleList}>
            {rules.map(r => (
              <div key={r.id} className={wr.ruleCard}>
                <div className={wr.ruleCardLeft}>
                  <span className={wr.ruleTag}>{MATCH_TYPES.find(t => t.value === r.matchType)?.label}</span>
                  <span className={wr.ruleValue}>{r.matchValue}</span>
                  <div className={wr.ruleActions2}>
                    {r.action.alwaysOnTop  && <span className={wr.pill}>常前面</span>}
                    {r.action.position     && <span className={wr.pill}>位置</span>}
                    {r.action.size         && <span className={wr.pill}>サイズ</span>}
                    {r.action.opacity < 255 && <span className={wr.pill}>透明度 {Math.round(r.action.opacity/255*100)}%</span>}
                  </div>
                </div>
                <div className={wr.ruleCardRight}>
                  <button className={wr.smallBtn} onClick={() => applyRule(r)}>適用</button>
                  <button className={wr.smallBtn} onClick={() => setEditing(r)}>編集</button>
                  <button className={`${wr.smallBtn} ${wr.dangerBtn}`} onClick={() => deleteRule(r.id)}>削除</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {editing && (
        <RuleEditor
          rule={editing}
          onSave={saveRule}
          onCancel={handleCancel}   // ★ Bug修正: キャンセルは閉じるだけ
        />
      )}

      {status && <div className={`${wr.toast} ${wr[status.type]}`}>{status.msg}</div>}
    </div>
  )
}

function RuleEditor({ rule, onSave, onCancel }) {
  const [draft, setDraft] = useState(rule)

  function set(key, val)    { setDraft(p => ({ ...p, [key]: val })) }
  function setAction(k, v)  { setDraft(p => ({ ...p, action: { ...p.action, [k]: v } })) }
  function setPosition(k,v) { setDraft(p => ({ ...p, action: { ...p.action, position: { ...(p.action.position ?? {x:0,y:0}), [k]: Number(v) } } })) }
  function setSize(k,v)     { setDraft(p => ({ ...p, action: { ...p.action, size: { ...(p.action.size ?? {w:800,h:600}), [k]: Number(v) } } })) }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div style={{ background:'var(--bg-panel)', border:'1px solid var(--border-md)', borderRadius:16, padding:28, width:440, display:'flex', flexDirection:'column', gap:20 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <h2 style={{ fontSize:16, fontWeight:500 }}>{draft.id ? 'ルールを編集' : '新しいルール'}</h2>
          {/* ★ Bug修正: ✕ボタンはキャンセルと同じ（削除しない） */}
          <button onClick={onCancel} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:16 }}>✕</button>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <label style={{ fontSize:11, color:'var(--text-secondary)' }}>マッチ条件</label>
          <div style={{ display:'flex', gap:8 }}>
            <select value={draft.matchType} onChange={e => set('matchType', e.target.value)} style={selectStyle}>
              {MATCH_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input type="text" value={draft.matchValue} onChange={e => set('matchValue', e.target.value)}
              placeholder="例: notepad" style={{ ...inputStyle, flex:1 }} />
          </div>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <label style={{ fontSize:11, color:'var(--text-secondary)' }}>アクション</label>
          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer' }}>
            <input type="checkbox" checked={draft.action.alwaysOnTop}
              onChange={e => setAction('alwaysOnTop', e.target.checked)} />
            常前面に表示
          </label>
          <div>
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer', marginBottom:6 }}>
              <input type="checkbox" checked={!!draft.action.position}
                onChange={e => setAction('position', e.target.checked ? {x:0,y:0} : null)} />
              位置を固定
            </label>
            {draft.action.position && (
              <div style={{ display:'flex', gap:8, paddingLeft:20 }}>
                <NumInput label="X" value={draft.action.position.x} onChange={v => setPosition('x',v)} />
                <NumInput label="Y" value={draft.action.position.y} onChange={v => setPosition('y',v)} />
              </div>
            )}
          </div>
          <div>
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer', marginBottom:6 }}>
              <input type="checkbox" checked={!!draft.action.size}
                onChange={e => setAction('size', e.target.checked ? {w:800,h:600} : null)} />
              サイズを固定
            </label>
            {draft.action.size && (
              <div style={{ display:'flex', gap:8, paddingLeft:20 }}>
                <NumInput label="W" value={draft.action.size.w} onChange={v => setSize('w',v)} />
                <NumInput label="H" value={draft.action.size.h} onChange={v => setSize('h',v)} />
              </div>
            )}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <label style={{ fontSize:13, display:'flex', justifyContent:'space-between' }}>
              <span>透明度</span>
              <span style={{ fontFamily:'var(--font-mono)', color:'var(--text-secondary)', fontSize:12 }}>
                {Math.round(draft.action.opacity/255*100)}%
              </span>
            </label>
            <input type="range" min={60} max={255} value={draft.action.opacity}
              onChange={e => setAction('opacity', Number(e.target.value))}
              style={{ accentColor:'var(--accent)', width:'100%' }} />
          </div>
        </div>

        <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
          <button onClick={onCancel} style={cancelBtnStyle}>キャンセル</button>
          <button onClick={() => onSave(draft)} disabled={!draft.matchValue}
            style={{ ...saveBtnStyle, opacity: draft.matchValue ? 1 : 0.4 }}>保存</button>
        </div>
      </div>
    </div>
  )
}

function NumInput({ label, value, onChange }) {
  return (
    <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text-secondary)' }}>
      {label}
      <input type="number" value={value} onChange={e => onChange(e.target.value)}
        style={{ ...inputStyle, width:72 }} />
    </label>
  )
}

const inputStyle = { background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:8, color:'var(--text-primary)', fontSize:13, padding:'7px 10px', fontFamily:'var(--font-ui)' }
const selectStyle = { ...inputStyle, cursor:'pointer', appearance:'auto' }
const saveBtnStyle = { padding:'9px 24px', background:'var(--accent)', color:'#fff', border:'none', borderRadius:10, fontFamily:'var(--font-ui)', fontSize:13, fontWeight:500, cursor:'pointer' }
const cancelBtnStyle = { padding:'9px 18px', background:'transparent', color:'var(--text-secondary)', border:'1px solid var(--border-md)', borderRadius:10, fontFamily:'var(--font-ui)', fontSize:13, cursor:'pointer' }

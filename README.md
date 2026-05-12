# Win11 Desktop Customizer

Linux (KDE/GNOME) スタイルのデスクトップカスタマイザーを Windows 11 上で実現する Electron アプリ。

## 技術スタック

- **UI**: React 18 + Vite
- **Shell**: Electron 28
- **プロセス間通信**: Electron IPC (contextIsolation 有効)
- **設定永続化**: localStorage (Phase 1) → electron-store (Phase 2)
- **Windows 連携**: winreg / node-wallpaper / node-ffi-napi (Phase 4)

## セットアップ

```bash
npm install
npm run dev        # 開発サーバー起動 (React + Electron 同時)
```

## ビルド

```bash
npm run build      # Windows インストーラー生成
```

## フェーズロードマップ

| Phase | 内容 |
|---|---|
| 1 ✅ | Electron スケルトン + IPC 疎通 + React UI 基盤 |
| 2 | Core: configStore (electron-store) + EventBus + ThemeEngine 完成 |
| 3 | Widget Canvas: ドラッグ配置 + 標準ウィジェット |
| 4 | Windows 統合: 壁紙 / タスクバー / DWM / node-ffi |
| 5 | Plugin API: PluginHost + サンドボックス + 外部プラグイン |

## ディレクトリ構成

```
├── electron/
│   ├── main.js         # Electron メインプロセス
│   ├── preload.js      # contextBridge による安全な IPC 公開
│   └── ipc/            # IPC ハンドラー群
│       ├── window.js
│       ├── registry.js
│       ├── wallpaper.js
│       └── theme.js
├── src/
│   ├── core/           # アプリコア (EventBus / ConfigStore / ThemeEngine)
│   ├── plugins/        # Plugin API ホスト
│   ├── widgets/        # ウィジェットシステム
│   └── ui/             # React UI コンポーネント
├── config/
│   └── themes/         # テーマ JSON ファイル
└── plugins-external/   # サードパーティプラグイン置き場
```

## Plugin API (Phase 5 以降)

```js
// plugins-external/my-plugin/index.js
export default {
  name: 'my-plugin',
  version: '1.0.0',
  onLoad(api) {
    api.widgets.register({ id: 'my-clock', component: () => import('./Clock.jsx') })
    api.theme.override({ accentColor: '#ff6b6b' })
    api.events.on('theme:changed', (theme) => console.log(theme))
  },
  onUnload() {}
}
```

## .exe ビルド手順

```powershell
# 依存パッケージインストール
npm install

# Windows インストーラー（.exe）を生成
npm run build:win
```

`dist-electron/` フォルダに以下が生成されます：
- `Win11 Desktop Customizer Setup 0.1.0.exe` — インストーラー

インストール後はスタートメニュー・デスクトップショートカットから起動できます。

### ビルド時の注意
- `assets/icon.ico` が必要（同梱済み）
- node_modules が揃っている状態でビルドすること
- 管理者権限は不要（asInvoker 設定）

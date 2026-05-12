# 外部プラグイン開発ガイド

## フォルダ構成

```
plugins-external/
  my-plugin/
    plugin.json   ← 必須: プラグイン情報
    index.js      ← 必須: エントリーポイント
    Widget.js     ← 任意: ウィジェットコンポーネント
```

## plugin.json

```json
{
  "id":          "my-plugin",
  "name":        "マイプラグイン",
  "version":     "1.0.0",
  "author":      "あなたの名前",
  "icon":        "⭐",
  "tags":        ["widget", "custom"],
  "description": "プラグインの説明文"
}
```

## index.js

```js
module.exports = {
  onLoad(api) {
    // ── ウィジェット登録 ──────────────────────────
    api.widgets.register({
      id:          'my-widget',
      name:        'マイウィジェット',
      icon:        '⭐',
      defaultSize: { w: 220, h: 120 },
      minSize:     { w: 160, h: 80 },
      component:   () => Promise.resolve({ default: MyWidget }),
    })

    // ── テーマ変更を購読 ──────────────────────────
    api.theme.onChanged(theme => {
      api.log('テーマ変更:', theme.name)
    })

    // ── 設定の読み書き ────────────────────────────
    api.config.get('count').then(n => {
      api.config.set('count', (n ?? 0) + 1)
    })

    // ── ログ ──────────────────────────────────────
    api.log('ロード完了!')
  },

  onUnload() {
    // クリーンアップ処理
  },
}

function MyWidget() {
  const { createElement: h } = require('react')
  return h('div', {
    style: { padding: 16, color: 'var(--text-primary)' }
  }, 'Hello from MyWidget!')
}
```

## Plugin API リファレンス

| API | 説明 |
|-----|------|
| `api.widgets.register(def)` | ウィジェットを登録 |
| `api.widgets.unregister(id)` | ウィジェットを解除 |
| `api.theme.override(patch)` | CSS変数を部分上書き |
| `api.theme.onChanged(fn)` | テーマ変更を購読 |
| `api.events.on(ch, fn)` | EventBus を購読 |
| `api.events.emit(ch, data)` | EventBus に送信 |
| `api.config.get(key)` | 設定読み取り (async) |
| `api.config.set(key, val)` | 設定書き込み (async) |
| `api.log(...args)` | コンソールログ |

## ホットリロード

`index.js` または `plugin.json` を保存すると自動でリロードされます（chokidar監視）。

## 注意事項

- `index.js` は **CommonJS** 形式（`require` / `module.exports`）で書いてください
- JSX は使えません。`React.createElement` を使ってください
- `require('react')` は Electron 環境では利用可能です

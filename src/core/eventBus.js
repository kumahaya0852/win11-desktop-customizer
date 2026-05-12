/**
 * core/eventBus.js
 * アプリ全体の pub/sub バス。
 * React のコンポーネント間、plugin → UI 間の通信に使う。
 */
import EventEmitter from 'eventemitter3'

const bus = new EventEmitter()

// 型ヒント用のチャンネル定数
export const EVENTS = {
  THEME_CHANGED:   'theme:changed',
  WIDGET_ADDED:    'widget:added',
  WIDGET_REMOVED:  'widget:removed',
  WIDGET_UPDATED:  'widget:updated',
  PLUGIN_LOADED:   'plugin:loaded',
  PLUGIN_UNLOADED: 'plugin:unloaded',
  PLUGIN_ERROR:    'plugin:error',
  WINDOW_RULE_SET: 'window:ruleSet',
  SETTINGS_SAVED:  'settings:saved',
}

export default bus

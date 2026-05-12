const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {

  store: {
    get:    (key)        => ipcRenderer.invoke('store:get', key),
    set:    (key, value) => ipcRenderer.invoke('store:set', key, value),
    delete: (key)        => ipcRenderer.invoke('store:delete', key),
    getAll: ()           => ipcRenderer.invoke('store:getAll'),
  },

  // メインウィンドウコントロール
  window: {
    minimize:        ()        => ipcRenderer.invoke('window:minimize'),
    maximize:        ()        => ipcRenderer.invoke('window:maximize'),
    close:           ()        => ipcRenderer.invoke('window:close'),
    openDetail:      ()        => ipcRenderer.invoke('window:openDetail'),
    closeDetail:     ()        => ipcRenderer.invoke('window:closeDetail'),
    setClickThrough: (enabled) => ipcRenderer.invoke('window:setClickThrough', enabled),
    setEditLayout:   (enabled) => ipcRenderer.invoke('window:setEditLayout', enabled),
    listAll:         ()        => ipcRenderer.invoke('window:listAll'),
    setRule:         (rule)    => ipcRenderer.invoke('window:setRule', rule),
    getRules:        ()        => ipcRenderer.invoke('window:getRules'),
    deleteRule:      (id)      => ipcRenderer.invoke('window:deleteRule', id),
    applyRule:       (rule)    => ipcRenderer.invoke('window:applyRule', rule),
  },

  // ★ Bug6修正: 詳細ウィンドウ専用コントロール
  detail: {
    minimize: () => ipcRenderer.invoke('detail:minimize'),
    maximize: () => ipcRenderer.invoke('detail:maximize'),
    close:    () => ipcRenderer.invoke('detail:close'),
  },

  system: {
    stats:       ()   => ipcRenderer.invoke('system:stats'),
    setInterval: (ms) => ipcRenderer.invoke('system:setInterval', ms),
  },
  taskbar: { setStyle: (s) => ipcRenderer.invoke('taskbar:setStyle', s) },

  theme: {
    apply:     (t) => ipcRenderer.invoke('theme:apply', t),
    getActive: ()  => ipcRenderer.invoke('theme:getActive'),
    list:      ()  => ipcRenderer.invoke('theme:list'),
    save:      (t) => ipcRenderer.invoke('theme:save', t),
  },

  wallpaper: {
    set: (fp, s) => ipcRenderer.invoke('wallpaper:setFull', fp, s),
    get: ()      => ipcRenderer.invoke('wallpaper:get'),
  },

  registry: {
    read:  (k, n)    => ipcRenderer.invoke('registry:read', k, n),
    write: (k, n, v) => ipcRenderer.invoke('registry:write', k, n, v),
  },

  widgets: {
    syncAll:      (widgets) => ipcRenderer.invoke('widgets:syncAll', widgets),
    update:       (widget)  => ipcRenderer.invoke('widgets:update', widget),
    remove:       (id)      => ipcRenderer.invoke('widgets:remove', id),
    setEditMode:  (enabled) => ipcRenderer.invoke('widgets:setEditMode', enabled),
    destroyAll:   ()        => ipcRenderer.invoke('widgets:destroyAll'),
    isAnyVisible: ()             => ipcRenderer.invoke('widgets:isAnyVisible'),
    setPosition:  (id, x, y)    => ipcRenderer.invoke('widgets:setPosition', { id, x, y }),
    // ★ Bug1修正: リサイズ IPC
    resize:       (id, w, h) => ipcRenderer.invoke('widgets:resize', { id, w, h }),
    // ★ Bug4修正: moved 通知
    notifyMoved:  (payload) => ipcRenderer.send('widget:moved', payload),
    notifyResized:(payload) => ipcRenderer.send('widget:resized', payload),
  },

  overlay: {
    show:        ()        => ipcRenderer.invoke('overlay:show'),
    hide:        ()        => ipcRenderer.invoke('overlay:hide'),
    isVisible:   ()        => ipcRenderer.invoke('overlay:isVisible'),
    setEditMode: (e)       => ipcRenderer.invoke('overlay:setEditMode', e),
    syncWidgets: (l)       => ipcRenderer.invoke('overlay:syncWidgets', l),
    setLevel:    (l)       => ipcRenderer.invoke('overlay:setLevel', l),
    getLevel:    ()        => ipcRenderer.invoke('overlay:getLevel'),
    notifyMoved: (payload) => ipcRenderer.send('widget:moved', payload),
  },

  plugins: {
    list:       ()   => ipcRenderer.invoke('plugins:list'),
    load:       (id) => ipcRenderer.invoke('plugins:load', id),
    rescan:     ()   => ipcRenderer.invoke('plugins:rescan'),
    openFolder: ()   => ipcRenderer.invoke('plugins:openFolder'),
  },

  app: {
    version:  () => ipcRenderer.invoke('app:version'),
    platform: () => ipcRenderer.invoke('app:platform'),
    workArea: () => ipcRenderer.invoke('app:workArea'),
  },

  on: (channel, callback) => {
    const allowed = [
      'theme:changed', 'window:focused',
      'plugin:loaded', 'plugin:error', 'widget:sync',
      'overlay:editMode', 'overlay:syncWidgets',
      'overlay:widgetMoved', 'overlay:levelChanged',
      'widget:editMode',
      'widget:resized',
      'overlay:widgetResized',
    ]
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_, ...args) => callback(...args))
    }
  },
  off: (channel, callback) => ipcRenderer.removeListener(channel, callback),
})

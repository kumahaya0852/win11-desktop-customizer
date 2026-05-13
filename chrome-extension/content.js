/**
 * content.js — YouTubeページに挿入されるスクリプト
 * 動画IDが変わるたびに Electron のローカルサーバーに送信する
 */
const ENDPOINT = 'http://localhost:27384/yt-thumb'

function getVideoId() {
  return new URLSearchParams(window.location.search).get('v')
}

function sendVideoId(videoId) {
  if (!videoId) return
  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoId }),
  }).catch(() => {}) // Electronが起動していない場合は無視
}

// 初回送信
let lastId = null
function checkAndSend() {
  const id = getVideoId()
  if (id && id !== lastId) {
    lastId = id
    sendVideoId(id)
  }
}

checkAndSend()

// YouTubeはSPAなのでpushState/popStateも監視
const origPushState = history.pushState.bind(history)
history.pushState = (...args) => {
  origPushState(...args)
  setTimeout(checkAndSend, 200)
}
window.addEventListener('popstate', () => setTimeout(checkAndSend, 200))

// DOMの変化も監視（ページ内遷移の念のため）
const observer = new MutationObserver(checkAndSend)
observer.observe(document, { subtree: true, childList: true })

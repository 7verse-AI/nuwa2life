/**
 * 7verse.ai Google OAuth — starts a local bridge server,
 * opens the browser, then waits for the user to paste their token.
 *
 * Why manual paste: 7verse uses HttpOnly cookies, so JS can't
 * auto-capture after OAuth redirect. The bridge page walks the user
 * through DevTools → copy → paste in ~15 seconds.
 */
import { createServer } from 'http'
import { getConfigValue, saveConfig, loadConfig } from './config.js'
import https from 'https'

const SEVENVERSE_BASE = () => getConfigValue('sevenverseBase') || 'https://uat.7verse.ai'
const CALLBACK_PORT  = 54321

const BRIDGE_HTML = (base) => `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<title>7verse.ai 登录成功</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0 }
  body { font: 15px/1.6 -apple-system,sans-serif; background:#f9f9f9; color:#1a1a1a; }
  .card { max-width:520px; margin:64px auto; background:#fff; border-radius:12px; padding:32px; box-shadow:0 2px 16px rgba(0,0,0,.08); }
  h1 { font-size:20px; margin-bottom:4px }
  .sub { color:#666; font-size:13px; margin-bottom:24px }
  .step { display:flex; gap:12px; align-items:flex-start; padding:12px 0; border-bottom:1px solid #f0f0f0 }
  .step:last-child { border:0 }
  .num { width:24px;height:24px;background:#000;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;margin-top:1px }
  .step p { font-size:14px }
  code { background:#f0f0f0;padding:1px 5px;border-radius:4px;font-size:12px;font-family:monospace }
  .tip { margin-top:20px;background:#fffbe6;border-left:3px solid #f5a623;padding:10px 14px;border-radius:4px;font-size:13px;color:#555 }
</style>
</head>
<body>
<div class="card">
  <h1>✅ Google 登录成功</h1>
  <p class="sub">现在需要复制 Token，整个过程约 15 秒</p>
  <div class="step"><div class="num">1</div><p>按 <code>Cmd+Option+I</code>（Mac）或 <code>F12</code>（Windows）打开开发者工具</p></div>
  <div class="step"><div class="num">2</div><p>点击顶部标签 <code>Application</code>（Chrome）或 <code>Storage</code>（Firefox）</p></div>
  <div class="step"><div class="num">3</div><p>左侧展开 <code>Cookies</code> → 点击 <code>${base}</code></p></div>
  <div class="step"><div class="num">4</div><p>找到 <code>access_token_uat</code> 这一行，双击 <strong>Value</strong> 列，全选复制</p></div>
  <div class="step"><div class="num">5</div><p>切回终端，粘贴到提示符处，按回车</p></div>
  <div class="tip">Token 只保存在你本地，不会上传任何地方。有效期约 7–30 天，过期后再次运行 <code>nuwa2life login</code> 即可。</div>
</div>
</body>
</html>`

function startBridgeServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const base = SEVENVERSE_BASE()
      const html = BRIDGE_HTML(base)
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
    })
    server.listen(CALLBACK_PORT, '127.0.0.1', () => resolve(server))
    server.on('error', () => resolve(null)) // port in use — ignore, still open bridge URL
  })
}

export async function verifyToken(token) {
  return new Promise((resolve) => {
    const base = SEVENVERSE_BASE().replace('https://', '')
    const req = https.request(
      { hostname: base, path: '/api/v1/auth/verify', method: 'POST',
        headers: { 'Cookie': `access_token_uat=${token}`, 'Content-Type': 'application/json' } },
      (res) => {
        let body = ''
        res.on('data', (d) => body += d)
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body)
            resolve(res.statusCode === 200 && !parsed.error)
          } catch { resolve(res.statusCode === 200) }
        })
      }
    )
    req.on('error', () => resolve(false))
    req.setTimeout(8000, () => { req.destroy(); resolve(false) })
    req.end('{}')
  })
}

export function getCachedToken() {
  const cfg = loadConfig()
  return cfg.sevenverseToken || null
}

export function saveToken(token) {
  saveConfig({ sevenverseToken: token, tokenSavedAt: new Date().toISOString() })
}

export async function isCachedTokenValid() {
  const token = getCachedToken()
  if (!token) return false
  return verifyToken(token)
}

/**
 * Full OAuth flow — opens browser → bridge page → user pastes token.
 * Returns the token string.
 */
export async function oauthFlow(readline) {
  const server = await startBridgeServer()

  const base = SEVENVERSE_BASE()
  const loginUrl = `${base}/api/v1/auth/google/web/login/start?redirect=http://127.0.0.1:${CALLBACK_PORT}/bridge`

  const { default: open } = await import('open')
  await open(loginUrl)

  if (server) {
    // Give server a few seconds then shut down (user is on bridge page now)
    setTimeout(() => server.close(), 30_000)
  }

  // readline is passed in from the command (clack or raw readline)
  // so we can prompt in the correct context
  return readline()
}

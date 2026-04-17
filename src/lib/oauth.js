/**
 * 7verse.ai OAuth — two modes, same UX entry point:
 *
 * Mode A (automatic, requires backend support):
 *   CLI starts local server on 127.0.0.1:PORT →
 *   browser opens 7verse login with ?redirect=http://127.0.0.1:PORT/callback →
 *   backend redirects to /callback?token=XXX after Google login →
 *   CLI captures token, browser shows "登录成功，可关闭此窗口" →
 *   terminal continues automatically. Zero manual steps.
 *
 * Mode B (manual fallback, no backend change needed):
 *   Opens browser to 7verse.ai → user logs in → terminal shows a simple
 *   one-step instruction: go to a URL that displays the token in plain text.
 *   Requires backend to expose GET /api/v1/auth/cli/token (reads cookie,
 *   returns {"token":"..."} in response body — not in a cookie).
 *
 * Current status: Mode A blocked because backend rejects 127.0.0.1 redirect.
 * Backend changes needed (see BACKEND_CHANGES.md):
 *   1. Allowlist 127.0.0.1 as redirect host (RFC 8252 §7.3)
 *   2. Include token in redirect URL: /callback?token=ACCESS_TOKEN_VALUE
 *
 * Until then: best we can do without DevTools is Mode B.
 */
import { createServer } from 'http'
import https from 'https'
import { getConfigValue, saveConfig, loadConfig } from './config.js'

const SEVENVERSE_BASE = () =>
  (getConfigValue('sevenverseBase') || 'https://7verse.ai').replace(/\/+$/, '')

// ── Token storage ─────────────────────────────────────────────────────────────

export function getCachedToken() {
  return (loadConfig().sevenverseToken || '').trim() || null
}

export function saveToken(token) {
  saveConfig({ sevenverseToken: token, tokenSavedAt: new Date().toISOString() })
}

export async function isCachedTokenValid() {
  const token = getCachedToken()
  return token ? verifyToken(token) : false
}

// ── Token verification ────────────────────────────────────────────────────────

export async function verifyToken(token) {
  const host = SEVENVERSE_BASE().replace(/^https?:\/\//, '')
  return new Promise((resolve) => {
    const req = https.request({
      hostname: host, path: '/api/v1/auth/verify', method: 'POST',
      headers: { Cookie: `${host.includes('uat.') ? 'access_token_uat' : 'access_token'}=${token}`, 'Content-Type': 'application/json' },
    }, (res) => {
      let body = ''
      res.on('data', d => body += d)
      res.on('end', () => {
        try { resolve(res.statusCode === 200 && !JSON.parse(body).error) }
        catch { resolve(res.statusCode === 200) }
      })
    })
    req.on('error', () => resolve(false))
    req.setTimeout(8000, () => { req.destroy(); resolve(false) })
    req.end('{}')
  })
}

// ── Mode A: automatic callback (needs backend allowlist) ──────────────────────

const CALLBACK_PORT = 54321

const SUCCESS_HTML = `<!DOCTYPE html>
<html lang="zh">
<head><meta charset="UTF-8"><title>登录成功</title>
<style>
  body{font:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f0fdf4}
  .card{text-align:center;padding:40px;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  h1{font-size:48px;margin:0 0 12px}p{color:#555;font-size:16px;margin:0}
</style></head>
<body><div class="card"><h1>✅</h1><p>登录成功，可以关闭此窗口了</p></div></body>
</html>`

const WAITING_HTML = `<!DOCTYPE html>
<html lang="zh">
<head><meta charset="UTF-8"><title>正在登录</title>
<style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5}.card{text-align:center;padding:40px}</style>
</head><body><div class="card"><p style="font-size:18px;color:#555">正在处理登录，请稍候…</p></div></body></html>`

/**
 * Start local callback server.
 * Returns a promise that resolves with the token when /callback?token=XXX is hit.
 * Also accepts /callback?access_token=XXX or /callback?code=XXX (adapts to backend naming).
 */
export function waitForCallback() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${CALLBACK_PORT}`)

      if (url.pathname === '/callback') {
        const token =
          url.searchParams.get('token') ||
          url.searchParams.get('access_token') ||
          url.searchParams.get('code') || ''

        if (token) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(SUCCESS_HTML)
          server.close()
          resolve(token)
        } else {
          res.writeHead(400, { 'Content-Type': 'text/plain' })
          res.end('Missing token parameter')
          reject(new Error('Callback received but no token in URL'))
        }
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(WAITING_HTML)
      }
    })

    server.on('error', reject)
    server.listen(CALLBACK_PORT, '127.0.0.1', () => {/* ready */})

    // Timeout after 3 minutes
    setTimeout(() => {
      server.close()
      reject(new Error('timeout'))
    }, 180_000)
  })
}

/**
 * Full automatic OAuth flow.
 * Opens browser → user clicks Google login → token arrives at /callback.
 * Returns token string on success, throws on timeout/error.
 */
export async function oauthFlowAutomatic() {
  const base = SEVENVERSE_BASE()
  const callbackUrl = `http://127.0.0.1:${CALLBACK_PORT}/callback`
  const loginUrl = `${base}/api/v1/auth/google/web/login/start?redirect=${encodeURIComponent(callbackUrl)}`

  const tokenPromise = waitForCallback()

  const { default: open } = await import('open')
  await open(loginUrl)

  return tokenPromise  // resolves when /callback is hit
}

/**
 * Fallback: open browser, user pastes token.
 * readline is an async function that prompts the user.
 */
export async function oauthFlowManual(readline) {
  const base = SEVENVERSE_BASE()
  const loginUrl = `${base}/api/v1/auth/google/web/login/start`
  const { default: open } = await import('open')
  await open(loginUrl)
  return readline()
}

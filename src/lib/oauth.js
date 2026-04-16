/**
 * 7verse.ai OAuth helper
 *
 * Strategy: open uat.7verse.ai directly → user completes Google login →
 * user copies access_token_uat cookie from DevTools → paste here.
 *
 * Why no redirect: 7verse OAuth blocks arbitrary redirect hosts (127.0.0.1).
 * The direct approach is simpler and equally secure for a CLI tool.
 */
import https from 'https'
import { getConfigValue, saveConfig, loadConfig } from './config.js'

const SEVENVERSE_BASE = () =>
  (getConfigValue('sevenverseBase') || 'https://uat.7verse.ai').replace(/\/+$/, '')

export async function verifyToken(token) {
  const base = SEVENVERSE_BASE().replace(/^https?:\/\//, '')
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: base,
        path: '/api/v1/auth/verify',
        method: 'POST',
        headers: {
          Cookie: `access_token_uat=${token}`,
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        let body = ''
        res.on('data', (d) => (body += d))
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body)
            resolve(res.statusCode === 200 && !parsed.error)
          } catch {
            resolve(res.statusCode === 200)
          }
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
  return (cfg.sevenverseToken || '').trim() || null
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
 * Open browser to 7verse.ai login page, then call readline() to get the token.
 * readline is an async function provided by the caller (clack prompt).
 */
export async function oauthFlow(readline) {
  const base = SEVENVERSE_BASE()
  const loginUrl = `${base}/api/v1/auth/google/web/login/start`

  const { default: open } = await import('open')
  await open(loginUrl)

  return readline()
}

/**
 * Build the DevTools instructions string (used in setup + login UI).
 */
export function getTokenCopyInstructions(base) {
  const host = (base || SEVENVERSE_BASE()).replace(/^https?:\/\//, '')
  return [
    `1. 在刚打开的浏览器里完成 Google 登录`,
    `2. 登录成功后，按 ${bold('Cmd+Option+I')}（Mac）或 ${bold('F12')}（Windows）打开 DevTools`,
    `3. 点击 ${bold('Application')} 标签（Chrome）或 ${bold('Storage')}（Firefox）`,
    `4. 左侧展开 ${bold('Cookies')} → 点击 ${bold(host)}`,
    `5. 找到 ${bold('access_token_uat')} 行，双击 ${bold('Value')} 列，全选复制`,
    `6. 切回这里，粘贴到下方提示符`,
  ].join('\n     ')
}

function bold(s) { return `\x1b[1m${s}\x1b[0m` }

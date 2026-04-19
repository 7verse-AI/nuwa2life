/**
 * nuwa2life login — refresh 7verse.ai token
 */
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { isCachedTokenValid, oauthFlowAutomatic, oauthFlowManual, saveToken, verifyToken } from '../lib/oauth.js'

export async function login() {
  console.log()
  p.intro(pc.bold('7verse 登录'))

  const s = p.spinner()
  s.start('看看现在登着没...')
  const valid = await isCachedTokenValid()
  s.stop(valid
    ? pc.green('还登着') + pc.dim('  （继续会覆盖掉）')
    : pc.yellow('Token 过期了 / 没有'))

  if (valid) {
    const force = await p.confirm({
      message: '已经登着了，还要重登？',
      initialValue: false,
    })
    if (p.isCancel(force) || !force) {
      p.outro(`好，维持原样。${pc.dim('详情看 nuwa2life config')}`)
      return
    }
  }

  const go = await p.confirm({ message: '开搞？按 Y 开浏览器走 Google 登录', initialValue: true })
  if (p.isCancel(go) || !go) {
    p.outro(`好，撤了。${pc.dim('想再来：nuwa2life login')}`)
    return
  }

  let token = ''

  // Try automatic mode first (RFC 8252 loopback redirect)
  // Falls back to manual paste if backend doesn't support it yet
  const sp = p.spinner()
  sp.start('浏览器开着，等你登...')
  try {
    token = await oauthFlowAutomatic()
    sp.stop(pc.green('✓ 登进来了'))
  } catch {
    // Stop the spinner so it doesn't keep animating in the background
    // and re-appear after p.outro, which would look like the flow is looping.
    sp.stop('浏览器开着，等你登...')
    token = await manualPasteFlow()
  }

  if (!token) {
    p.outro(pc.yellow(`没登成。${pc.cyan('nuwa2life login')} 再来一次`))
    return
  }

  const sv = p.spinner()
  sv.start('验 Token...')
  const tokenValid = await verifyToken(token)
  sv.stop(tokenValid
    ? pc.green('✓ Token 通了')
    : pc.yellow('验证没过（先存着，可能还能用）'))
  saveToken(token)

  p.outro(pc.green('✓ 登录状态更新了'))
  console.log()
  console.log(pc.dim(`  看配置：nuwa2life config`))
  console.log(pc.dim(`  全面体检：nuwa2life test`))
  console.log()
}

async function manualPasteFlow() {
  p.log.info('浏览器开着 → Google 登完后：')
  p.log.info('  打开 DevTools (F12) → Application → Cookies → 复制 access_token 的值')

  let token = ''
  let attempt = 0

  while (!token) {
    attempt++
    const raw = await oauthFlowManual(async () => {
      const val = await p.text({
        message: '粘贴 Token（r = 重开浏览器）：',
        placeholder: 'eyJ...',
        validate(v) {
          if (!v?.trim()) return '粘一下 Token'
          const clean = v.trim().replace(/^["']|["']$/g, '')
          if (clean.toLowerCase() === 'r') return undefined
          if (clean.length < 20) return '这也太短了，确定全复制上了？'
        },
      })
      if (p.isCancel(val)) { p.cancel('撤了'); process.exit(0) }
      return val.trim().replace(/^["']|["']$/g, '')
    })

    if (raw?.toLowerCase() === 'r') { p.log.info('再开一次...'); continue }
    if (raw) { token = raw; break }

    if (attempt >= 3) {
      const skip = await p.confirm({
        message: '来了几次都不行，先跳？（晚点 nuwa2life login 再来）',
        initialValue: true,
      })
      if (p.isCancel(skip) || skip) break
    }
  }

  return token
}

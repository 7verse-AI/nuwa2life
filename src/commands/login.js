/**
 * nuwa2life login — refresh 7verse.ai token
 */
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { isCachedTokenValid, oauthFlow, saveToken, verifyToken } from '../lib/oauth.js'

export async function login() {
  console.log()
  p.intro(pc.bold('7verse.ai 重新登录'))

  const s = p.spinner()
  s.start('检查当前登录状态...')
  const valid = await isCachedTokenValid()
  s.stop(valid ? pc.green('当前 Token 仍然有效') : pc.yellow('Token 已过期或不存在'))

  if (valid) {
    const force = await p.confirm({
      message: '当前已登录且有效，是否强制重新登录？',
      initialValue: false,
    })
    if (p.isCancel(force) || !force) {
      p.outro('保持现有登录状态。')
      return
    }
  }

  p.log.info('即将打开浏览器，用 Google 账号登录 7verse.ai')
  p.log.info('登录完成后，按照浏览器页面指引复制 Token，粘贴回这里')

  await p.text({ message: '按回车打开浏览器...', placeholder: '回车继续' }).catch(() => {})

  const token = await oauthFlow(async () => {
    const raw = await p.text({
      message: '粘贴 access_token_uat 的值：',
      placeholder: 'eyJ...',
      validate(v) {
        if (!v || v.trim().replace(/['"]/g, '').length < 20)
          return 'Token 太短，请检查是否完整复制'
      },
    })
    if (p.isCancel(raw)) { p.cancel('已取消。'); process.exit(0) }
    return raw.trim().replace(/^["']|["']$/g, '')
  })

  const s2 = p.spinner()
  s2.start('验证 Token...')
  const tokenValid = await verifyToken(token)
  s2.stop(tokenValid ? pc.green('✓ 登录成功') : pc.yellow('Token 验证失败，但已保存（可能仍然有效）'))

  saveToken(token)
  p.outro(pc.green('✓ 登录状态已更新'))
}

/**
 * nuwa2life login — refresh 7verse.ai token
 */
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { isCachedTokenValid, oauthFlowAutomatic, saveToken, verifyToken } from '../lib/oauth.js'

export async function login() {
  console.log()
  p.intro(pc.bold('7verse.ai 登录'))

  const s = p.spinner()
  s.start('检查当前登录状态...')
  const valid = await isCachedTokenValid()
  s.stop(valid
    ? pc.green('当前 Token 有效') + pc.dim('  （仍可继续，会覆盖现有 Token）')
    : pc.yellow('Token 已过期或不存在'))

  if (valid) {
    const force = await p.confirm({
      message: '当前已登录，强制重新登录？',
      initialValue: false,
    })
    if (p.isCancel(force) || !force) {
      p.outro(`保持现有登录。${pc.dim('运行 nuwa2life config 查看详情。')}`)
      return
    }
  }

  const go = await p.confirm({ message: '准备好？按 Y 打开浏览器完成 Google 登录', initialValue: true })
  if (p.isCancel(go) || !go) {
    p.outro(`已退出。${pc.dim('运行 nuwa2life login 重试。')}`)
    return
  }

  let token = ''

  // Automatic OAuth flow (RFC 8252 loopback redirect)
  // Works once backend allowlists 127.0.0.1 in OAuth redirect URIs
  try {
    const sp = p.spinner()
    sp.start('检查登录方式...')
    token = await oauthFlowAutomatic()
    sp.stop(pc.green('✓ 登录成功'))
  } catch (e) {
    if (e.message?.startsWith('redirect_not_allowed')) {
      p.log.error('自动登录暂不可用：后端尚未开放 127.0.0.1 回调白名单')
      p.log.info('请联系后端团队将 127.0.0.1 加入 OAuth redirect URI 白名单（RFC 8252 §7.3）')
      p.outro(`配置完成后重新运行 ${pc.cyan('nuwa2life login')}`)
    } else if (e.message === 'timeout') {
      p.outro(pc.yellow('登录超时，请重新运行 nuwa2life login'))
    } else {
      p.log.error(e.message)
      p.outro(`运行 ${pc.cyan('nuwa2life login')} 重试`)
    }
    return
  }

  if (!token) {
    p.outro(pc.yellow(`登录未完成。运行 ${pc.cyan('nuwa2life login')} 重试。`))
    return
  }

  const sv = p.spinner()
  sv.start('验证 Token...')
  const tokenValid = await verifyToken(token)
  sv.stop(tokenValid
    ? pc.green('✓ Token 验证通过')
    : pc.yellow('Token 验证失败（已保存，可能仍然有效）'))
  saveToken(token)

  p.outro(pc.green('✓ 登录状态已更新'))
  console.log()
  console.log(pc.dim(`  运行 nuwa2life config 查看当前配置`))
  console.log(pc.dim(`  运行 nuwa2life test 验证所有 API`))
  console.log()
}

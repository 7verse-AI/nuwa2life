/**
 * nuwa2life login — refresh 7verse.ai token
 */
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { isCachedTokenValid, oauthFlow, saveToken, verifyToken, getTokenCopyInstructions } from '../lib/oauth.js'

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

  p.log.info(`将打开 7verse.ai，用 Google 账号登录，登录后从 DevTools 复制 Token`)

  const go = await p.confirm({ message: '准备好？按 Y 打开浏览器', initialValue: true })
  if (p.isCancel(go) || !go) {
    p.outro(`已退出。${pc.dim('运行 nuwa2life login 重试。')}`)
    return
  }

  let token = ''
  let attempt = 0

  while (!token) {
    attempt++

    try {
      token = await oauthFlow(async () => {
        console.log()
        console.log(pc.dim('     ' + getTokenCopyInstructions()))
        console.log()

        const raw = await p.text({
          message: '粘贴 access_token_uat 的值（输入 r 可重新打开浏览器）：',
          placeholder: 'eyJ...',
          validate(v) {
            if (!v?.trim()) return '请粘贴 Token 值'
            const clean = v.trim().replace(/^["']|["']$/g, '')
            if (clean.toLowerCase() === 'r') return undefined
            if (clean.length < 20) return 'Token 太短，请确认是否完整复制'
          },
        })
        if (p.isCancel(raw)) { p.cancel('已退出。'); process.exit(0) }
        return raw.trim().replace(/^["']|["']$/g, '')
      })
    } catch (e) {
      p.log.error(`出错: ${e.message}`)
    }

    if (token?.toLowerCase() === 'r') {
      token = ''
      p.log.info('重新打开浏览器...')
      continue
    }

    if (token) {
      const sv = p.spinner()
      sv.start('验证 Token...')
      const tokenValid = await verifyToken(token)
      sv.stop(tokenValid
        ? pc.green('✓ 登录成功')
        : pc.yellow('Token 验证失败（已保存，可能仍然有效）'))
      saveToken(token)
      break
    }

    if (attempt >= 3) {
      const skip = await p.confirm({
        message: '多次尝试失败，跳过？（运行 nuwa2life login 可随时重试）',
        initialValue: true,
      })
      if (p.isCancel(skip) || skip) break
    }
  }

  if (!token) {
    p.outro(pc.yellow(`登录未完成。运行 ${pc.cyan('nuwa2life login')} 重试。`))
    return
  }

  p.outro(pc.green('✓ 登录状态已更新'))
  console.log()
  console.log(pc.dim(`  运行 nuwa2life config 查看当前配置`))
  console.log(pc.dim(`  运行 nuwa2life test 验证所有 API`))
  console.log()
}

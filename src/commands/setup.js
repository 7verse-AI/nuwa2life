/**
 * nuwa2life setup — guided first-time initialization
 *
 * Flow:
 *   Step 1  ElevenLabs API Key  (skip if already valid)
 *   Step 2  7verse.ai Login     (skip if token still valid)
 *   Step 3  Install Skill       (copy to ~/.claude/skills/)
 */
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { homedir } from 'os'
import { join } from 'path'
import { mkdirSync, cpSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { saveConfig, markSetupComplete, loadConfig } from '../lib/config.js'
import { verifyApiKey } from '../lib/elevenlabs.js'
import { isCachedTokenValid, oauthFlowAutomatic, oauthFlowManual, saveToken, verifyToken } from '../lib/oauth.js'

const SKILL_SRC = join(fileURLToPath(import.meta.url), '../../../skill')
const SKILL_DST = join(homedir(), '.claude', 'skills', 'nuwa2life')

// ── Shared tip shown in multiple places ──────────────────────────────────────
const AVAILABLE_COMMANDS = `${pc.dim('可用命令：')}
  ${pc.cyan('nuwa2life setup')}               重新初始化
  ${pc.cyan('nuwa2life login')}               刷新 7verse.ai 登录
  ${pc.cyan('nuwa2life config')}              查看 / 清除已保存的配置
  ${pc.cyan('nuwa2life test')}                测试 API 连通性
  ${pc.cyan('nuwa2life create "<人物名>"')}   直接从命令行创建角色`

export async function setup() {
  console.log()
  p.intro(pc.bold('Nuwa2Life  ·  让任何人物拥有声音和面孔'))

  const existing = loadConfig()
  const isReset  = existing.setupComplete

  if (isReset) {
    p.log.info('当前配置状态：')
    p.log.info(`  ElevenLabs Key  ${existing.elevenlabsApiKey ? pc.green('✓ 已保存') : pc.red('未设置')}`)
    p.log.info(`  7verse.ai Token ${existing.sevenverseToken  ? pc.green('✓ 已保存') : pc.red('未设置')}`)
    p.log.info(`  Claude Skill    ${existsSync(SKILL_DST)     ? pc.green('✓ 已安装') : pc.yellow('未安装')}`)
    console.log()
    p.log.info(`如果只想清除某项，运行 ${pc.cyan('nuwa2life config')} 更高效`)

    const confirm = await p.confirm({
      message: '重新运行 setup 会检查每一步并只补缺失项，继续？',
      initialValue: true,
    })
    if (p.isCancel(confirm) || !confirm) {
      p.outro(`已退出。${pc.dim('运行 nuwa2life config 可单独管理配置项。')}`)
      return
    }
  }

  // ── Step 1: ElevenLabs API Key ──────────────────────────────────────────────
  p.log.step(pc.bold('Step 1 / 3  —  ElevenLabs API Key'))

  let apiKey = existing.elevenlabsApiKey || ''
  let keySkipped = false

  if (apiKey) {
    const s = p.spinner()
    s.start('验证已保存的 API Key...')
    const valid = await verifyApiKey(apiKey)
    if (valid) {
      s.stop(pc.green('✓ API Key 有效，跳过') + pc.dim(`  （清除请运行 nuwa2life config --clear-key）`))
      keySkipped = true
    } else {
      s.stop(pc.yellow('已保存的 API Key 失效，需要重新输入'))
      apiKey = ''
    }
  } else {
    p.log.info('用于克隆人物声音。前往 https://elevenlabs.io/app/settings/api-keys 获取')
  }

  if (!apiKey) {
    apiKey = await p.text({
      message: '粘贴你的 ElevenLabs API Key：',
      placeholder: 'sk_...',
      validate(v) {
        if (!v || v.trim().length < 20) return 'Key 太短，请检查是否完整复制'
      },
    })
    if (p.isCancel(apiKey)) {
      p.cancel(`已退出。${pc.dim('稍后运行 nuwa2life setup 继续。')}`)
      process.exit(0)
    }
    apiKey = apiKey.trim()

    const s = p.spinner()
    s.start('验证 API Key...')
    const valid = await verifyApiKey(apiKey)
    s.stop(valid
      ? pc.green('✓ API Key 有效')
      : pc.yellow('✗ 验证失败（网络问题？已保存，稍后运行 nuwa2life test 重新验证）'))
    saveConfig({ elevenlabsApiKey: apiKey })
  }

  // ── Step 2: 7verse.ai Login ─────────────────────────────────────────────────
  p.log.step(pc.bold('Step 2 / 3  —  7verse.ai 登录'))

  let tokenSkipped = false
  if (existing.sevenverseToken) {
    const s = p.spinner()
    s.start('验证已保存的登录状态...')
    const valid = await isCachedTokenValid()
    if (valid) {
      s.stop(pc.green('✓ 已登录，跳过') + pc.dim(`  （重新登录请运行 nuwa2life login）`))
      tokenSkipped = true
    } else {
      s.stop(pc.yellow('登录已过期，需要重新登录'))
    }
  } else {
    p.log.info('用 Google 账号登录 7verse.ai，无需额外 API Key')
  }

  if (!tokenSkipped) {
    await doLoginFlow()
  }

  // ── Step 3: Install Skill ───────────────────────────────────────────────────
  p.log.step(pc.bold('Step 3 / 3  —  安装 Claude Code Skill'))

  if (existsSync(SKILL_DST) && isReset) {
    p.log.info(pc.dim(`Skill 已存在于 ${SKILL_DST}，更新中...`))
  }

  const s = p.spinner()
  s.start('安装 Skill...')
  try {
    mkdirSync(SKILL_DST, { recursive: true })
    if (!existsSync(SKILL_SRC)) throw new Error(`Skill 源目录不存在: ${SKILL_SRC}`)
    cpSync(SKILL_SRC, SKILL_DST, { recursive: true, force: true })
    s.stop(pc.green(`✓ Skill 已安装`) + pc.dim(`  → ${SKILL_DST}`))
  } catch (e) {
    s.stop(pc.red(`✗ 安装失败: ${e.message}`))
    p.log.warn(`手动安装：cp -r ./skill/ ~/.claude/skills/nuwa2life/`)
  }

  // ── Done ────────────────────────────────────────────────────────────────────
  markSetupComplete()

  p.outro(pc.bold(pc.green('✓ 初始化完成！')))

  console.log()
  console.log(`  ${pc.bold('现在在 Claude Code 里说：')}`)
  console.log()
  console.log(`    ${pc.cyan(pc.bold('「我想跟 Steve Jobs 对话」'))}`)
  console.log(`    ${pc.cyan(pc.bold('「把马斯克活体化」'))}`)
  console.log()
  console.log(`  Skill 会自动引导你完成人设蒸馏、图片搜索、音色克隆和角色注册。`)
  console.log()
  console.log(pc.dim('─'.repeat(56)))
  console.log()
  console.log(AVAILABLE_COMMANDS)
  console.log()
}

// ── OAuth flow with retry ─────────────────────────────────────────────────────
async function doLoginFlow() {
  const go = await p.confirm({ message: '准备好？按 Y 打开浏览器完成 Google 登录', initialValue: true })
  if (p.isCancel(go) || !go) {
    p.log.warn(`跳过登录。稍后运行 ${pc.cyan('nuwa2life login')} 补上。`)
    return
  }

  let token = ''

  // Try automatic mode (Mode A): open browser, capture token via local callback server
  try {
    const s = p.spinner()
    s.start('浏览器已打开，等待登录完成...')
    token = await oauthFlowAutomatic()
    s.stop(pc.green('✓ 登录成功'))
  } catch (e) {
    // Mode A failed (backend doesn't allowlist 127.0.0.1 yet, or timed out)
    // Fall back to manual token paste (Mode B)
    p.log.warn('自动登录不可用，请手动复制 Token')
    token = await manualTokenFlow()
  }

  if (token) {
    const s = p.spinner()
    s.start('验证 Token...')
    const valid = await verifyToken(token)
    s.stop(valid ? pc.green('✓ 登录验证通过') : pc.yellow('Token 验证失败（已保存，可能仍然有效）'))
    saveToken(token)
  } else {
    p.log.warn(`登录未完成。稍后运行 ${pc.cyan('nuwa2life login')} 重试。`)
  }
}

// Manual token paste fallback (Mode B)
async function manualTokenFlow() {
  p.log.info('浏览器已打开 7verse.ai → 完成 Google 登录后：')
  p.log.info('  打开 DevTools (F12) → Application → Cookies → 复制 access_token_uat 的值')

  let token = ''
  let attempt = 0

  while (!token) {
    attempt++

    const raw = await oauthFlowManual(async () => {
      const val = await p.text({
        message: '粘贴 access_token_uat 的值（输入 r 可重新打开浏览器）：',
        placeholder: 'eyJ...',
        validate(v) {
          if (!v?.trim()) return '请粘贴 Token 值'
          const clean = v.trim().replace(/^["']|["']$/g, '')
          if (clean.toLowerCase() === 'r') return undefined
          if (clean.length < 20) return 'Token 太短，请确认是否完整复制'
        },
      })
      if (p.isCancel(val)) { p.cancel('已退出。'); process.exit(0) }
      return val.trim().replace(/^["']|["']$/g, '')
    })

    if (raw?.toLowerCase() === 'r') {
      p.log.info('重新打开浏览器...')
      continue
    }

    if (raw) { token = raw; break }

    if (attempt >= 3) {
      const skip = await p.confirm({
        message: '多次尝试失败，跳过？（稍后运行 nuwa2life login 补上）',
        initialValue: true,
      })
      if (p.isCancel(skip) || skip) break
    }
  }

  return token
}

/**
 * nuwa2life setup — guided first-time initialization
 *
 * Flow:
 *   Step 1  ElevenLabs API Key  (verify online)
 *   Step 2  7verse.ai Login     (OAuth → token)
 *   Step 3  Install Skill       (copy to ~/.claude/skills/)
 */
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { homedir } from 'os'
import { join } from 'path'
import { mkdirSync, cpSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { saveConfig, markSetupComplete, loadConfig } from '../lib/config.js'
import { verifyApiKey } from '../lib/elevenlabs.js'
import { isCachedTokenValid, oauthFlow, saveToken, verifyToken } from '../lib/oauth.js'

const SKILL_SRC = join(fileURLToPath(import.meta.url), '../../../skill')
const SKILL_DST = join(homedir(), '.claude', 'skills', 'nuwa2life')

export async function setup() {
  console.log()
  p.intro(pc.bold('Nuwa2Life  ·  让任何人物拥有声音和面孔'))

  const existing = loadConfig()
  const isReset  = existing.setupComplete

  if (isReset) {
    const confirm = await p.confirm({
      message: '检测到已完成过初始化，重新设置会覆盖现有配置，继续吗？',
      initialValue: false,
    })
    if (p.isCancel(confirm) || !confirm) {
      p.outro('已取消。现有配置保持不变。')
      return
    }
  }

  // ── Step 1: ElevenLabs API Key ──────────────────────────────────────────────
  p.log.step(pc.bold('Step 1 / 3  —  ElevenLabs API Key'))
  p.log.info('用于克隆人物声音。没有账号？前往 https://elevenlabs.io 免费注册')

  let apiKey = existing.elevenlabsApiKey || ''
  if (apiKey) {
    const s = p.spinner()
    s.start('验证已保存的 API Key...')
    const valid = await verifyApiKey(apiKey)
    s.stop(valid ? pc.green('✓ API Key 有效，跳过') : pc.yellow('API Key 已失效，需要重新输入'))
    if (!valid) apiKey = ''
  }

  if (!apiKey) {
    apiKey = await p.text({
      message: '粘贴你的 ElevenLabs API Key：',
      placeholder: 'sk_...',
      validate(v) {
        if (!v || v.trim().length < 20) return 'Key 太短，请检查是否复制完整'
      },
    })
    if (p.isCancel(apiKey)) { p.cancel('已取消。'); process.exit(0) }
    apiKey = apiKey.trim()

    const s = p.spinner()
    s.start('验证 API Key...')
    const valid = await verifyApiKey(apiKey)
    s.stop(valid ? pc.green('✓ API Key 有效') : pc.red('✗ API Key 无效'))
    if (!valid) {
      p.log.warn('API Key 验证失败。可能是网络问题，已保存——你可以稍后用 nuwa2life test 重新验证。')
    }
    saveConfig({ elevenlabsApiKey: apiKey })
  }

  // ── Step 2: 7verse.ai Login ─────────────────────────────────────────────────
  p.log.step(pc.bold('Step 2 / 3  —  7verse.ai 登录'))

  const tokenValid = await (async () => {
    if (!existing.sevenverseToken) return false
    const s = p.spinner()
    s.start('检查已保存的登录状态...')
    const v = await isCachedTokenValid()
    s.stop(v ? pc.green('✓ 已登录，跳过') : pc.yellow('登录已过期，需要重新登录'))
    return v
  })()

  if (!tokenValid) {
    p.log.info('即将打开浏览器，用 Google 账号登录 7verse.ai')
    p.log.info('登录完成后，按照浏览器页面的提示复制 Token，粘贴回这里')

    await p.text({ message: '准备好了吗？按回车打开浏览器...', placeholder: '回车继续' })
      .catch(() => {})

    let token = ''
    let attempts = 0
    while (!token && attempts < 3) {
      attempts++
      try {
        token = await oauthFlow(async () => {
          const raw = await p.text({
            message: '粘贴 access_token_uat 的值：',
            placeholder: 'eyJ...',
            validate(v) {
              if (!v || v.trim().replace(/['"]/g, '').length < 20)
                return 'Token 太短，请检查是否完整复制'
            },
          })
          if (p.isCancel(raw)) { p.cancel('已取消。'); process.exit(0) }
          return raw.trim().replace(/^["']|["']$/g, '') // strip accidental quotes
        })
      } catch (e) {
        p.log.error(`登录出错: ${e.message}`)
      }

      if (token) {
        const s = p.spinner()
        s.start('验证 Token...')
        const valid = await verifyToken(token)
        s.stop(valid ? pc.green('✓ 登录成功') : pc.yellow('Token 验证失败，可能仍然有效，已保存'))
        saveToken(token)
      }
    }

    if (!token) {
      p.log.warn('未能完成登录。你可以稍后运行 nuwa2life login 重试。')
    }
  }

  // ── Step 3: Install Skill ───────────────────────────────────────────────────
  p.log.step(pc.bold('Step 3 / 3  —  安装 Claude Code Skill'))

  const s = p.spinner()
  s.start(`安装到 ${SKILL_DST}...`)

  try {
    installSkill()
    s.stop(pc.green(`✓ Skill 已安装`))
  } catch (e) {
    s.stop(pc.red(`✗ 安装失败: ${e.message}`))
    p.log.warn('可以手动安装：将项目里的 skill/ 目录复制到 ~/.claude/skills/nuwa2life/')
  }

  // ── Done ────────────────────────────────────────────────────────────────────
  markSetupComplete()

  p.outro(pc.bold(pc.green('✓ 初始化完成！')))
  console.log()
  console.log(pc.dim('─'.repeat(52)))
  console.log()
  console.log(`  现在打开 ${pc.bold('Claude Code')}，直接说：`)
  console.log()
  console.log(`  ${pc.cyan(pc.bold('「我想跟 Steve Jobs 对话」'))}`)
  console.log()
  console.log(`  Skill 会自动引导你完成剩余步骤。`)
  console.log()
  console.log(pc.dim('─'.repeat(52)))
  console.log()
  console.log(pc.dim('调试工具：'))
  console.log(pc.dim(`  nuwa2life test        — 测试 API 连通性`))
  console.log(pc.dim(`  nuwa2life login       — 刷新 7verse.ai 登录`))
  console.log(pc.dim(`  nuwa2life create "名字" — 不依赖 Claude Code，直接创建角色`))
  console.log()
}

function installSkill() {
  mkdirSync(SKILL_DST, { recursive: true })

  // Copy all files from skill/ directory
  if (!existsSync(SKILL_SRC)) {
    throw new Error(`Skill 源目录不存在: ${SKILL_SRC}`)
  }

  cpSync(SKILL_SRC, SKILL_DST, { recursive: true, force: true })
}

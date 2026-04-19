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
import { saveConfig, markSetupComplete, loadConfig, getDefaultDistillMode, setDefaultDistillMode } from '../lib/config.js'
import { verifyApiKey } from '../lib/elevenlabs.js'
import { isCachedTokenValid, oauthFlowAutomatic, oauthFlowManual, saveToken, verifyToken } from '../lib/oauth.js'

const SKILL_SRC = join(fileURLToPath(import.meta.url), '../../../skill')
const SKILL_DST = join(homedir(), '.claude', 'skills', 'nuwa2life')

// ── Shared tip shown in multiple places ──────────────────────────────────────
const AVAILABLE_COMMANDS = `${pc.dim('手头有这些命令：')}
  ${pc.cyan('nuwa2life setup')}                             重头配
  ${pc.cyan('nuwa2life login')}                             刷 7verse 登录
  ${pc.cyan('nuwa2life config')}                            查/改配置
  ${pc.cyan('nuwa2life config --set-distill-mode <mode>')}  改默认蒸馏深度
  ${pc.cyan('nuwa2life test')}                              戳一下所有 API
  ${pc.cyan('nuwa2life create "<人物名>"')}                 命令行直接搓一个`

export async function setup() {
  console.log()
  p.intro(pc.bold('Nuwa2Life  ·  给任何人搓个 AI 分身'))

  const existing = loadConfig()
  const isReset  = existing.setupComplete

  if (isReset) {
    p.log.info('现状：')
    p.log.info(`  ElevenLabs Key  ${existing.elevenlabsApiKey ? pc.green('✓ 有') : pc.red('没')}`)
    p.log.info(`  7verse Token    ${existing.sevenverseToken  ? pc.green('✓ 有') : pc.red('没')}`)
    p.log.info(`  Claude Skill    ${existsSync(SKILL_DST)     ? pc.green('✓ 装了') : pc.yellow('没装')}`)
    console.log()
    p.log.info(`只想改某一项？${pc.cyan('nuwa2life config')} 更快`)

    const confirm = await p.confirm({
      message: '全走一遍（只补缺的，不动已好的），继续？',
      initialValue: true,
    })
    if (p.isCancel(confirm) || !confirm) {
      p.outro(`好，撤了。${pc.dim('想单点某项跑 nuwa2life config')}`)
      return
    }
  }

  // ── Step 1: ElevenLabs API Key ──────────────────────────────────────────────
  p.log.step(pc.bold('Step 1 / 4  —  ElevenLabs API Key'))

  let apiKey = existing.elevenlabsApiKey || ''
  let keySkipped = false

  if (apiKey) {
    const s = p.spinner()
    s.start('戳已存的 Key 看活着没...')
    const valid = await verifyApiKey(apiKey)
    if (valid) {
      s.stop(pc.green('✓ Key 还活着，跳过') + pc.dim(`  （想清掉：nuwa2life config --clear-key）`))
      keySkipped = true
    } else {
      s.stop(pc.yellow('已存的 Key 过期了，重来一个'))
      apiKey = ''
    }
  } else {
    p.log.info('克隆声音要用。去 https://elevenlabs.io/app/settings/api-keys 抓一个')
  }

  if (!apiKey) {
    apiKey = await p.text({
      message: '粘贴 ElevenLabs API Key：',
      placeholder: 'sk_...',
      validate(v) {
        if (!v || v.trim().length < 20) return 'Key 太短了，别漏复制了'
      },
    })
    if (p.isCancel(apiKey)) {
      p.cancel(`撤了。${pc.dim('想继续：nuwa2life setup')}`)
      process.exit(0)
    }
    apiKey = apiKey.trim()

    const s = p.spinner()
    s.start('戳一下看 Key 通不通...')
    const valid = await verifyApiKey(apiKey)
    s.stop(valid
      ? pc.green('✓ Key 通了')
      : pc.yellow('✗ 没戳通（网的事？先存着，晚点 nuwa2life test 再试）'))
    saveConfig({ elevenlabsApiKey: apiKey })
  }

  // ── Step 2: 7verse.ai Login ─────────────────────────────────────────────────
  p.log.step(pc.bold('Step 2 / 4  —  7verse.ai 登录'))

  let tokenSkipped = false
  if (existing.sevenverseToken) {
    const s = p.spinner()
    s.start('戳一下登录状态...')
    const valid = await isCachedTokenValid()
    if (valid) {
      s.stop(pc.green('✓ 还登着，跳过') + pc.dim(`  （想重登：nuwa2life login）`))
      tokenSkipped = true
    } else {
      s.stop(pc.yellow('登录过期了，重登一下'))
    }
  } else {
    p.log.info('Google 一键登，不要额外的 Key')
  }

  if (!tokenSkipped) {
    await doLoginFlow()
  }

  // ── Step 3: Install Skill ───────────────────────────────────────────────────
  p.log.step(pc.bold('Step 3 / 4  —  装 Claude Code Skill'))

  if (existsSync(SKILL_DST) && isReset) {
    p.log.info(pc.dim(`${SKILL_DST} 已经在了，覆盖更新...`))
  }

  const s = p.spinner()
  s.start('搬 Skill 进去...')
  try {
    mkdirSync(SKILL_DST, { recursive: true })
    if (!existsSync(SKILL_SRC)) throw new Error(`Skill 源目录不存在: ${SKILL_SRC}`)
    cpSync(SKILL_SRC, SKILL_DST, { recursive: true, force: true })
    s.stop(pc.green(`✓ Skill 装好了`) + pc.dim(`  → ${SKILL_DST}`))
  } catch (e) {
    s.stop(pc.red(`✗ 装失败: ${e.message}`))
    p.log.warn(`手动搬：cp -r ./skill/ ~/.claude/skills/nuwa2life/`)
  }

  // ── Step 4: 默认蒸馏深度 ──────────────────────────────────────────────────
  p.log.step(pc.bold('Step 4 / 4  —  默认蒸馏深度'))

  const currentMode = getDefaultDistillMode()
  p.log.info('蒸馏模式：')
  p.log.info(`  ${pc.bold('simple')}    快（~1-2 min），搜一轮真实语料再生成，适合已知度高的人物`)
  p.log.info(`  ${pc.bold('complete')}  慢（~5-15 min），调 huashu-nuwa 跑完整 6-agent，顺手产出可复用的 perspective skill`)

  const mode = await p.select({
    message: '默认走哪个？（之后可以 nuwa2life config --set-distill-mode 改）',
    initialValue: currentMode,
    options: [
      { value: 'simple',   label: 'simple',   hint: '推荐 · 快' },
      { value: 'complete', label: 'complete', hint: '深 · 产出 perspective skill' },
    ],
  })

  if (p.isCancel(mode)) {
    p.log.warn(`跳过，默认保持 ${pc.cyan(currentMode)}`)
  } else {
    setDefaultDistillMode(mode)
    p.log.success(pc.green(`✓ 默认蒸馏深度 = ${pc.bold(mode)}`))
  }

  // ── Done ────────────────────────────────────────────────────────────────────
  markSetupComplete()

  p.outro(pc.bold(pc.green('✓ 配好了，开搓')))

  console.log()
  console.log(`  ${pc.bold('回 Claude Code 里来一句：')}`)
  console.log()
  console.log(`    ${pc.cyan(pc.bold('「我想跟 Steve Jobs 聊聊」'))}`)
  console.log(`    ${pc.cyan(pc.bold('「搓个马斯克出来」'))}`)
  console.log(`    ${pc.cyan(pc.bold('「nuwa2life 张雪峰」'))}`)
  console.log()
  console.log(`  我会带你走 蒸馏 → 搜图 → 克隆音色 → 上线 全流程。`)
  console.log()
  console.log(pc.dim('─'.repeat(56)))
  console.log()
  console.log(AVAILABLE_COMMANDS)
  console.log()
}

// ── OAuth flow with retry ─────────────────────────────────────────────────────
async function doLoginFlow() {
  const go = await p.confirm({ message: '开搞？按 Y 给你开浏览器走 Google 登录', initialValue: true })
  if (p.isCancel(go) || !go) {
    p.log.warn(`先跳过。想登再跑 ${pc.cyan('nuwa2life login')}`)
    return
  }

  let token = ''

  // Try automatic mode first; silently fall back to manual paste if not available
  const s = p.spinner()
  s.start('浏览器已打开，等待登录完成...')
  try {
    token = await oauthFlowAutomatic()
    s.stop(pc.green('✓ 登录成功'))
  } catch {
    // Stop the spinner so it doesn't keep animating in the background
    // and re-appear after p.outro, which would look like the flow is looping.
    s.stop('浏览器已打开，等待登录完成...')
    token = await manualPasteFlow()
  }

  if (token) {
    const s = p.spinner()
    s.start('验一下 Token...')
    const valid = await verifyToken(token)
    s.stop(valid ? pc.green('✓ 登进来了') : pc.yellow('Token 验证没过（先存着，可能还能用）'))
    saveToken(token)
  } else {
    p.log.warn(`没登成。晚点 ${pc.cyan('nuwa2life login')} 再来`)
  }
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
        message: '来了几次都不行，先跳？（晚点跑 nuwa2life login 补）',
        initialValue: true,
      })
      if (p.isCancel(skip) || skip) break
    }
  }

  return token
}

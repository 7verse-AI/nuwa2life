/**
 * nuwa2life config — view and manage saved configuration
 *
 * Usage:
 *   nuwa2life config              Show current config status
 *   nuwa2life config --clear-key  Remove ElevenLabs API Key
 *   nuwa2life config --clear-token  Remove 7verse.ai token
 *   nuwa2life config --clear-all  Remove everything
 */
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { homedir } from 'os'
import { join } from 'path'
import { existsSync, rmSync } from 'fs'
import { loadConfig, saveConfig, getDefaultDistillMode, setDefaultDistillMode } from '../lib/config.js'
import { verifyApiKey } from '../lib/elevenlabs.js'
import { isCachedTokenValid } from '../lib/oauth.js'

const SKILL_DST   = join(homedir(), '.claude', 'skills', 'nuwa2life')
const CONFIG_FILE = join(homedir(), '.nuwa2life', 'config.json')

export async function config(args) {
  const clearKey    = args.includes('--clear-key')
  const clearToken  = args.includes('--clear-token')
  const clearAll    = args.includes('--clear-all')

  // ── Set distill mode ───────────────────────────────────────────────────────
  const distillIdx = args.indexOf('--set-distill-mode')
  if (distillIdx !== -1) {
    const mode = args[distillIdx + 1]
    console.log()
    p.intro(pc.bold('设置默认蒸馏深度'))
    try {
      setDefaultDistillMode(mode)
      p.outro(pc.green(`✓ 默认蒸馏深度已设为 ${pc.bold(mode)}`) +
        pc.dim(mode === 'simple'
          ? `  （快、吃轻调研，适合已知度高的人物）`
          : `  （慢、调 huashu-nuwa 全家桶，适合要可复用 perspective skill 的场景）`))
    } catch (e) {
      p.outro(pc.red('✗ ' + e.message))
      process.exit(1)
    }
    return
  }

  // ── Destructive flags — execute immediately with confirmation ──────────────
  if (clearAll) {
    console.log()
    p.intro(pc.bold('全清'))
    const confirm = await p.confirm({
      message: `${CONFIG_FILE} 和已装的 skill 一起删？这是个单程票`,
      initialValue: false,
    })
    if (p.isCancel(confirm) || !confirm) { p.outro('好，放过它'); return }
    saveConfig({ elevenlabsApiKey: '', sevenverseToken: '', setupComplete: false })
    if (existsSync(SKILL_DST)) rmSync(SKILL_DST, { recursive: true, force: true })
    p.outro(pc.green('✓ 一干二净。想再来一轮就 nuwa2life setup'))
    return
  }

  if (clearKey) {
    console.log()
    p.intro(pc.bold('清 ElevenLabs API Key'))
    const confirm = await p.confirm({
      message: '确认把已存的 Key 抹掉？',
      initialValue: false,
    })
    if (p.isCancel(confirm) || !confirm) { p.outro('好，不删'); return }
    saveConfig({ elevenlabsApiKey: '' })
    p.outro(pc.green('✓ Key 没了。要新的跑 nuwa2life setup'))
    return
  }

  if (clearToken) {
    console.log()
    p.intro(pc.bold('退 7verse.ai 登录'))
    const confirm = await p.confirm({
      message: '退出登录？',
      initialValue: false,
    })
    if (p.isCancel(confirm) || !confirm) { p.outro('好，留着'); return }
    saveConfig({ sevenverseToken: '' })
    p.outro(pc.green('✓ 退了。要重新登跑 nuwa2life login'))
    return
  }

  // ── Default: show config status ────────────────────────────────────────────
  console.log()
  p.intro(pc.bold('Nuwa2Life  ·  配置全家福'))

  const cfg = loadConfig()

  // ElevenLabs Key
  {
    const key = cfg.elevenlabsApiKey
    if (key) {
      const s = p.spinner()
      s.start('戳 ElevenLabs 看看 Key 还活着没...')
      const valid = await verifyApiKey(key)
      s.stop(
        valid
          ? `ElevenLabs Key      ${pc.green('✓ 活')}  ${pc.dim(maskKey(key))}`
          : `ElevenLabs Key      ${pc.red('✗ 死')}  ${pc.dim(maskKey(key))}`
      )
      if (!valid) p.log.warn(`${pc.cyan('nuwa2life config --clear-key')} 清掉后重配`)
    } else {
      p.log.warn(`ElevenLabs Key      ${pc.red('没设')}  →  ${pc.cyan('nuwa2life setup')}`)
    }
  }

  // 7verse Token
  {
    const token = cfg.sevenverseToken
    if (token) {
      const s = p.spinner()
      s.start('戳 7verse 看看 Token 还活着没...')
      const valid = await isCachedTokenValid()
      const savedAt = cfg.tokenSavedAt ? new Date(cfg.tokenSavedAt).toLocaleDateString('zh-CN') : '未知'
      s.stop(
        valid
          ? `7verse Token       ${pc.green('✓ 活')}  ${pc.dim(`(存于 ${savedAt})`)}`
          : `7verse Token       ${pc.red('✗ 过期了')}  ${pc.dim(`(存于 ${savedAt})`)}`
      )
      if (!valid) p.log.warn(`${pc.cyan('nuwa2life login')} 重登一下`)
    } else {
      p.log.warn(`7verse Token       ${pc.red('没登')}  →  ${pc.cyan('nuwa2life login')}`)
    }
  }

  // Skill install
  {
    const installed = existsSync(SKILL_DST)
    p.log.info(
      installed
        ? `Claude Code Skill   ${pc.green('✓ 已装')}  ${pc.dim(SKILL_DST)}`
        : `Claude Code Skill   ${pc.yellow('没装')}  →  运行 ${pc.cyan('nuwa2life setup')} 补上`
    )
  }

  // Default distill mode
  {
    const mode = getDefaultDistillMode()
    const tip = mode === 'simple'
      ? '快，~1-2 min，吃轻调研'
      : '慢，~5-15 min，调 huashu-nuwa 全家桶'
    p.log.info(`默认蒸馏深度       ${pc.green(mode)}  ${pc.dim(`(${tip})`)}`)
  }

  // Config file location
  p.log.info(pc.dim(`配置文件：${CONFIG_FILE}`))

  console.log()
  console.log(pc.dim('管理命令：'))
  console.log(`  ${pc.cyan('nuwa2life config --set-distill-mode simple|complete')}  改蒸馏深度`)
  console.log(`  ${pc.cyan('nuwa2life config --clear-key')}                          清 ElevenLabs Key`)
  console.log(`  ${pc.cyan('nuwa2life config --clear-token')}                        退 7verse 登录`)
  console.log(`  ${pc.cyan('nuwa2life config --clear-all')}                          全清（慎用）`)
  console.log()

  p.outro(pc.dim('想重头来一遍：nuwa2life setup'))
}

function maskKey(key) {
  if (!key || key.length < 8) return '***'
  return key.slice(0, 6) + '...' + key.slice(-4)
}

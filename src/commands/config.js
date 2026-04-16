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
import { loadConfig, saveConfig } from '../lib/config.js'
import { verifyApiKey } from '../lib/elevenlabs.js'
import { isCachedTokenValid } from '../lib/oauth.js'

const SKILL_DST   = join(homedir(), '.claude', 'skills', 'nuwa2life')
const CONFIG_FILE = join(homedir(), '.nuwa2life', 'config.json')

export async function config(args) {
  const clearKey    = args.includes('--clear-key')
  const clearToken  = args.includes('--clear-token')
  const clearAll    = args.includes('--clear-all')

  // ── Destructive flags — execute immediately with confirmation ──────────────
  if (clearAll) {
    console.log()
    p.intro(pc.bold('清除全部配置'))
    const confirm = await p.confirm({
      message: `删除 ${CONFIG_FILE} 和已安装的 Skill？`,
      initialValue: false,
    })
    if (p.isCancel(confirm) || !confirm) { p.outro('已取消'); return }
    saveConfig({ elevenlabsApiKey: '', sevenverseToken: '', setupComplete: false })
    if (existsSync(SKILL_DST)) rmSync(SKILL_DST, { recursive: true, force: true })
    p.outro(pc.green('✓ 已清除全部配置。运行 nuwa2life setup 重新初始化。'))
    return
  }

  if (clearKey) {
    console.log()
    p.intro(pc.bold('清除 ElevenLabs API Key'))
    const confirm = await p.confirm({
      message: '确认删除已保存的 ElevenLabs API Key？',
      initialValue: false,
    })
    if (p.isCancel(confirm) || !confirm) { p.outro('已取消'); return }
    saveConfig({ elevenlabsApiKey: '' })
    p.outro(pc.green('✓ API Key 已清除。运行 nuwa2life setup 重新配置。'))
    return
  }

  if (clearToken) {
    console.log()
    p.intro(pc.bold('清除 7verse.ai Token'))
    const confirm = await p.confirm({
      message: '确认退出 7verse.ai 登录？',
      initialValue: false,
    })
    if (p.isCancel(confirm) || !confirm) { p.outro('已取消'); return }
    saveConfig({ sevenverseToken: '' })
    p.outro(pc.green('✓ Token 已清除。运行 nuwa2life login 重新登录。'))
    return
  }

  // ── Default: show config status ────────────────────────────────────────────
  console.log()
  p.intro(pc.bold('Nuwa2Life  ·  当前配置'))

  const cfg = loadConfig()

  // ElevenLabs Key
  {
    const key = cfg.elevenlabsApiKey
    if (key) {
      const s = p.spinner()
      s.start('验证 ElevenLabs API Key...')
      const valid = await verifyApiKey(key)
      s.stop(
        valid
          ? `ElevenLabs API Key  ${pc.green('✓ 有效')}  ${pc.dim(maskKey(key))}`
          : `ElevenLabs API Key  ${pc.red('✗ 无效')}  ${pc.dim(maskKey(key))}`
      )
      if (!valid) p.log.warn(`运行 ${pc.cyan('nuwa2life config --clear-key')} 清除后重新设置`)
    } else {
      p.log.warn(`ElevenLabs API Key  ${pc.red('未设置')}  →  运行 ${pc.cyan('nuwa2life setup')} 配置`)
    }
  }

  // 7verse Token
  {
    const token = cfg.sevenverseToken
    if (token) {
      const s = p.spinner()
      s.start('验证 7verse.ai 登录状态...')
      const valid = await isCachedTokenValid()
      const savedAt = cfg.tokenSavedAt ? new Date(cfg.tokenSavedAt).toLocaleDateString('zh-CN') : '未知'
      s.stop(
        valid
          ? `7verse.ai Token     ${pc.green('✓ 有效')}  ${pc.dim(`(保存于 ${savedAt})`)}`
          : `7verse.ai Token     ${pc.red('✗ 已过期')}  ${pc.dim(`(保存于 ${savedAt})`)}`
      )
      if (!valid) p.log.warn(`运行 ${pc.cyan('nuwa2life login')} 重新登录`)
    } else {
      p.log.warn(`7verse.ai Token     ${pc.red('未登录')}  →  运行 ${pc.cyan('nuwa2life login')} 登录`)
    }
  }

  // Skill install
  {
    const installed = existsSync(SKILL_DST)
    p.log.info(
      installed
        ? `Claude Code Skill   ${pc.green('✓ 已安装')}  ${pc.dim(SKILL_DST)}`
        : `Claude Code Skill   ${pc.yellow('未安装')}  →  运行 ${pc.cyan('nuwa2life setup')} 安装`
    )
  }

  // Config file location
  p.log.info(pc.dim(`配置文件：${CONFIG_FILE}`))

  console.log()
  console.log(pc.dim('管理命令：'))
  console.log(`  ${pc.cyan('nuwa2life config --clear-key')}    清除 ElevenLabs API Key`)
  console.log(`  ${pc.cyan('nuwa2life config --clear-token')}  退出 7verse.ai 登录`)
  console.log(`  ${pc.cyan('nuwa2life config --clear-all')}    清除全部配置`)
  console.log()

  p.outro(pc.dim('运行 nuwa2life setup 可重新初始化所有配置项'))
}

function maskKey(key) {
  if (!key || key.length < 8) return '***'
  return key.slice(0, 6) + '...' + key.slice(-4)
}

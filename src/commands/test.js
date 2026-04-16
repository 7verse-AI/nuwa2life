/**
 * nuwa2life test — verify all API connections
 */
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { getConfigValue } from '../lib/config.js'
import { verifyApiKey } from '../lib/elevenlabs.js'
import { isCachedTokenValid, verifyToken, getCachedToken } from '../lib/oauth.js'
import { uploadFile } from '../lib/sevenverse.js'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const CHECK = pc.green('✓')
const FAIL  = pc.red('✗')
const SKIP  = pc.dim('–')

export async function test(args) {
  const isDryRun = args.includes('--dry-run')

  console.log()
  p.intro(pc.bold('API 连通性测试') + (isDryRun ? pc.dim(' (dry-run)') : ''))

  const results = []

  // T1: ElevenLabs API Key
  {
    const key = getConfigValue('elevenlabsApiKey')
    if (!key) {
      results.push([FAIL, 'ElevenLabs API Key', '未配置 — 运行 nuwa2life setup'])
    } else if (isDryRun) {
      results.push([SKIP, 'ElevenLabs API Key', `已配置 (${maskKey(key)}) — dry-run 跳过验证`])
    } else {
      const s = p.spinner()
      s.start('验证 ElevenLabs API Key...')
      const ok = await verifyApiKey(key)
      s.stop('')
      results.push([ok ? CHECK : FAIL, 'ElevenLabs API Key',
        ok ? `有效 (${maskKey(key)})` : '无效 — 请检查 Key 或运行 nuwa2life setup 重新配置'])
    }
  }

  // T2: 7verse.ai Token
  {
    const token = getCachedToken()
    if (!token) {
      results.push([FAIL, '7verse.ai Token', '未登录 — 运行 nuwa2life login'])
    } else if (isDryRun) {
      results.push([SKIP, '7verse.ai Token', `已保存 — dry-run 跳过验证`])
    } else {
      const s = p.spinner()
      s.start('验证 7verse.ai Token...')
      const ok = await isCachedTokenValid()
      s.stop('')
      results.push([ok ? CHECK : FAIL, '7verse.ai Token',
        ok ? '有效' : '已过期 — 运行 nuwa2life login 重新登录'])
    }
  }

  // T3: 7verse.ai Storage Upload (with tiny PNG)
  if (!isDryRun) {
    const token = getCachedToken()
    if (token) {
      const s = p.spinner()
      s.start('测试 7verse.ai 存储上传...')
      try {
        const tmpFile = join(tmpdir(), 'nuwa2life-test.png')
        // 1x1 white PNG
        const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
        writeFileSync(tmpFile, PNG)
        const { url } = await uploadFile(tmpFile, 'image/png')
        unlinkSync(tmpFile)
        s.stop('')
        results.push([CHECK, '7verse.ai 存储上传', `✓ ${url.substring(0, 60)}...`])
      } catch (e) {
        s.stop('')
        results.push([FAIL, '7verse.ai 存储上传', e.message])
      }
    } else {
      results.push([SKIP, '7verse.ai 存储上传', '跳过（未登录）'])
    }
  } else {
    results.push([SKIP, '7verse.ai 存储上传', 'dry-run 跳过'])
  }

  // ── Print Results ──────────────────────────────────────────────────────────
  console.log()
  const maxLabel = Math.max(...results.map(r => r[1].length))
  for (const [icon, label, detail] of results) {
    const pad = label.padEnd(maxLabel)
    console.log(`  ${icon}  ${pc.bold(pad)}  ${pc.dim(detail)}`)
  }
  console.log()

  const failed = results.filter(r => r[0] === FAIL)
  if (failed.length === 0) {
    p.outro(pc.green('✓ 所有测试通过'))
  } else {
    p.outro(pc.red(`✗ ${failed.length} 项失败，请按上方提示修复`))
    process.exit(1)
  }
}

function maskKey(key) {
  if (!key || key.length < 8) return '***'
  return key.substring(0, 6) + '...' + key.slice(-4)
}

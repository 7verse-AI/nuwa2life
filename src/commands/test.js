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
  p.intro(pc.bold('API 体检') + (isDryRun ? pc.dim(' (dry-run · 只看配置)') : ''))

  const results = []

  // T1: ElevenLabs API Key
  {
    const key = getConfigValue('elevenlabsApiKey')
    if (!key) {
      results.push([FAIL, 'ElevenLabs Key', '没设 — nuwa2life setup'])
    } else if (isDryRun) {
      results.push([SKIP, 'ElevenLabs Key', `有 (${maskKey(key)}) — dry-run 不戳`])
    } else {
      const s = p.spinner()
      s.start('戳 ElevenLabs...')
      const ok = await verifyApiKey(key)
      s.stop('')
      results.push([ok ? CHECK : FAIL, 'ElevenLabs Key',
        ok ? `通 (${maskKey(key)})` : '不通 — 检查 Key / nuwa2life setup 重配'])
    }
  }

  // T2: 7verse.ai Token
  {
    const token = getCachedToken()
    if (!token) {
      results.push([FAIL, '7verse Token', '没登 — nuwa2life login'])
    } else if (isDryRun) {
      results.push([SKIP, '7verse Token', `存着 — dry-run 不戳`])
    } else {
      const s = p.spinner()
      s.start('戳 7verse Token...')
      const ok = await isCachedTokenValid()
      s.stop('')
      results.push([ok ? CHECK : FAIL, '7verse Token',
        ok ? '通' : '过期了 — nuwa2life login 重登'])
    }
  }

  // T3: 7verse.ai Storage Upload (with tiny PNG)
  if (!isDryRun) {
    const token = getCachedToken()
    if (token) {
      const s = p.spinner()
      s.start('试传一张 1x1 PNG 到 7verse 存储...')
      try {
        const tmpFile = join(tmpdir(), 'nuwa2life-test.png')
        // 1x1 white PNG
        const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
        writeFileSync(tmpFile, PNG)
        const { url } = await uploadFile(tmpFile, 'image/png')
        unlinkSync(tmpFile)
        s.stop('')
        results.push([CHECK, '7verse 存储', `✓ ${url.substring(0, 60)}...`])
      } catch (e) {
        s.stop('')
        results.push([FAIL, '7verse 存储', e.message])
      }
    } else {
      results.push([SKIP, '7verse 存储', '跳过（没登）'])
    }
  } else {
    results.push([SKIP, '7verse 存储', 'dry-run 不传'])
  }

  // ── Print Results ──────────────────────────────────────────────────────────
  console.log()
  const maxLabel = Math.max(...results.map(r => r[1].length))
  for (const [icon, label, detail] of results) {
    const pad = label.padEnd(maxLabel)
    console.log(`  ${icon}  ${pc.bold(pad)}  ${pc.dim(detail)}`)
  }
  console.log()

  console.log(pc.dim(`  配置: ~/.nuwa2life/config.json`))
  console.log()

  const failed = results.filter(r => r[0] === FAIL)
  if (failed.length === 0) {
    p.outro(pc.green('✓ 全绿，起飞'))
  } else {
    p.outro(pc.red(`✗ ${failed.length} 项挂了，照上面的提示修`))
    process.exit(1)
  }
}

function maskKey(key) {
  if (!key || key.length < 8) return '***'
  return key.substring(0, 6) + '...' + key.slice(-4)
}

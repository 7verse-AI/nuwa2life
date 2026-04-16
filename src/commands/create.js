/**
 * nuwa2life create <name> — create a character directly from CLI
 * (without Claude Code — useful for debugging and scripting)
 *
 * This command is also used internally by the Claude Code skill
 * after it has already done the distillation + image search.
 */
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs'
import { join, extname, resolve as resolvePath } from 'path'
import { getCacheDir, getConfigValue } from '../lib/config.js'
import { validateAudioFile, cloneVoice } from '../lib/elevenlabs.js'
import { uploadFile, upsertCharacter } from '../lib/sevenverse.js'
import { isCachedTokenValid } from '../lib/oauth.js'
import { default as open } from 'open'

export async function create(args) {
  const name = args.join(' ').trim()

  console.log()
  p.intro(pc.bold(`创建角色：${name || '(交互模式)'}`))

  // ── Guard checks ──────────────────────────────────────────────────────────
  const apiKey = getConfigValue('elevenlabsApiKey')
  if (!apiKey) {
    p.log.error('ElevenLabs API Key 未配置')
    p.outro(`运行 ${pc.cyan('nuwa2life setup')} 完成初始化`)
    process.exit(1)
  }

  const tokenOk = await isCachedTokenValid()
  if (!tokenOk) {
    p.log.error('7verse.ai 登录已过期')
    p.outro(`运行 ${pc.cyan('nuwa2life login')} 刷新登录`)
    process.exit(1)
  }

  // ── Confirm name ──────────────────────────────────────────────────────────
  let charName = name
  if (!charName) {
    charName = await p.text({
      message: '你想跟谁对话？',
      placeholder: 'Steve Jobs',
      validate: v => (!v?.trim() ? '请输入人物名' : undefined),
    })
    if (p.isCancel(charName)) { p.cancel('已取消'); process.exit(0) }
    charName = charName.trim()
  }

  const slug = toSlug(charName)
  const cacheDir = getCacheDir(slug)

  // ── Load or remind about distill.json ────────────────────────────────────
  const distillPath = join(cacheDir, 'distill.json')
  let distill

  if (existsSync(distillPath)) {
    try {
      distill = JSON.parse(readFileSync(distillPath, 'utf8'))
      p.log.success(`加载已有人设: ${distillPath}`)
    } catch {
      p.log.warn('distill.json 损坏，将重新生成')
    }
  }

  if (!distill) {
    p.log.warn(`未找到 ${distillPath}`)
    p.log.info('提示：在 Claude Code 里说「我想跟 ' + charName + ' 对话」可自动生成人设')
    p.log.info('或者手动创建 distill.json，格式参考：')
    console.log(pc.dim(JSON.stringify(DISTILL_SCHEMA_EXAMPLE, null, 2).split('\n').slice(0, 8).join('\n') + '\n  ...'))
    p.outro('请先生成 distill.json 再运行此命令')
    process.exit(1)
  }

  // ── Audio input ───────────────────────────────────────────────────────────
  p.log.step(pc.bold(`音频  —  ${charName} 的声音样本`))
  p.log.info('把 mp3/wav/m4a 文件拖拽到终端，路径会自动填入')
  p.log.info('建议 30 秒以上、无背景音乐、< 10MB')

  // Check if voice already cloned
  const voiceJsonPath = join(cacheDir, 'voice.json')
  let voiceId

  if (existsSync(voiceJsonPath)) {
    const v = JSON.parse(readFileSync(voiceJsonPath, 'utf8'))
    if (v.voiceId) {
      const reuse = await p.confirm({
        message: `检测到已克隆的音色 (${v.voiceId})，直接使用？`,
        initialValue: true,
      })
      if (!p.isCancel(reuse) && reuse) voiceId = v.voiceId
    }
  }

  if (!voiceId) {
    let audioPath
    while (true) {
      const raw = await p.text({
        message: '粘贴音频文件路径（或直接拖拽文件到终端）：',
        validate(v) {
          if (!v?.trim()) return '请提供音频文件路径'
          const clean = cleanPath(v.trim())
          const check = validateAudioFile(clean)
          if (!check.ok) return check.error
        },
      })
      if (p.isCancel(raw)) { p.cancel('已取消'); process.exit(0) }
      audioPath = cleanPath(raw.trim())
      break
    }

    // Copy audio to cache
    const audioExt = extname(audioPath).toLowerCase()
    const cachedAudio = join(cacheDir, `voice${audioExt}`)
    copyFileSync(audioPath, cachedAudio)

    const s = p.spinner()
    s.start(`克隆 ${charName} 的音色...`)
    try {
      const result = await cloneVoice({
        audioPath: cachedAudio,
        voiceName: charName,
        description: distill.voice_description || '',
      })
      voiceId = result.voiceId
      writeFileSync(voiceJsonPath, JSON.stringify(result, null, 2))
      s.stop(pc.green(`✓ 音色克隆成功  voice_id: ${voiceId}`))
    } catch (e) {
      s.stop(pc.red('✗ 音色克隆失败'))
      p.log.error(e.message)
      process.exit(1)
    }
  }

  // ── Portrait ──────────────────────────────────────────────────────────────
  p.log.step(pc.bold('首帧图  —  上传到 7verse 存储'))

  const portraitCosPath = join(cacheDir, 'portrait_cos.json')
  let portraitUrl

  if (existsSync(portraitCosPath)) {
    const pc2 = JSON.parse(readFileSync(portraitCosPath, 'utf8'))
    if (pc2.url) {
      const reuse = await p.confirm({
        message: `检测到已上传的首帧图，直接使用？`,
        initialValue: true,
      })
      if (!p.isCancel(reuse) && reuse) portraitUrl = pc2.url
    }
  }

  if (!portraitUrl) {
    const portraitLocalPath = join(cacheDir, 'portrait.jpg')
    let uploadSource = existsSync(portraitLocalPath) ? portraitLocalPath : null

    if (!uploadSource) {
      const raw = await p.text({
        message: '提供首帧图路径（Claude Code 自动搜图后会自动跳过此步）：',
        placeholder: '/path/to/portrait.jpg',
        validate(v) {
          if (!v?.trim()) return '请提供图片路径'
          if (!existsSync(cleanPath(v.trim()))) return '文件不存在'
        },
      })
      if (p.isCancel(raw)) { p.cancel('已取消'); process.exit(0) }
      uploadSource = cleanPath(raw.trim())
    }

    const s = p.spinner()
    s.start('上传首帧图...')
    try {
      const result = await uploadFile(uploadSource, 'image/jpeg')
      portraitUrl = result.url
      writeFileSync(portraitCosPath, JSON.stringify(result, null, 2))
      s.stop(pc.green(`✓ 上传成功`))
    } catch (e) {
      s.stop(pc.red('✗ 上传失败'))
      p.log.error(e.message)
      process.exit(1)
    }
  }

  // ── Upsert Character ──────────────────────────────────────────────────────
  p.log.step(pc.bold('注册角色'))

  const s = p.spinner()
  s.start(`在 7verse.ai 注册 ${charName}...`)
  let charResult
  try {
    charResult = await upsertCharacter({ distill, voiceId, portraitUrl })
    writeFileSync(join(cacheDir, 'upsert_response.json'), JSON.stringify(charResult, null, 2))
    s.stop(pc.green(`✓ 角色注册成功`))
  } catch (e) {
    s.stop(pc.red('✗ 注册失败'))
    p.log.error(e.message)
    process.exit(1)
  }

  // ── Open in browser ───────────────────────────────────────────────────────
  if (charResult.characterUrl) {
    open(charResult.characterUrl)
  }

  p.outro(pc.bold(pc.green(`✓ ${charName} 已活体化！`)))
  console.log()
  console.log(`  角色 ID   ${pc.cyan(charResult.characterId)}`)
  console.log(`  对话页面  ${pc.cyan(charResult.characterUrl)}`)
  console.log()
  console.log(pc.dim(`  本地缓存: ${cacheDir}`))
  console.log()
}

// ── utils ─────────────────────────────────────────────────────────────────────

function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]/g, '')
    .replace(/-+/g, '-')
    .trim('-') || 'character'
}

function cleanPath(raw) {
  // Handle shell-escaped paths (from drag-and-drop)
  return resolvePath(raw.replace(/\\ /g, ' ').replace(/^~/, process.env.HOME || '~'))
}

const DISTILL_SCHEMA_EXAMPLE = {
  name: 'Steve Jobs',
  persona: '4-6 paragraphs describing personality, background, communication style...',
  environment: 'You are wearing a black mock turtleneck...',
  opening_dialogs: [
    { dialog: '...', motion_prompt: '...' },
  ],
  listening_pose: { dialog: '', motion_prompt: '...' },
  static_summary: 'A lean man with short salt-and-pepper hair...',
  portrait_search_query: 'Steve Jobs black turtleneck keynote portrait',
  voice_description: 'Measured American male voice...',
}

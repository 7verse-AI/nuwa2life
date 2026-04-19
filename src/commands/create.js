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
import { validateAudioFile, cloneVoice, selectBestPremadeVoice, pickFallbackVoice, verifyApiKey } from '../lib/elevenlabs.js'
import { uploadFile, upsertCharacter, registerContent } from '../lib/sevenverse.js'
import { isCachedTokenValid } from '../lib/oauth.js'
import { homedir } from 'os'
import { default as open } from 'open'

// Non-TTY: running inside Claude Code or a pipe — skip interactive prompts
const isTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY)

export async function create(args) {
  const name = args.join(' ').trim()

  console.log()
  p.intro(pc.bold(`搓一个：${name || '(交互模式)'}`))

  // ── Guard checks ──────────────────────────────────────────────────────────
  // ElevenLabs 不是硬门槛——Key 缺/失效就走内置 fallback 音色
  const apiKey = getConfigValue('elevenlabsApiKey')
  let useVoiceFallback = false
  if (!apiKey) {
    p.log.warn('ElevenLabs Key 没设，音色走内置 fallback（按人设里性别/年龄自动挑）')
    useVoiceFallback = true
  } else {
    const keyAlive = await verifyApiKey(apiKey)
    if (!keyAlive) {
      p.log.warn('ElevenLabs Key 戳不通，音色走内置 fallback')
      useVoiceFallback = true
    }
  }

  // 7verse 是硬门槛——没它啥也上不了线
  const tokenOk = await isCachedTokenValid()
  if (!tokenOk) {
    p.log.error('7verse 登录挂了')
    p.outro(`去终端跑 ${pc.cyan('nuwa2life login')} 刷一下`)
    process.exit(1)
  }

  // ── Confirm name ──────────────────────────────────────────────────────────
  let charName = name
  if (!charName) {
    charName = await p.text({
      message: '跟谁聊？',
      placeholder: 'Steve Jobs',
      validate: v => (!v?.trim() ? '总得给个名字吧' : undefined),
    })
    if (p.isCancel(charName)) { p.cancel('撤了'); process.exit(0) }
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
      p.log.success(`读到现成人设: ${distillPath}`)
    } catch {
      p.log.warn('distill.json 坏了，重来一遍')
    }
  }

  if (!distill) {
    p.log.warn(`没找到 ${distillPath}`)
    p.log.info('回 Claude Code 里说「我想跟 ' + charName + ' 聊聊」，自动生成人设')
    p.log.info('或者手动造一个 distill.json，长这样：')
    console.log(pc.dim(JSON.stringify(DISTILL_SCHEMA_EXAMPLE, null, 2).split('\n').slice(0, 8).join('\n') + '\n  ...'))
    p.outro('先把 distill.json 弄好再来')
    process.exit(1)
  }

  // ── Audio / Voice ─────────────────────────────────────────────────────────
  p.log.step(pc.bold(`音色  —  ${charName} 的声音`))

  const voiceJsonPath = join(cacheDir, 'voice.json')
  let voiceId

  // Fast path: voice.json already exists — reuse without prompting in non-TTY
  if (existsSync(voiceJsonPath)) {
    const v = JSON.parse(readFileSync(voiceJsonPath, 'utf8'))
    if (v.voiceId) {
      if (isTTY) {
        const reuse = await p.confirm({
          message: `已经有音色了 (${v.voiceName || v.voiceId})，直接用？`,
          initialValue: true,
        })
        if (!p.isCancel(reuse) && reuse) voiceId = v.voiceId
      } else {
        voiceId = v.voiceId
        p.log.success(`复用音色: ${v.voiceName || v.voiceId}`)
      }
    }
  }

  if (!voiceId) {
    // Fast path B: no ElevenLabs Key → go straight to fallback premade
    if (useVoiceFallback) {
      const pick = pickFallbackVoice(distill.voice_description || '', distill.persona || '')
      voiceId = pick.voiceId
      writeFileSync(voiceJsonPath, JSON.stringify(pick, null, 2))
      p.log.success(pc.green(`✓ 用内置音色: ${pick.voiceName}`) +
        pc.dim(`  (${pick.label} · ${pick.voiceId})`))
    } else {
      // Find cached audio file
      let cachedAudio = null
      for (const ext of ['.mp3', '.wav', '.m4a', '.flac', '.ogg']) {
        const candidate = join(cacheDir, `voice${ext}`)
        if (existsSync(candidate)) { cachedAudio = candidate; break }
      }

      // In TTY mode: prompt for audio path if not cached
      if (!cachedAudio && isTTY) {
        p.log.info('拖段 mp3/wav/m4a 进来，路径自动填入')
        p.log.info('30 秒起步，无背景音乐，< 10MB')
        const raw = await p.text({
          message: '粘贴音频路径（或直接拖文件进来）：',
          validate(v) {
            if (!v?.trim()) return '来个文件路径'
            const clean = cleanPath(v.trim())
            const check = validateAudioFile(clean)
            if (!check.ok) return check.error
          },
        })
        if (p.isCancel(raw)) { p.cancel('撤了'); process.exit(0) }
        const srcPath = cleanPath(raw.trim())
        const audioExt = extname(srcPath).toLowerCase()
        cachedAudio = join(cacheDir, `voice${audioExt}`)
        copyFileSync(srcPath, cachedAudio)
      }

      if (cachedAudio) {
        // Try voice cloning; fall back to premade on subscription error
        const s = p.spinner()
        s.start(`克隆 ${charName} 的声音...`)
        try {
          const result = await cloneVoice({
            audioPath: cachedAudio,
            voiceName: charName,
            description: distill.voice_description || '',
          })
          voiceId = result.voiceId
          writeFileSync(voiceJsonPath, JSON.stringify(result, null, 2))
          s.stop(pc.green(`✓ 克隆好了  voice_id: ${voiceId}`))
        } catch (e) {
          if (e.code === 'SUBSCRIPTION_REQUIRED') {
            s.stop(pc.yellow(`⚠ ${e.message}`))
            p.log.info('换内置声音...')
            const result = await pickOrSelectPremade(distill)
            voiceId = result.voiceId
            writeFileSync(voiceJsonPath, JSON.stringify(result, null, 2))
            p.log.success(pc.green(`✓ 用内置音色: ${result.voiceName}`))
          } else {
            s.stop(pc.red('✗ 克隆失败'))
            p.log.error(e.message)
            process.exit(1)
          }
        }
      } else {
        // Non-TTY, no cached audio — pick best premade voice automatically
        p.log.warn('没音频样本，从内置里挑一个')
        const result = await pickOrSelectPremade(distill)
        voiceId = result.voiceId
        writeFileSync(voiceJsonPath, JSON.stringify(result, null, 2))
        p.log.success(pc.green(`✓ 用内置音色: ${result.voiceName}`))
      }
    }
  }

  // ── Portrait ──────────────────────────────────────────────────────────────
  p.log.step(pc.bold('首帧图  —  传到 7verse'))

  const portraitCosPath = join(cacheDir, 'portrait_cos.json')
  let portraitUrl

  if (existsSync(portraitCosPath)) {
    const pc2 = JSON.parse(readFileSync(portraitCosPath, 'utf8'))
    if (pc2.url) {
      if (isTTY) {
        const reuse = await p.confirm({
          message: `已经传过图了，直接用？`,
          initialValue: true,
        })
        if (!p.isCancel(reuse) && reuse) portraitUrl = pc2.url
      } else {
        portraitUrl = pc2.url
        p.log.success(`复用已传的图`)
      }
    }
  }

  if (!portraitUrl) {
    const portraitLocalPath = join(cacheDir, 'portrait.jpg')
    let uploadSource = existsSync(portraitLocalPath) ? portraitLocalPath : null

    if (!uploadSource) {
      const raw = await p.text({
        message: '给张首帧图（Claude Code 搜过图就跳过这步）：',
        placeholder: '/path/to/portrait.jpg',
        validate(v) {
          if (!v?.trim()) return '来个图片路径'
          if (!existsSync(cleanPath(v.trim()))) return '这路径是编的吧，文件不存在'
        },
      })
      if (p.isCancel(raw)) { p.cancel('撤了'); process.exit(0) }
      uploadSource = cleanPath(raw.trim())
    }

    const s = p.spinner()
    s.start('传图...')
    try {
      const result = await uploadFile(uploadSource, 'image/jpeg')
      portraitUrl = result.url
      writeFileSync(portraitCosPath, JSON.stringify(result, null, 2))
      s.stop(pc.green(`✓ 传好了`))
    } catch (e) {
      s.stop(pc.red('✗ 没传上'))
      p.log.error(e.message)
      process.exit(1)
    }
  }

  // ── Upsert Character ──────────────────────────────────────────────────────
  p.log.step(pc.bold('注册角色'))

  const s = p.spinner()
  s.start(`把 ${charName} 塞进 7verse...`)
  let charResult
  try {
    charResult = await upsertCharacter({ distill, voiceId, portraitUrl })
    writeFileSync(join(cacheDir, 'upsert_response.json'), JSON.stringify(charResult, null, 2))
    s.stop(pc.green(`✓ 注册成功  character_id: ${charResult.characterId}`))
  } catch (e) {
    s.stop(pc.red('✗ 注册失败'))
    p.log.error(e.message)
    process.exit(1)
  }

  // ── Register Content ──────────────────────────────────────────────────────
  p.log.step(pc.bold('发布 Content（开播要这个）'))

  const sc = p.spinner()
  sc.start('造 Content 记录...')
  let contentResult
  try {
    contentResult = await registerContent({
      characterId: charResult.characterId,
      name: distill.name || charName,
      description: distill.persona ? distill.persona.slice(0, 200) : charName,
      portraitUrl,
    })
    writeFileSync(join(cacheDir, 'content_response.json'), JSON.stringify(contentResult, null, 2))
    sc.stop(pc.green(`✓ Content 发布  content_id: ${contentResult.contentId}`))
  } catch (e) {
    sc.stop(pc.yellow(`⚠ Content 注册没过（角色已建，可手动补）: ${e.message}`))
  }

  // ── Live URL ──────────────────────────────────────────────────────────────
  const liveUrl = contentResult?.contentId
    ? `${(process.env.SEVENVERSE_BASE || 'https://7verse.ai').replace(/\/+$/, '')}/content/${contentResult.contentId}/live?auto_start=1`
    : charResult.characterUrl

  // ── Big Loud Finish ───────────────────────────────────────────────────────
  console.log()
  console.log(pc.bold(pc.green(`  🎬  ${charName} 已上线！现在可以视频通话了`)))
  console.log()
  console.log(`     角色 ID    ${pc.cyan(charResult.characterId)}`)
  if (contentResult?.contentId) {
    console.log(`     Content ID ${pc.cyan(contentResult.contentId)}`)
  }
  console.log(`     对话页面   ${pc.cyan(liveUrl)}`)
  console.log()

  // Persist the live URL so the outer skill can pick it up if non-TTY
  if (liveUrl) {
    try {
      writeFileSync(join(cacheDir, 'live_url.txt'), liveUrl + '\n')
    } catch { /* non-fatal */ }
  }

  // ── Exit options ──────────────────────────────────────────────────────────
  if (isTTY) {
    const choice = await p.select({
      message: '怎么聊？',
      initialValue: 'web',
      options: [
        { value: 'web',      label: '[2] 网页视频通话', hint: '默认 · 能看脸能听声 · 按 Enter' },
        { value: 'terminal', label: '[1] 终端文字对话', hint: '即时纯文本 · 用 distill.json 拼临时角色' },
      ],
    })

    if (p.isCancel(choice) || choice === 'web') {
      if (liveUrl) open(liveUrl)
      p.outro(pc.bold(pc.green(`浏览器里见 → ${liveUrl}`)))
    } else {
      const perspectivePath = join(homedir(), '.claude', 'skills', `${toSlug(charName)}-perspective`)
      const hasPerspective = existsSync(perspectivePath)
      console.log()
      if (hasPerspective) {
        console.log(pc.bold(`  有 perspective skill，回 Claude Code 里：`))
        console.log()
        console.log(`    ${pc.cyan(`/skill ${toSlug(charName)}-perspective`)}`)
        console.log()
        console.log(pc.dim(`  或者直接对 ${charName} 说话，skill 会自己激活。`))
      } else {
        console.log(pc.bold(`  回 Claude Code 里对 ${charName} 说话就行。`))
        console.log()
        console.log(pc.dim(`  本次是 simple 蒸馏（没有 perspective skill）。nuwa2life skill 会读 distill.json 接管角色扮演。`))
        console.log(pc.dim(`  想要更深的 perspective skill？跑 complete 模式：nuwa2life config --set-distill-mode complete`))
      }
      console.log()
      p.outro(pc.dim(`  网页视频随时回来：${liveUrl}`))
    }
  } else {
    // Non-TTY: skill invoked us via Bash. Auto-open + skill will show its own 1/2 prompt.
    if (liveUrl) open(liveUrl)
    p.outro(pc.bold(pc.green(`🎬 ${charName} 已上线，可以视频通话了！`)))
  }

  console.log(pc.dim(`  缓存在 ${cacheDir}`))
  console.log()
}

// ── Premade voice helper ──────────────────────────────────────────────────────
// Tries the smart selectBestPremadeVoice (needs valid API key).
// Silently degrades to pickFallbackVoice (no API) on any failure.
async function pickOrSelectPremade(distill) {
  try {
    return await selectBestPremadeVoice(distill.voice_description || '')
  } catch {
    return pickFallbackVoice(distill.voice_description || '', distill.persona || '')
  }
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

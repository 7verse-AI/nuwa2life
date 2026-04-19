/**
 * ElevenLabs API — voice cloning from a local audio file.
 */
import https from 'https'
import { readFileSync, statSync } from 'fs'
import { basename, extname } from 'path'
import { getConfigValue } from './config.js'

const API_BASE = 'api.elevenlabs.io'
const SUPPORTED_EXTS = new Set(['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.aac', '.mp4'])
const MAX_BYTES = 10 * 1024 * 1024  // 10MB

export function validateAudioFile(filePath) {
  const ext = extname(filePath).toLowerCase()
  if (!SUPPORTED_EXTS.has(ext)) {
    return { ok: false, error: `不支持的格式 ${ext}，请使用 mp3 / wav / m4a / flac / ogg` }
  }
  let size
  try { size = statSync(filePath).size } catch { return { ok: false, error: `文件不存在: ${filePath}` } }
  if (size > MAX_BYTES) {
    return { ok: false, error: `文件过大 (${(size/1024/1024).toFixed(1)}MB)，ElevenLabs 上限 10MB，请截取片段` }
  }
  if (size < 1024) {
    return { ok: false, error: `文件太小 (${size} bytes)，请提供至少 30 秒的真实音频` }
  }
  return { ok: true, size, ext }
}

export async function cloneVoice({ audioPath, voiceName, description = '' }) {
  const apiKey = getConfigValue('elevenlabsApiKey')
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY 未配置，请先运行 nuwa2life setup')

  const validation = validateAudioFile(audioPath)
  if (!validation.ok) throw new Error(validation.error)

  const fileData  = readFileSync(audioPath)
  const fileName  = basename(audioPath)
  const mimeType  = getMime(extname(audioPath).toLowerCase())
  const boundary  = '----NuwaLifeEL' + Date.now()

  const body = buildMultipart(boundary, [
    { name: 'name',                    value: voiceName.trim() },
    { name: 'description',             value: description.trim() },
    { name: 'remove_background_noise', value: 'true' },
  ], [
    { name: 'files', filename: fileName, data: fileData, type: mimeType },
  ])

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: API_BASE,
      path: '/v1/voices/add',
      method: 'POST',
      headers: {
        'Content-Type':   `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        'xi-api-key':     apiKey,
      },
    }, (res) => {
      let raw = ''
      res.on('data', d => raw += d)
      res.on('end', () => {
        let parsed
        try { parsed = JSON.parse(raw) } catch { parsed = {} }
        if (res.statusCode !== 200) {
          const msg = parsed.detail?.message || parsed.detail || raw
          if (res.statusCode === 422) reject(new Error(`音频无效 (422): ${msg}\n提示：音频需至少 30 秒，尽量干净无背景音乐`))
          else if (res.statusCode === 401) reject(new Error('ElevenLabs API Key 无效，请重新运行 nuwa2life setup'))
          else if (res.statusCode === 429) reject(new Error('ElevenLabs 配额已用完，请升级套餐或等待重置'))
          else if (res.statusCode === 400 && String(msg).toLowerCase().includes('subscription')) {
            const err = new Error('当前套餐不支持音色克隆，需升级到 Starter+ 计划')
            err.code = 'SUBSCRIPTION_REQUIRED'
            reject(err)
          }
          else reject(new Error(`ElevenLabs 错误 ${res.statusCode}: ${msg}`))
          return
        }
        const voiceId = (parsed.voice_id || '').trim()
        if (!voiceId) { reject(new Error(`ElevenLabs 未返回 voice_id: ${raw}`)); return }
        resolve({ voiceId, voiceName: voiceName.trim(), vendor: 'elevenlabs' })
      })
    })
    req.on('error', reject)
    req.setTimeout(120_000, () => { req.destroy(); reject(new Error('ElevenLabs 请求超时 (120s)')) })
    req.write(body)
    req.end()
  })
}

/**
 * Fetch premade voices and pick the best match for a voice description.
 * Parses description for gender/age/accent hints, scores candidates by labels.
 */
export async function selectBestPremadeVoice(voiceDescription = '') {
  const apiKey = getConfigValue('elevenlabsApiKey')
  const voices = await new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: API_BASE, path: '/v1/voices', method: 'GET',
        headers: { 'xi-api-key': apiKey } },
      (res) => {
        let raw = ''
        res.on('data', d => raw += d)
        res.on('end', () => {
          try { resolve(JSON.parse(raw).voices || []) } catch { resolve([]) }
        })
      }
    )
    req.on('error', reject)
    req.setTimeout(15_000, () => { req.destroy(); reject(new Error('voices 列表请求超时')) })
    req.end()
  })

  const desc = voiceDescription.toLowerCase()

  // Detect gender
  const wantsFemale = /\b(female|woman|girl|她|女)\b/.test(desc)
  const wantsMale   = !wantsFemale || /\b(male|man|boy|他|男)\b/.test(desc)

  // Detect age preference
  const wantsOld    = /\b(old|elder|senior|mature|aged|年老|年长|老年)\b/.test(desc)
  const wantsYoung  = /\b(young|youth|teen|年轻)\b/.test(desc)

  // Accent preference
  const wantsAmerican = /\b(american|midwest|nebraska|us|usa)\b/.test(desc)

  function score(v) {
    const labels = v.labels || {}
    let s = 0
    if (wantsMale   && labels.gender === 'male')     s += 3
    if (wantsFemale && labels.gender === 'female')   s += 3
    if (wantsOld    && labels.age === 'old')         s += 4
    if (wantsOld    && labels.age === 'middle_aged') s += 1
    if (wantsYoung  && labels.age === 'young')       s += 4
    if (wantsAmerican && labels.accent === 'american') s += 2
    if (labels.use_case === 'conversational')         s += 1
    return s
  }

  const premade = voices.filter(v => v.category === 'premade')
  if (!premade.length) throw new Error('未找到 premade 声音列表')

  premade.sort((a, b) => score(b) - score(a))
  const best = premade[0]
  return { voiceId: best.voice_id, voiceName: best.name, vendor: 'elevenlabs', premade: true }
}

/**
 * Pick a fallback premade voice without calling the ElevenLabs API.
 * Used when the user has no API key or key is invalid but wants to proceed.
 * Matches gender+age hints in voice_description (or name/persona fallback)
 * against 4 hardcoded categories of ElevenLabs premade voice IDs.
 */
const FALLBACK_VOICES = {
  young_male:    { voiceId: 'TxGEqnHWrfWFTfGW9XjX', voiceName: 'Josh',      label: '年轻男' },
  young_female:  { voiceId: '21m00Tcm4TlvDq8ikWAM', voiceName: 'Rachel',    label: '年轻女' },
  mature_male:   { voiceId: 'pNInz6obpgDQGcFmaJgB', voiceName: 'Adam',      label: '中老年男' },
  mature_female: { voiceId: 'XB0fDUnXU5powFXDhCwa', voiceName: 'Charlotte', label: '中老年女' },
}

export function pickFallbackVoice(voiceDescription = '', extraHints = '') {
  const blob = (voiceDescription + ' ' + extraHints).toLowerCase()

  const isFemale =
    /\b(female|woman|girl|she|her|lady)\b/.test(blob) ||
    /[她女]/.test(blob)

  const ageMatch = blob.match(/(\d{2,3})\s*岁/) || blob.match(/\bage(?:d)?\s+(\d{2,3})\b/)
  const explicitAge = ageMatch ? parseInt(ageMatch[1], 10) : null
  const isMature =
    /\b(old|elder|senior|mature|aged|middle-aged|grey|gray|veteran)\b/.test(blob) ||
    /(中年|老年|年长|资深)/.test(blob) ||
    (explicitAge !== null && explicitAge >= 35)

  const key =
    isFemale && isMature ? 'mature_female' :
    isFemale             ? 'young_female'  :
    isMature             ? 'mature_male'   :
                           'young_male'

  const pick = FALLBACK_VOICES[key]
  return { ...pick, vendor: 'elevenlabs', premade: true, fallback: true, category: key }
}

export async function verifyApiKey(apiKey) {
  return new Promise((resolve) => {
    const req = https.request(
      { hostname: API_BASE, path: '/v1/user', method: 'GET',
        headers: { 'xi-api-key': apiKey } },
      (res) => {
        let raw = ''
        res.on('data', d => raw += d)
        res.on('end', () => resolve(res.statusCode === 200))
      }
    )
    req.on('error', () => resolve(false))
    req.setTimeout(8000, () => { req.destroy(); resolve(false) })
    req.end()
  })
}

// ── helpers ──────────────────────────────────────────────────────────────────

function getMime(ext) {
  const map = { '.mp3':'audio/mpeg', '.wav':'audio/wav', '.m4a':'audio/mp4',
                '.flac':'audio/flac', '.ogg':'audio/ogg', '.aac':'audio/aac', '.mp4':'audio/mp4' }
  return map[ext] || 'audio/mpeg'
}

function buildMultipart(boundary, fields, files) {
  const parts = []
  const enc = (s) => Buffer.from(s)

  for (const { name, value } of fields) {
    parts.push(enc(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`))
  }
  for (const { name, filename, data, type } of files) {
    parts.push(enc(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`))
    parts.push(data)
    parts.push(enc('\r\n'))
  }
  parts.push(enc(`--${boundary}--\r\n`))
  return Buffer.concat(parts)
}

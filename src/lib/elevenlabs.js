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

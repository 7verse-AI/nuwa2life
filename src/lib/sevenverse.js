/**
 * 7verse.ai API — storage upload + character upsert.
 */
import https from 'https'
import { readFileSync, statSync } from 'fs'
import { basename, extname } from 'path'
import { getConfigValue } from './config.js'

const SILENT_3S = 'https://p02-be-dev-1305923417.cos.na-siliconvalley.myqcloud.com/audios/2026/01/05/silent_3s.mp3'
const DEFAULT_SLLM = 'qwen2.5-72b-instruct'

function getBase() {
  return (getConfigValue('sevenverseBase') || 'https://7verse.ai').replace(/\/+$/, '')
}

function getAuthCookie() {
  const token = getConfigValue('sevenverseToken')
  if (!token) throw new Error('7verse.ai 未登录，请先运行 nuwa2life login')
  return `access_token_uat=${token}`
}

function parseHost(base) {
  return base.replace(/^https?:\/\//, '').split('/')[0]
}

// ── Storage Upload ────────────────────────────────────────────────────────────

export async function uploadFile(filePath, mimeType) {
  const data   = readFileSync(filePath)
  const name   = basename(filePath)
  const mime   = mimeType || guessMime(extname(filePath))
  const boundary = '----NuwaLife7v' + Date.now()
  const cookie = getAuthCookie()
  const base   = getBase()

  const body = buildMultipart(boundary, [
    { name: 'mime_type', value: mime },
  ], [
    { name: 'file', filename: name, data, type: mime },
  ])

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: parseHost(base),
      path: '/api/v2/storage/file',
      method: 'POST',
      headers: {
        'Content-Type':   `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        'Cookie':         cookie,
      },
    }, (res) => {
      let raw = ''
      res.on('data', d => raw += d)
      res.on('end', () => {
        let parsed
        try { parsed = JSON.parse(raw) } catch { parsed = {} }
        if (res.statusCode === 401) {
          reject(new Error('7verse.ai Token 已过期，请运行 nuwa2life login 重新登录'))
          return
        }
        if (res.statusCode >= 400) {
          reject(new Error(`上传失败 ${res.statusCode}: ${raw}`))
          return
        }
        const url = parsed?.data?.url || parsed?.data?.file_url || parsed?.url || ''
        if (!url) { reject(new Error(`上传成功但未返回 URL，原始响应: ${raw}`)); return }
        resolve({ url, rawResponse: parsed })
      })
    })
    req.on('error', reject)
    req.setTimeout(120_000, () => { req.destroy(); reject(new Error('上传超时 (120s)')) })
    req.write(body)
    req.end()
  })
}

// ── Character Upsert ──────────────────────────────────────────────────────────

export async function upsertCharacter({ distill, voiceId, portraitUrl, characterId = '' }) {
  const hardRulesPath = new URL('../../skill/hard_rules.prompt.txt', import.meta.url)
  let hardRules = ''
  try { hardRules = readFileSync(hardRulesPath, 'utf8').trim() } catch { /* fallback to empty */ }

  const openings = (distill.opening_dialogs || []).slice(0, 3).map(d => ({
    cat: 'opening',
    dialog: d.dialog,
    motion_prompt: d.motion_prompt,
    audio_url: '', a2v_url: '', info_json: null,
  }))
  const listening = {
    cat: 'listening',
    dialog: '',
    motion_prompt: distill.listening_pose?.motion_prompt || '',
    audio_url: '', a2v_url: '', info_json: null,
  }

  const cviConfig = {
    voice_meta: {
      vendor: 'elevenlabs',
      voice_id: voiceId,
      model_version: '',
      voice_settings: { similarity_boost: 0.75, speed: 1, stability: 0.75, style: 0, vol: 0 },
    },
    sysprompt_meta: {
      sllm_version: DEFAULT_SLLM,
      persona:       distill.persona || '',
      environment:   distill.environment || '',
      hard_rules:    hardRules,
      sysprompt:     'You are talking with {nickname}. You may use its first name when it adds genuine warmth.',
      scene: '', user_interact: '',
    },
    action_dialog_meta: [...openings, listening],
    action_audio_meta: [{
      cat: 'frm', audio_url: SILENT_3S,
      a2v_url: '', dialog: '', motion_prompt: 'motion_prompt', info_json: null,
    }],
    initial_image_meta: {
      url: portraitUrl,
      static_summary: distill.static_summary || '',
      width: 0, height: 0,
    },
    soul_id: '',
  }

  const body = {
    name: distill.name,
    async_cvi: true,
    user_id: '1',
    cvi_config: cviConfig,
    infra_soul_config: cviConfig,  // dual-write required by backend
  }
  if (characterId) { body.character_id = characterId; body.id = characterId }

  const cookie = getAuthCookie()
  const base   = getBase()
  const raw    = JSON.stringify(body)

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: parseHost(base),
      path: '/api/v1/characters/upsert',
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(raw),
        'Cookie':         cookie,
      },
    }, (res) => {
      let respRaw = ''
      res.on('data', d => respRaw += d)
      res.on('end', () => {
        let parsed
        try { parsed = JSON.parse(respRaw) } catch { parsed = {} }
        if (res.statusCode === 401) {
          reject(new Error('7verse.ai Token 已过期，请运行 nuwa2life login 重新登录'))
          return
        }
        if (res.statusCode >= 400) {
          reject(new Error(`角色注册失败 ${res.statusCode}: ${respRaw}`))
          return
        }
        const charId = String(
          parsed?.data?.character_id || parsed?.data?.id ||
          parsed?.character_id || parsed?.id || ''
        )
        resolve({
          characterId: charId,
          characterUrl: charId ? `${base}/content/${charId}/live?auto_start=1` : '',
          rawResponse: parsed,
        })
      })
    })
    req.on('error', reject)
    req.setTimeout(120_000, () => { req.destroy(); reject(new Error('注册超时 (120s)')) })
    req.write(raw)
    req.end()
  })
}

// ── Content Registration ──────────────────────────────────────────────────────

export async function registerContent({ characterId, name, description = '', portraitUrl = '', tags = [] }) {
  const cookie = getAuthCookie()
  const base   = getBase()

  const body = {
    type: 'character',
    type_reference_id: characterId,
    title: name,
    description: description || name,
    visibility: 'public',
    status: 'published',
    cover_image: {
      image_url: portraitUrl,
      aspect_ratio: '9:16',
      width: 0,
      height: 0,
      prompt: '',
      vendor: '',
      model_version: '',
    },
    tags: tags.length ? tags : [],
  }

  const raw = JSON.stringify(body)

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: parseHost(base),
      path: '/api/v1/contents/upsert',
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(raw),
        'Cookie':         cookie,
      },
    }, (res) => {
      let respRaw = ''
      res.on('data', d => respRaw += d)
      res.on('end', () => {
        let parsed
        try { parsed = JSON.parse(respRaw) } catch { parsed = {} }
        if (res.statusCode === 401) {
          reject(new Error('7verse.ai Token 已过期，请运行 nuwa2life login 重新登录'))
          return
        }
        if (res.statusCode >= 400) {
          reject(new Error(`Content 注册失败 ${res.statusCode}: ${respRaw}`))
          return
        }
        const contentId = String(
          parsed?.data?.id || parsed?.data?.content_id ||
          parsed?.id || parsed?.content_id || ''
        )
        resolve({ contentId, rawResponse: parsed })
      })
    })
    req.on('error', reject)
    req.setTimeout(30_000, () => { req.destroy(); reject(new Error('Content 注册超时 (30s)')) })
    req.write(raw)
    req.end()
  })
}

// ── helpers ───────────────────────────────────────────────────────────────────

function guessMime(ext) {
  const map = { '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png',
                '.gif':'image/gif', '.webp':'image/webp',
                '.mp3':'audio/mpeg', '.wav':'audio/wav', '.m4a':'audio/mp4' }
  return map[ext.toLowerCase()] || 'application/octet-stream'
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

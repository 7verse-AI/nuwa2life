/**
 * Config management — saves to ~/.nuwa2life/config.json
 * Keeps API keys, token, and setup state out of the project directory.
 */
import { homedir } from 'os'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'

const CONFIG_DIR  = join(homedir(), '.nuwa2life')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

function ensureDir() {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true })
}

export function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
  } catch {
    return {}
  }
}

export function saveConfig(patch) {
  ensureDir()
  const current = loadConfig()
  const next = { ...current, ...patch }
  writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2))
  return next
}

export function getConfigValue(key) {
  // Priority: env var > config file
  const envMap = {
    elevenlabsApiKey: 'ELEVENLABS_API_KEY',
    sevenverseToken:  'SEVENVERSE_ACCESS_TOKEN',
    sevenverseBase:   'SEVENVERSE_BASE',
  }
  if (envMap[key] && process.env[envMap[key]]) return process.env[envMap[key]]
  return loadConfig()[key] ?? null
}

export async function isFirstRun() {
  const cfg = loadConfig()
  return !cfg.setupComplete
}

export function markSetupComplete() {
  saveConfig({ setupComplete: true, setupAt: new Date().toISOString() })
}

const VALID_DISTILL_MODES = ['simple', 'complete']

export function getDefaultDistillMode() {
  const v = loadConfig().defaultDistillMode
  return VALID_DISTILL_MODES.includes(v) ? v : 'simple'
}

export function setDefaultDistillMode(mode) {
  if (!VALID_DISTILL_MODES.includes(mode)) {
    throw new Error(`无效的蒸馏深度: ${mode}（只接受 simple / complete）`)
  }
  return saveConfig({ defaultDistillMode: mode })
}

export const CACHE_DIR = join(CONFIG_DIR, 'cache')

export function getCacheDir(slug) {
  const dir = join(CACHE_DIR, slug)
  mkdirSync(dir, { recursive: true })
  return dir
}

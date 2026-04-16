import pc from 'picocolors'

const COMMANDS = {
  setup:  '初始化：配置 API Key + 登录 + 安装 Skill',
  login:  '刷新 7verse.ai 登录',
  test:   '测试各 API 连通性',
  create: '直接从命令行创建角色（不依赖 Claude Code）',
}

export async function run() {
  const args = process.argv.slice(2)
  const cmd = args[0]

  // No command → show setup if first time, otherwise show help
  if (!cmd) {
    const { isFirstRun } = await import('./lib/config.js')
    if (await isFirstRun()) {
      const { setup } = await import('./commands/setup.js')
      return setup()
    }
    printHelp()
    return
  }

  switch (cmd) {
    case 'setup':  { const { setup }  = await import('./commands/setup.js');  return setup() }
    case 'login':  { const { login }  = await import('./commands/login.js');  return login() }
    case 'test':   { const { test }   = await import('./commands/test.js');   return test(args.slice(1)) }
    case 'create': { const { create } = await import('./commands/create.js'); return create(args.slice(1)) }
    case '--version': case '-v': printVersion(); return
    case '--help': case '-h': printHelp(); return
    default:
      console.error(pc.red(`未知命令: ${cmd}`))
      printHelp()
      process.exit(1)
  }
}

function printVersion() {
  console.log('0.1.0')
}

function printHelp() {
  console.log(`
${pc.bold('nuwa2life')} — 让任何人物拥有声音和面孔

${pc.dim('用法：')}
  ${pc.cyan('npx nuwa2life')}              首次运行，自动引导初始化
  ${pc.cyan('nuwa2life setup')}            重新初始化（重置配置）
  ${pc.cyan('nuwa2life login')}            刷新 7verse.ai 登录 Token
  ${pc.cyan('nuwa2life test')}             测试 API 连通性
  ${pc.cyan('nuwa2life create <人物名>')}  直接创建角色

${pc.dim('示例：')}
  nuwa2life create "Steve Jobs"
  nuwa2life test --dry-run

${pc.dim('安装（全局）：')}
  npm install -g nuwa2life
`)
}

import pc from 'picocolors'

export async function run() {
  const args = process.argv.slice(2)
  const cmd = args[0]

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
    case 'config': { const { config } = await import('./commands/config.js'); return config(args.slice(1)) }
    case 'test':   { const { test }   = await import('./commands/test.js');   return test(args.slice(1)) }
    case 'create': { const { create } = await import('./commands/create.js'); return create(args.slice(1)) }
    case '--version': case '-v': console.log('0.1.0'); return
    case '--help': case '-h': printHelp(); return
    default:
      console.error(pc.red(`未知命令: ${cmd}\n`))
      printHelp()
      process.exit(1)
  }
}

function printHelp() {
  console.log(`
${pc.bold('nuwa2life')} — 让任何人物拥有声音和面孔

${pc.dim('用法：')}
  ${pc.cyan('npx nuwa2life')}                      首次运行，自动引导初始化
  ${pc.cyan('nuwa2life setup')}                    重新初始化（只补缺失项）

${pc.dim('配置管理：')}
  ${pc.cyan('nuwa2life config')}                   查看当前配置状态
  ${pc.cyan('nuwa2life config --clear-key')}       清除 ElevenLabs API Key
  ${pc.cyan('nuwa2life config --clear-token')}     退出 7verse.ai 登录
  ${pc.cyan('nuwa2life config --clear-all')}       清除全部配置
  ${pc.cyan('nuwa2life login')}                    刷新 7verse.ai 登录 Token

${pc.dim('创建角色：')}
  ${pc.cyan('nuwa2life create "<人物名>"')}        直接从命令行创建角色（无需 Claude Code）

${pc.dim('调试：')}
  ${pc.cyan('nuwa2life test')}                     测试 ElevenLabs + 7verse.ai 连通性
  ${pc.cyan('nuwa2life test --dry-run')}           只检查配置，不发网络请求

${pc.dim('在 Claude Code 里使用 Skill：')}
  说「我想跟 Steve Jobs 对话」
  说「把马斯克活体化」
  说「nuwa2life 费曼」
`)
}

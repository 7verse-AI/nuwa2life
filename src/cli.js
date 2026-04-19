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
      console.error(pc.red(`不认识这命令: ${cmd}\n`))
      printHelp()
      process.exit(1)
  }
}

function printHelp() {
  console.log(`
${pc.bold('nuwa2life')} — 给任何人搓个 AI 分身

${pc.dim('上手：')}
  ${pc.cyan('npx nuwa2life')}                               第一次跑，会带你配
  ${pc.cyan('nuwa2life setup')}                             重头配（只补缺的）

${pc.dim('配置：')}
  ${pc.cyan('nuwa2life config')}                            查看配置
  ${pc.cyan('nuwa2life config --set-distill-mode <mode>')}  改默认蒸馏深度 (simple/complete)
  ${pc.cyan('nuwa2life config --clear-key')}                清 ElevenLabs Key
  ${pc.cyan('nuwa2life config --clear-token')}              退 7verse 登录
  ${pc.cyan('nuwa2life config --clear-all')}                全清（慎用）
  ${pc.cyan('nuwa2life login')}                             刷 7verse 登录

${pc.dim('搓角色：')}
  ${pc.cyan('nuwa2life create "<人物名>"')}                 命令行直接搓（不开 Claude Code）

${pc.dim('体检：')}
  ${pc.cyan('nuwa2life test')}                              戳所有 API
  ${pc.cyan('nuwa2life test --dry-run')}                    只看配置，不发网络请求

${pc.dim('Claude Code 里用 skill：')}
  说「我想跟 Steve Jobs 聊聊」
  说「搓个马斯克出来」
  说「nuwa2life 张雪峰」
`)
}

# nuwa2life

女娲蒸馏思维，Nuwa2Life 让思维拥有脸和声音。
从 CLI 一句话把任何人物活体化到 7verse.ai。

## 项目结构

```
nuwa2life/
├── bin/nuwa2life.js          # CLI 入口（chmod +x）
├── src/
│   ├── cli.js                # 路由 + help
│   ├── commands/
│   │   ├── setup.js          # 引导式初始化（Step 1-3）
│   │   ├── login.js          # 刷新 7verse.ai token
│   │   ├── test.js           # API 连通性测试
│   │   └── create.js         # 直接创建角色
│   └── lib/
│       ├── config.js         # ~/.nuwa2life/config.json 管理
│       ├── oauth.js          # 7verse.ai Google OAuth
│       ├── elevenlabs.js     # ElevenLabs 音色克隆
│       └── sevenverse.js     # 7verse.ai 存储上传 + 角色注册
└── skill/
    ├── SKILL.md              # 安装到 ~/.claude/skills/nuwa2life/
    └── hard_rules.prompt.txt # 7verse 角色交互硬性规则
```

## 开发规范

- ESM only (`"type": "module"`)
- Node.js >= 18（使用内置 `https` 模块，不依赖 axios/node-fetch）
- 配置存 `~/.nuwa2life/config.json`，缓存存 `~/.nuwa2life/cache/<slug>/`
- API key 不进代码，不进 git
- 依赖最小化：只用 `@clack/prompts`、`open`、`picocolors`

## 本地调试

```bash
cd nuwa2life
npm install
node bin/nuwa2life.js          # 等同于 nuwa2life
node bin/nuwa2life.js setup    # 引导初始化
node bin/nuwa2life.js test --dry-run
node bin/nuwa2life.js create "Steve Jobs"
```

## 发布

```bash
npm publish        # 发布到 npm
npx nuwa2life      # 用户安装方式
npm install -g nuwa2life  # 全局安装
```

## 关键 API 端点

- ElevenLabs 音色克隆: `POST https://api.elevenlabs.io/v1/voices/add`
- 7verse 存储上传:     `POST https://uat.7verse.ai/api/v2/storage/file`
- 7verse 角色注册:     `POST https://uat.7verse.ai/api/v1/characters/upsert`
- 7verse OAuth:        `GET  https://uat.7verse.ai/api/v1/auth/google/web/login/start`
- 7verse Token 验证:   `POST https://uat.7verse.ai/api/v1/auth/verify`

## 环境变量（优先于 config.json）

```
ELEVENLABS_API_KEY       ElevenLabs API Key
SEVENVERSE_UAT_ACCESS_TOKEN  7verse.ai access token
SEVENVERSE_BASE          覆盖 7verse 域名（默认 https://uat.7verse.ai）
```

# Nuwa2Life

**让任何人物拥有声音和面孔。** 从 Claude Code 里说一句话，把历史人物、公众人物活体化到 [7verse.ai](https://uat.7verse.ai)。

> Fork of [alchaincyf/nuwa-skill](https://github.com/alchaincyf/nuwa-skill) — 女娲蒸馏思维，Nuwa2Life 让思维拥有脸和声音。

---

## 效果

在 Claude Code 里说「我想跟 Steve Jobs 对话」→ 自动完成人设蒸馏、图片搜索、音色克隆、角色注册 → 浏览器打开对话页面。

## 快速开始

**第一步：安装并初始化**

```bash
npx nuwa2life
```

首次运行自动引导完成三步初始化：

```
◆ Step 1/3 — ElevenLabs API Key
  ◇ 粘贴你的 API Key: sk_...
  └ ✓ API Key 有效

◆ Step 2/3 — 7verse.ai 登录
  │ 浏览器已打开 → 完成 Google 登录 → 复制 Token
  ◇ 粘贴 access_token_uat: eyJ...
  └ ✓ 登录成功

◆ Step 3/3 — 安装 Claude Code Skill
  └ ✓ Skill 已安装到 ~/.claude/skills/nuwa2life/
```

**第二步：在 Claude Code 里说话**

```
「我想跟 Steve Jobs 对话」
「把马斯克活体化」
「nuwa2life 费曼」
```

Skill 会自动引导完成人设蒸馏 → 首帧图搜索 → 音色克隆 → 角色注册 → 打开对话。

---

## 前置条件

| 依赖 | 说明 |
|------|------|
| [ElevenLabs](https://elevenlabs.io) API Key | 用于克隆人物声音，免费账号有额度 |
| [7verse.ai](https://uat.7verse.ai) 账号 | Google 登录即可，无需 API Key |
| [Claude Code](https://claude.ai/code) | 运行 Skill 的环境 |
| Node.js ≥ 18 | 运行 CLI 工具 |

---

## 命令参考

```bash
# 初始化 / 重新配置
npx nuwa2life              # 首次运行
nuwa2life setup            # 重新初始化（只补缺失项）

# 配置管理
nuwa2life config                   # 查看当前配置状态
nuwa2life config --clear-key       # 清除 ElevenLabs API Key
nuwa2life config --clear-token     # 退出 7verse.ai 登录
nuwa2life config --clear-all       # 清除全部配置
nuwa2life login                    # 刷新 7verse.ai 登录 Token

# 创建角色（不依赖 Claude Code）
nuwa2life create "Steve Jobs"

# 调试
nuwa2life test                     # 测试 API 连通性
nuwa2life test --dry-run           # 只检查配置，不发网络请求
```

---

## 工作原理

```
用户: 「我想跟 Steve Jobs 对话」
  ↓
Phase 1  Nuwa 蒸馏       Claude 生成人设 JSON（persona、开场白、动作描述）
  ↓
Phase 2  首帧图搜索       WebSearch + multimodal 筛选最佳首帧图
  ↓
Phase 3  音频采集         用户拖拽音频文件到终端
  ↓
Phase 4  音色克隆         ElevenLabs /v1/voices/add → voice_id
  ↓
Phase 5  图片上传         7verse.ai 存储 → COS URL
  ↓
Phase 6  角色注册         7verse.ai /api/v1/characters/upsert → character_id
  ↓
Phase 7  打开对话         浏览器自动打开角色对话页
```

**断点续做**：中间任何步骤失败，缓存保存在 `~/.nuwa2life/cache/<slug>/`，重新运行从断点继续。

---

## 配置文件

所有配置保存在 `~/.nuwa2life/config.json`，不进 git，不上传任何地方。

```json
{
  "elevenlabsApiKey": "sk_...",
  "sevenverseToken": "eyJ...",
  "setupComplete": true
}
```

环境变量优先于配置文件（适合 CI / 脚本场景）：

```bash
export ELEVENLABS_API_KEY="sk_..."
export SEVENVERSE_UAT_ACCESS_TOKEN="eyJ..."
export SEVENVERSE_BASE="https://uat.7verse.ai"   # 可改为 prod 域名
```

---

## 开发本地调试

```bash
git clone https://github.com/7verse-AI/nuwa2life.git
cd nuwa2life
npm install
npm link                          # 全局注册 nuwa2life 命令

nuwa2life setup
nuwa2life test --dry-run
```

---

## License

MIT

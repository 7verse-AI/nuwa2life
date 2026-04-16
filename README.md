# nuwa2life

在 Claude Code 里说一句话，把任何人物活体化到 [7verse.ai](https://7verse.ai)。

灵感来自 [alchaincyf/nuwa-skill](https://github.com/alchaincyf/nuwa-skill) 的女娲蒸馏思想——提炼一个人的思维方式，nuwa2life 在此基础上让这个思维拥有声音和面孔，可以真正开口说话。

---

## 它能做什么

你在 Claude Code 里说「我想跟费曼对话」，接下来它会自动帮你：

1. 提炼费曼的人设（性格、说话方式、世界观）
2. 搜一张他的标志性照片作为首帧
3. 引导你提供一段他的音频，克隆他的声音
4. 把角色注册到 7verse.ai，直接打开对话页面

整个过程你只需要提供音频，其他都是自动的。

---

## 快速开始

**第一步，初始化**

```bash
npx nuwa2life
```

首次运行会引导你完成三件事：配置 ElevenLabs API Key、登录 7verse.ai、安装 Claude Code Skill。大概长这样：

```
◆ Step 1/3 — ElevenLabs API Key
  ◇ 粘贴你的 API Key: sk_...
  └ ✓ 有效

◆ Step 2/3 — 7verse.ai 登录
  │ 浏览器已打开，等待登录完成...
  └ ✓ 登录成功

◆ Step 3/3 — 安装 Claude Code Skill
  └ ✓ 已安装到 ~/.claude/skills/nuwa2life/
```

**第二步，在 Claude Code 里说话就行了**

```
「我想跟 Steve Jobs 对话」
「把马斯克活体化」
「nuwa2life 费曼」
```

---

## 需要准备什么

| 工具 | 说明 |
|------|------|
| [ElevenLabs](https://elevenlabs.io) | 用来克隆声音，免费账号有额度够用 |
| [7verse.ai](https://7verse.ai) 账号 | 用 Google 登录就行，不需要单独申请 API Key |
| [Claude Code](https://claude.ai/code) | 跑 Skill 的环境 |
| Node.js ≥ 18 | 运行这个 CLI |

---

## 命令速查

```bash
npx nuwa2life              # 首次安装 & 初始化
nuwa2life setup            # 重新跑一遍初始化（只补缺失的步骤）
nuwa2life login            # 7verse.ai 登录过期了就用这个刷新
nuwa2life config           # 查看当前配置
nuwa2life config --clear-key      # 删掉 ElevenLabs Key
nuwa2life config --clear-token    # 退出 7verse.ai 登录
nuwa2life config --clear-all      # 清空所有配置
nuwa2life test             # 测试两个 API 是否都通
nuwa2life test --dry-run   # 只检查配置，不发网络请求
```

---

## 工作流程

```
你说: 「我想跟费曼对话」
  ↓
Phase 1  提炼人设    Claude 生成人物 JSON（性格/开场白/动作/声音描述）
  ↓
Phase 2  找首帧图    WebSearch + 多模态筛选最像的一张
  ↓
Phase 3  采集声音    你把一段音频拖进终端（30秒以上效果好）
  ↓
Phase 4  克隆声音    ElevenLabs voice clone → voice_id
  ↓
Phase 5  上传图片    存到 7verse.ai COS → URL
  ↓
Phase 6  注册角色    /api/v1/characters/upsert → character_id
  ↓
Phase 7  发布内容    /api/v1/contents/upsert → content_id
  ↓
Phase 8  打开对话    浏览器自动打开 7verse.ai/content/{id}/live
```

中间某步失败了不用重来，缓存在 `~/.nuwa2life/cache/<slug>/`，重新运行会从断点继续。

---

## 配置存在哪

`~/.nuwa2life/config.json`，不进 git，不上传任何地方。

```json
{
  "elevenlabsApiKey": "sk_...",
  "sevenverseToken": "eyJ...",
  "setupComplete": true
}
```

如果你在 CI 或脚本里用，环境变量优先级更高：

```bash
export ELEVENLABS_API_KEY="sk_..."
export SEVENVERSE_ACCESS_TOKEN="eyJ..."
export SEVENVERSE_BASE="https://7verse.ai"
```

---

## 本地开发

```bash
git clone https://github.com/7verse-AI/nuwa2life.git
cd nuwa2life
npm install
npm link          # 把 nuwa2life 命令注册到全局

nuwa2life setup
nuwa2life test --dry-run
```

---

## License

MIT

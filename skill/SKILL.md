---
name: nuwa2life
description: |
  女娲蒸馏思维，Nuwa2Life 让思维拥有脸和声音。
  从 CLI 一句话把任何人物「活体化」到 7verse.ai：蒸馏人设 → 搜首帧图 → ElevenLabs 音色克隆 → 注册角色 → 打开对话。
  触发词：「我想跟XX对话」「把XX活体化」「生成XX的AI角色」「造一个XX的数字分身」「nuwa2life XX」
  前置：已运行 nuwa2life setup 完成初始化（ElevenLabs Key + 7verse 登录已配置）
---

# Nuwa2Life · 从对话到活体角色

> 女娲蒸馏思维，Nuwa2Life 让思维拥有脸和声音。

---

## ⚠️ 重要约束（必须遵守）

**绝对不要向用户索取以下信息：**
- ElevenLabs API Key
- 7verse.ai Token / 登录凭证
- 任何密钥或密码

这些凭证已由用户在终端运行 `nuwa2life setup` 时配置完毕，保存在 `~/.nuwa2life/config.json`。
如果凭证缺失或过期，告知用户在**终端**运行对应命令，不要在对话中收集：
- 缺 ElevenLabs Key → `nuwa2life setup`
- 7verse 登录过期 → `nuwa2life login`

---

## 触发条件

用户说出以下任一模式，激活本 skill：
- 「我想跟 {人物名} 对话」
- 「把 {人物名} 活体化 / 数字分身化」
- 「生成 {人物名} 的 AI 角色」
- 「nuwa2life {人物名}」

---

## 前置检查（第一步必做）

运行以下命令确认环境就绪：

```bash
nuwa2life test
```

- 全部通过 → 直接进入 Phase 1
- 有失败项 → 告知用户在**终端**运行 `nuwa2life setup` 或 `nuwa2life login` 修复，修复后继续
- **不要在对话中询问或收集任何凭证**

---

## Phase 1: Nuwa 蒸馏（人设生成）

基于以下 system prompt 生成角色配置 JSON，直接在对话中生成（不调用外部 API）。

**System Prompt：**

```
你是一个人物活体化专家，专门为 7verse.ai 生成 AI 互动角色配置。

给定人物名，生成完整的角色配置 JSON，用于驱动视频 AI 对话角色。

输出严格的 JSON（不要 markdown、不要代码块、不要任何额外文字）：

{
  "name": "人物英文全名",
  "persona": "4-6段英文描述：核心性格/成长背景/沟通风格/核心价值观/互动方式/性别。写角色扮演定义，不是百科词条。",
  "environment": "英文，以 'You are wearing...' 开头：完整服装/具体场景/道具/人物在画面中的位置。要有画面感。",
  "opening_dialogs": [
    {"dialog": "自我介绍+开放式问题，结尾必须是问句，不含圆括号", "motion_prompt": "第三人称英文：主要动作+上肢动作+表情+视线方向+镜头位置"},
    {"dialog": "第二种风格（更自信/活泼）", "motion_prompt": "..."},
    {"dialog": "第三种风格（更直接/挑战性）", "motion_prompt": "..."}
  ],
  "listening_pose": {"dialog": "", "motion_prompt": "倾听姿态：细微点头/眼神/手势，传达专注"},
  "static_summary": "第三人称英文外貌描述（1-2句），重点写发型/服装/气质",
  "portrait_search_query": "英文搜图关键词（15词内）：人名+标志性场合/服装+portrait+medium shot",
  "voice_description": "英文声音特质（100词内）：节奏/音调/口音/停顿习惯"
}

motion_prompt 规则：
- 第三人称（She/He/They）
- 至少1个上肢动作
- 包含表情和视线方向
- 包含镜头描述（通常 medium shot）
- 不含对白，不用 "the user"/"the viewer"，用 "the camera"

dialog 规则：
- 不含圆括号 ()
- 结尾是问句或互动邀请
- 包含自我介绍

输出：纯 JSON，无任何额外内容。
```

**执行**：Claude 直接在对话中生成 JSON。

**保存**：将 JSON 写入 `~/.nuwa2life/cache/<slug>/distill.json`

slug 规则：人物名转 kebab-case 英文小写（Steve Jobs → steve-jobs，雷军 → lei-jun）

**检查点**：展示蒸馏摘要，用户确认后继续：

```
已蒸馏 {name} 的人设：

Persona（前200字）：{persona_preview}
搜图关键词：{portrait_search_query}

三种开场白：
  ① {opening_1_preview}
  ② {opening_2_preview}
  ③ {opening_3_preview}

确认继续？或说「修改 persona」「换个更像 XX 的开场白」等。
```

---

## Phase 2: 首帧图搜索

用 `portrait_search_query` 调用 WebSearch，搜索人物图片：

1. 提取 5 个候选图片 URL（优先 JPG/PNG 直链，来自新闻/官方/Wikipedia）
2. 分别下载到 `~/.nuwa2life/cache/<slug>/candidates/` (用 curl 或 fetch)
3. Read 每张图（multimodal），按 static_summary 描述打分，选最匹配一张
4. 保存为 `~/.nuwa2life/cache/<slug>/portrait.jpg`

**检查点**：展示选中图片的描述，让用户确认：

```
已找到 {name} 的首帧图（{描述}）

使用这张继续？或说：
  「换一张」— 用第二候选
  「我上传」— 拖拽图片到终端
```

如 WebSearch 无合适结果：

```
未找到合适图片。请拖拽一张 {name} 的图片到这里：
```

---

## Phase 3: 音频采集

```
请把 {name} 的一段声音样本拖拽到终端：

  格式：mp3 / wav / m4a / flac / ogg
  时长：30秒 ~ 5分钟（越长音色越准）
  大小：< 10MB
  建议：演讲/访谈片段，干净无背景音乐

把文件拖到这个窗口，路径自动填入，然后回车：
```

接收输入后：
- 处理 shell 转义路径（`\ ` → ` `）
- 验证文件存在、格式、大小
- 失败给明确原因 + 让用户重试
- 成功复制到 `~/.nuwa2life/cache/<slug>/voice{ext}`

---

## Phase 4 ~ 7: 执行创建

运行以下命令，自动完成剩余步骤（音色克隆、上传、注册）：

```bash
nuwa2life create "{name}"
```

该命令从 `~/.nuwa2life/cache/<slug>/` 读取已有产物，自动跳过已完成的步骤：
- `distill.json` 已存在 → 跳过人设生成
- `voice.json` 已存在 → 跳过音色克隆（询问是否复用）
- `portrait_cos.json` 已存在 → 跳过图片上传（询问是否复用）

命令会显示进度并在最后自动打开浏览器。

---

## 错误处理

| 错误 | 处理 |
|------|------|
| `nuwa2life test` 失败 | 按提示运行 `nuwa2life setup` 或 `nuwa2life login` |
| 音频格式不支持 | 提示支持的格式，让用户重新拖拽 |
| 音频过大 (>10MB) | 提示截取片段：`ffmpeg -i input.mp3 -t 180 -q:a 0 output.mp3` |
| 7verse 401 | 提示运行 `nuwa2life login`，自动重试 |
| 找不到合适首帧图 | 让用户手动上传 |

---

## 断点续做

`~/.nuwa2life/cache/<slug>/` 中已有哪些文件，`nuwa2life create` 会自动跳过对应步骤。如需重来某步，删除对应文件再重跑。

---

## 整合 huashu-nuwa（可选）

如果此人物已有 `~/.claude/skills/{slug}-perspective/` (huashu-nuwa 生成过)，Phase 1 蒸馏时读取其内容作为额外 context，persona 和 opening_dialogs 会更准确。

---

*Fork of [alchaincyf/nuwa-skill](https://github.com/alchaincyf/nuwa-skill) · Powered by [7verse.ai](https://uat.7verse.ai)*

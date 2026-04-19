---
name: nuwa2life
description: |
  搓一个 AI 角色出来，让任何人变成你的视频聊天对象。
  从一句话到能跟你视频通话的数字分身：蒸馏人设 → 搜首帧图 → 克隆音色 → 注册 → 打开对话。
  触发词：「我想跟XX聊聊」「搓个XX出来」「把XX拉过来」「生成XX的AI角色」「造一个XX的数字分身」「nuwa2life XX」
  前置：已运行 nuwa2life setup 完成初始化（ElevenLabs Key + 7verse 登录已配置）
---

# Nuwa2Life · 搓个 AI 角色出来

> 女娲蒸馏思维，让思维拥有脸和声音。

---

## ⚠️ 硬规则（先看这段）

1. **绝对不要**在对话里向用户索取任何 API Key / Token / 密码。这些是 `nuwa2life setup` / `nuwa2life login` 在**终端**里配的，在 `~/.nuwa2life/config.json`。缺了就让用户去终端跑对应命令。
2. **不要假定语言**。用户说中文你就说中文，用户说英文你就说英文，跟着走。这个 SKILL 的样例用中文，但**不强制**对用户也用中文回。
3. **调性**：有趣、幽默、带点小毒舌。不要用"活体化""角色已注册""流程如下"这种机器味。例子：
   - ❌ "请提供 {人物名} 的声音样本文件"
   - ✅ "丢段 {人物名} 的声音进来，30 秒以上，别太干（我又不是来听 ASMR 的）"
4. **小毒舌有边界**：吐槽的是流程、是现实约束，**不是用户、不是被蒸馏的人物**。

---

## 触发

用户说以下任一模式，启动本 skill：
- 「我想跟 {X} 聊聊」 / 「跟 {X} 对话」
- 「搓个 {X} 出来」 / 「把 {X} 拉过来」
- 「生成 {X} 的 AI 角色」 / 「造一个 {X} 的数字分身」
- 「nuwa2life {X}」

---

## Phase 0：开场前的体检 + 深度询问

**触发后第一件事做这个，不要直接开干。**

### 0.1 配置健康检查

运行：

```bash
nuwa2life test --dry-run
```

（`--dry-run` 只检查有没有配置，不发网络请求，秒出结果。）

解析结果，读 `~/.nuwa2life/config.json` 拿 `defaultDistillMode`（缺省视为 `simple`）。

把结果+默认值整理成一个 **简洁的开场面板** 给用户：

```
好，准备搓 {X} 了。先对一下清单：

📋 配置
  ElevenLabs Key   ✓ 有效  /  ✗ 失效（见下方选项 a/b）
  7verse Token     ✓ 有效
  huashu-nuwa      ✓ 已装  /  ✗ 没装（complete 模式会不可用）

🔬 蒸馏深度  (默认: {defaultDistillMode})
  [1] simple    ~1-2 min，轻调研（抓 3-5 段真实语料再生成）
  [2] complete  ~5-15 min，调 huashu-nuwa 跑完整 6-agent 蒸馏
                顺手产出 ~/.claude/skills/{slug}-perspective/ 可复用

{仅当 ElevenLabs 失效才显示这块}
🎙️ 音色
  [a] 我去配 → 暂停，去终端 nuwa2life setup
  [b] 用内置默认音色 → 按人物性别/年龄自动挑 premade

改默认深度: nuwa2life config --set-distill-mode <simple|complete>

怎么走？
```

**等待用户回话**。用户只需要回一两个字符（`2`、`2b`、`回车走默认`都行）。

### 0.2 路由

- 选 `simple` → **Phase 1S**（轻调研 simple）
- 选 `complete` → **Phase 1C**（委托 huashu-nuwa）
- 若 ElevenLabs 失效且选了 `b` → 记下 `voiceFallback = true`，Phase 3 跳过音频采集、直接用内置音色

---

## Phase 1S：轻调研 Simple（~1-2 分钟）

**目标**：不是单次 LLM 一把梭编造——先抓真实语料，再基于语料生成 JSON。没有真实语料，simple 不开生成。

### 1S.1 人物语言分流

判断 `{name}` 是中文人物还是英文人物（按名字字符 + 公开活动场景）。信息源走下面对应白名单：

#### 中文人物 — 信息源

**白名单**：
- B站原始视频（非搬运号）
- 小宇宙 / 喜马拉雅（原始播客音频）
- 微博（本人验证号）
- 权威媒体：36氪、极客公园、晚点 LatePost、财新、第一财经、虎嗅、少数派、机器之心
- 本人著作 / 个人公号文章**长文**（碎片 ≤300 字的不算）

**黑名单**（**永远不用**）：
- 知乎（洗稿严重）
- 微信公众号（除原作者本人账号）
- 百度百科 / 百度知道
- 任何标题党、内容农场

#### 英文人物 — 信息源

**白名单**：
- Twitter/X（本人验证账号）
- YouTube（本人 / 官方频道）
- 长访谈播客：Lex Fridman、Tim Ferriss、Joe Rogan（仅限 OP 发言段）、Acquired、All-In、Conversations with Tyler、How I Built This
- 权威媒体：NYT、WSJ、Bloomberg、FT、The Atlantic、Wired、The Verge、Stratechery、HBR
- 本人著作 / Substack / 个人博客 / personal site

**黑名单**：
- Quora（LLM 农场化严重）
- Medium 二手转述（原作者本人 Medium 可用）
- Reddit 转述帖（仅 OP 自证 / 官方 AMA 可用）
- Wikipedia **观点段**（事实段如生卒年、履历可用）
- Content farm（Forbes contributor、buzzfeed 等）

### 1S.2 三路并发搜

并行跑 3 次 `WebSearch`，搜词模板：

**中文人物**（`{name}` 替换成人物名）：
- `"{name}" 演讲全文 OR transcript`
- `"{name}" 直播切片 OR 短视频 经典语录 OR 口头禅`
- `"{name}" 长访谈 OR 对话`

**英文人物**：
- `"{name}" interview transcript OR keynote full text`
- `"{name}" podcast episode OR conversation long-form`
- `"{name}" essay OR op-ed OR blog post`

对每次 WebSearch 结果过**白名单**；不在白名单的源直接丢弃。挑出 3-5 个最可能含长段真实原文的 URL，用 `WebFetch` 精读。

### 1S.3 凝练语料

把 3-5 段抓到的原文压成：

```markdown
# {name} · Quick Corpus

## 招牌段子 / 口头禅（5-10 条，每条来自真实语料）
- "..."  [source: {url}]
- ...

## 3-5 段完整原文摘录（每段 ≥200 字）
...

## 风格观察
- 节奏：长句 / 短句 / 连珠炮 ...
- 高频词：...
- 典型句式：...
- 语气：严肃 / 幽默 / 挑衅 / 温和 / ...
```

写入 `~/.nuwa2life/cache/{slug}/quick_corpus.md`。

**如果搜完白名单只剩 <3 段可用原文**：诚实告诉用户"这人信息太少，simple 模式顶不住，建议切 complete"。让用户决定继续还是切换。

### 1S.4 锚定生成 distill.json

**基于 `quick_corpus.md` 作为强 context**，一次 LLM 调用生成 distill.json（格式见下）。硬约束写进生成 prompt：

- `opening_dialogs` 的三条，**每条必须直接化用或引用 corpus 里的招牌段子/高频句式**。不允许凭空编。
- `voice_description` 必须写出 corpus 里观察到的**具体**节奏/口音/口头禅，不准写 "measured Chinese male voice" 这种白开水。
- `persona` 至少 3 处挂钩真实事件或真实金句（可以是隐式引用）。

**自检**（生成完立刻跑，不展示给用户）：
> 「熟悉 {name} 的朋友读这 3 条 opening_dialogs + voice_description，能一眼认出是他/她吗？」
> - 能 → 通过，展示给用户
> - 不能 → 重写一次（最多 1 次）；再不通过就坦白"这轮没搓出灵魂，建议 complete 模式"

### 1S.5 distill.json schema

```json
{
  "name": "人物英文全名",
  "persona": "4-6段英文描述：核心性格/成长背景/沟通风格/核心价值观/互动方式/性别。写角色扮演定义，不是百科词条。",
  "environment": "英文，以 'You are wearing...' 开头：完整服装/具体场景/道具/人物在画面中的位置。要有画面感。",
  "opening_dialogs": [
    {"dialog": "自我介绍+开放式问题，结尾必须是问句，不含圆括号", "motion_prompt": "第三人称英文：主要动作+上肢动作+表情+视线方向+镜头位置"},
    {"dialog": "第二种风格", "motion_prompt": "..."},
    {"dialog": "第三种风格", "motion_prompt": "..."}
  ],
  "listening_pose": {"dialog": "", "motion_prompt": "倾听姿态：细微点头/眼神/手势，传达专注"},
  "static_summary": "第三人称英文外貌描述（1-2句）",
  "portrait_search_query": "英文搜图关键词（15词内）：人名+标志性场合/服装+portrait+medium shot",
  "voice_description": "英文声音特质（100词内），必须含真实观察（节奏/口音/口头禅）"
}
```

**motion_prompt 规则**：第三人称（She/He/They）；至少 1 个上肢动作；含表情+视线+镜头（medium shot）；不含对白；不用 "the user"/"the viewer"，用 "the camera"。

**dialog 规则**：不含圆括号 `()`；结尾是问句或互动邀请；包含自我介绍。

写入 `~/.nuwa2life/cache/{slug}/distill.json`，然后 **跳到 Phase 2**。

### 1S.6 检查点

```
{X} 的人设搓好了（simple / 基于 {N} 段真实语料）：

Persona 前 200 字: ...
搜图关键词: ...

三种开场白:
  ① {opening_1_preview}
  ② {opening_2_preview}
  ③ {opening_3_preview}

像不像？不像说「重写开场白」/「persona 太正经了」/「换更毒舌的风格」等，我就地改。
确认继续走图 + 音 + 上线？
```

---

## Phase 1C：委托 huashu-nuwa（complete 模式）

**不要自己实现 6-agent 调研。**直接调 huashu-nuwa skill，把下面这组**附加约束**作为 prompt 传过去：

```
# 附加约束（由 nuwa2life 注入）

目标：蒸馏 {name} 的完整人物 skill，最终产物要能供 nuwa2life 抽取 7verse 角色配置 JSON。

## 信息源（严格执行）
{粘贴上面 Phase 1S.1 的中文 or 英文白名单 + 黑名单，按 {name} 语言二选一}

## Token 压缩指令
1. **Phase 5 默认关闭**（双 agent 精炼不跑）。只有 Phase 4 质量验证**3 项里 ≥2 项不通过**才触发 Phase 5，并且只跑 Agent A。
2. **Phase 4 三测合一**：spawn 一个 sub-agent 同时跑 sanity/edge/voice 三项，一次性出综合报告。不要 spawn 3 个独立 sub-agent。
3. **每个 Phase 1 agent 输出硬上限**：
   - 正文 ≤ 600 字
   - 引用 ≤ 8 条
   - 发现矛盾优先保留（矛盾信号密度高，值得名额）
4. **Agent 数量自适应**：Phase 0.5 评估可用信息源后：
   - 来源 ≥ 30 条：跑全套 6 agent
   - 来源 10-29 条：跑 4 agent（著作 + 对话 + 表达 + 时间线）
   - 来源 < 10 条：跑 3 agent（著作 + 对话 + 时间线），在诚实边界中明确标注"信息稀疏"
5. **Checkpoint 摘要简化**：Phase 1.5 / 2.5 的表格，非交互场景下只出一行摘要（"6 agent / 87 来源 / 4 心智模型 / 2 矛盾点"），不出完整表格。

## 输出要求
产物保存到 ~/.claude/skills/{slug}-perspective/（标准 huashu-nuwa 结构不变）。
完成后返回 perspective skill 的目录路径，nuwa2life 接手做 extract。
```

调用完成后，huashu-nuwa 产出 `~/.claude/skills/{slug}-perspective/SKILL.md` + `references/research/01-06.md`（或自适应后的 3-4 份）。

### 1C.1 Extract：从 perspective skill 抽 distill.json

读 `~/.claude/skills/{slug}-perspective/SKILL.md`（**只读 SKILL.md，不读 references/research/*** — 研究文件在蒸馏过程中已被浓缩到 SKILL.md，再读原始研究是浪费 token）。

从 SKILL.md 的以下 section 抽信息：
- **心智模型 + 表达 DNA + 价值观** → `persona`
- **时间线**（挑此人标志性 era / 经典场景） → `environment` + `portrait_search_query`
- **决策案例 + 对话风格 + 表达 DNA** → `opening_dialogs`（3 条必须引自真实决策 / 真实金句）
- **表达 DNA 的节奏 / 口音 / 口头禅** → `voice_description`

输出 distill.json（格式同 Phase 1S.5），写入 `~/.nuwa2life/cache/{slug}/distill.json`。

### 1C.2 检查点

```
{X} 的人设搓好了（complete / 基于 perspective skill 的 {M} 个心智模型）：

Persona 前 200 字: ...
搜图关键词: ...

三种开场白:
  ① ...
  ② ...
  ③ ...

perspective skill 也顺手生成了：~/.claude/skills/{slug}-perspective/
（之后想纯文字聊 {X}，直接 /skill {slug}-perspective）

继续走图 + 音 + 上线？
```

---

## Phase 2：首帧图

用 `distill.json.portrait_search_query` 跑 WebSearch，抽 5 个候选图 URL（优先 JPG/PNG 直链、新闻/官方/Wikipedia 源）。分别 curl/fetch 下到 `~/.nuwa2life/cache/{slug}/candidates/`，Read 每张（多模态）按 `static_summary` 打分，选最匹配一张保存为 `~/.nuwa2life/cache/{slug}/portrait.jpg`。

### 检查点

```
给 {X} 挑了张脸：{候选图的一句描述}

用这张？或者：
  「换一张」 — 用第二候选
  「我上传」 — 拖张图过来
```

如 WebSearch 捞不到合适的：

```
网上这人的图不太行（全是表情包/自拍/糊图）。拖张 {X} 的图过来吧，越正式越好：
```

---

## Phase 3：音频

```
丢段 {X} 的声音样本进来：

  格式：mp3 / wav / m4a / flac / ogg
  时长：30 秒 ~ 5 分钟（越长音色越准）
  大小：< 10MB
  建议：演讲 / 访谈片段，干净无背景音乐（别来段他唱 K 的）

拖到这个窗口，路径自动填入，然后回车：
```

接收后处理 shell 转义路径（`\ ` → ` `）；验证文件、格式、大小；失败明确告诉哪里错让他重传；成功复制到 `~/.nuwa2life/cache/{slug}/voice.{ext}`。

**如果 Phase 0 设定了 `voiceFallback = true`（ElevenLabs Key 失效）**：跳过本阶段，`create` 命令会自动按人物性别/年龄从 4 类预设音色挑一个。告诉用户：

```
ElevenLabs Key 失效，音频克隆这步跳过，给 {X} 挑了个内置音色（按 persona 里的性别/年龄匹配）。
音色想换真的？终端里跑 nuwa2life setup 补上 Key，然后「重搓 {X} 的音色」。
```

---

## Phase 4 ~ 7：执行 create

```bash
nuwa2life create "{name}"
```

从 `~/.nuwa2life/cache/{slug}/` 读已有产物，跳过已完成步骤：
- `distill.json` 已存在 → 跳过人设生成
- `voice.json` 已存在 → 跳过音色克隆（问是否复用）
- `portrait_cos.json` 已存在 → 跳过图片上传（问是否复用）

命令显示进度，最后给**两个出口选项**（见下）。

---

## 结尾出口

`nuwa2life create` 跑完，大声告诉用户**现在可以视频通话了**，然后给两个选项，**默认 [2] 网页视频**：

```
🎬 {X} 已上线！  现在可以跟他/她视频通话了！

选一个聊法：
  [1] 终端文字对话
        complete 模式: 直接激活 {slug}-perspective skill 进角色
        simple 模式:   把 distill.json 拼成临时角色 prompt 接管
  [2] 网页视频对话 ← 默认，可以看脸可以听声
        https://7verse.ai/content/{content_id}/live?auto_start=1

直接回车走 [2]，或输 1 走文字聊。
```

**实现**：
- 默认 / 选 [2]：已经由 `nuwa2life create` 自动 `open` URL 了，只需要确保用户知道"现在可以视频通话了"被醒目告知。
- 选 [1]：
  - complete 模式：提示 `/skill {slug}-perspective` 激活，或直接用 Skill tool 调用
  - simple 模式：读 `distill.json`，把 `persona + opening_dialogs + voice_description + hard_rules` 拼成一段 system prompt，这个 skill（nuwa2life）自己接管角色扮演对话（**注意**：扮演时**不用输出 motion_prompt 括号块**——那是给 7verse 视频引擎的，不适合纯文本对话）

---

## 错误处理

| 错误 | 处理 |
|------|------|
| `nuwa2life test` 失败 | Phase 0 就在询问里展示了，让用户去终端 `setup` / `login` |
| 音频格式不支持 | 告诉支持格式，让用户重拖 |
| 音频 >10MB | 提示 `ffmpeg -i input.mp3 -t 180 -q:a 0 output.mp3` 截一段 |
| 7verse 401 | 提示 `nuwa2life login` 后自动重试 |
| 找不到合适首帧图 | 让用户手动上传 |
| simple 模式白名单里 <3 段原文 | 诚实告诉，建议切 complete |
| complete 模式 huashu-nuwa 失败/超时 | 告诉用户 complete 出了问题，问是要降级 simple 还是放弃 |

---

## 断点续做

`~/.nuwa2life/cache/{slug}/` 里已有哪些文件，`nuwa2life create` 会自动跳过对应步骤。想重来某步：删那个文件再跑。

---

## 重入 & 复用

- 如果 `~/.claude/skills/{slug}-perspective/` 已存在（之前 complete 过 / huashu-nuwa 单独生成过）：Phase 1C 的 extract 直接跑，**不重新调 huashu-nuwa**。省一大笔 token。
- 用户说「更新 {X}」：调用 huashu-nuwa 的增量更新模式（它自己知道怎么做），然后重跑 extract。

---

*Fork of [alchaincyf/nuwa-skill](https://github.com/alchaincyf/nuwa-skill) · Powered by [7verse.ai](https://7verse.ai)*

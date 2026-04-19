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
3. **调性**：清晰、专业、像一个靠谱的工具助手。直接说步骤和状态，不绕弯子。例子：
   - ❌ "丢段声音进来，别太干（我又不是来听 ASMR 的）"
   - ✅ "请提供 {人物名} 的声音样本文件（mp3/wav，30 秒以上，建议演讲/访谈录音）"
4. **保持友好但不过度**：可以简短地带一句感受（"找到了一张不错的图"），但不做角色扮演、不用梗、不吐槽。

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
  [1] simple    ~3-5 min，5 路调研（句式结构 + 反模式 + 锚定生成）
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

## Phase 1S：轻调研 Simple（~3-5 分钟）

**目标**：不是单次 LLM 一把梭编造——先抓真实语料、提炼表达结构，再锚定生成 JSON。没有真实一手语料，simple 不开生成。

### 1S.1 人物语言分流

判断 `{name}` 是中文人物还是英文人物（按名字字符 + 公开活动场景）。信息源走下面对应白名单：

#### 中文人物 — 信息源

**白名单**：
- B站原始视频（非搬运号）
- 小宇宙 / 喜马拉雅（原始播客音频）
- 微博（本人验证号）
- 权威媒体：36氪、极客公园、晚点 LatePost、财新、第一财经、虎嗅、澎湃新闻、少数派、机器之心
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

### 1S.2 五路并发搜

并行跑 5 次 `WebSearch`，搜词模板：

**中文人物**（`{name}` 替换成人物名）：
- `"{name}" 演讲实录 OR 直播文字稿 OR transcript`
- `"{name}" 经典语录 OR 口头禅 site:huxiu.com OR site:36kr.com OR site:thepaper.cn`
- `"{name}" 长访谈 OR 深度报道 OR 专访`
- `"{name}" 争议 OR 被追问 OR 怎么回应`
- `"{name}" 连麦 OR 现场 OR 怎么说 site:weibo.com OR site:bilibili.com`

**英文人物**：
- `"{name}" interview transcript OR keynote full text`
- `"{name}" podcast episode OR conversation long-form site:lexfridman.com OR site:tim.blog`
- `"{name}" essay OR op-ed OR blog post`
- `"{name}" controversy OR pushback OR how he responded`
- `"{name}" speaking style OR communication patterns OR rhetorical`

对每次 WebSearch 结果严格过**白名单**；不在白名单的源丢弃。

**搜索完成后立刻告诉用户找到了什么**（透明搜索过程）：

```
已搜索 5 组关键词，白名单内找到 {N} 个可用来源：
  ✓ {来源标题} — {url 域名}
  ✓ {来源标题} — {url 域名}
  ...
正在精读 {M} 个最有价值的页面...
```

从白名单来源中挑 4-6 个最可能含**长段真实原文**的 URL，用 `WebFetch` 精读。

### 1S.3 提炼结构化语料

把精读内容提炼成结构化 corpus，**重点不是"说了什么"，而是"怎么说"**。写入 `~/.nuwa2life/cache/{slug}/quick_corpus.md`：

```markdown
# {name} · Quick Corpus
来源：{N} 个白名单页面，{M} 条一手引语

## 一手直接引语（每条标出处 URL）
- "原话..." [source: {url}]
- ...（至少 8 条，越多越好）

## 句式模板（按结构分类，这是最重要的部分）

**[结构名称，如：假设+极端动作]**
> "例句原话"
规律：{这个结构的触发条件和效果}

**[结构名称，如：对仗口诀]**
> "例句原话"
规律：...

（提炼 4-6 种核心句式结构）

## 开场 / 收尾模式
开场：{他/她如何开始对话，具体套路}
推进：{如何掌控节奏，如何处理对方犹豫}
收尾：{典型结尾句，是否开放式}

## 反模式（他/她绝对不会说的话）
- 不会说："..." （因为：...）
- 不会说："..." （因为：...）
（至少 4 条，每条说明原因）

## 高频词 & 节奏
- 高频词：...
- 节奏规律：短句/长句比例，停顿位置，音量变化规律
- 口头禅/收尾词：...
```

**如果精读完白名单只剩 <4 条可用一手引语**：告诉用户"找到的一手资料太少，simple 模式准确度有限，建议切 complete 模式"，让用户决定继续还是切换。

### 1S.4 锚定生成 distill.json

**必须基于 `quick_corpus.md` 生成，不允许脱离语料编造**。生成约束：

- `opening_dialogs` 三条：**每条必须直接使用 corpus 里的句式模板**（能对号入座到具体结构名），不允许凭空编。其中至少一条使用该人物的真实开场套路（如果 corpus 有记录）。
- `voice_description`：必须写出 corpus 里"节奏规律"和"口头禅"里的**具体内容**，不允许写"warm and engaging" 这种空话。
- `persona`：至少引用 3 条一手直接引语（隐式引用也行，但要能对应），并点出 1 个内在矛盾（如有）。
- `listening_pose`：参考 corpus 里"推进"模式描述的肢体习惯。

**自检**（生成完立刻内部跑，不展示给用户）：
> 熟悉 {name} 的人读这 3 条 `opening_dialogs` + `voice_description`，能一眼认出是他/她吗？
> - 能认出 → 通过，继续
> - 不能认出 → 对照 corpus 重写一次（最多 1 次）；仍不通过就告诉用户"这轮人设辨识度不够，建议用 complete 模式"

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
  "voice_description": "英文声音特质（100词内），必须含真实观察到的节奏/口音/口头禅，不许用空洞形容词"
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

认可人设？或说「重写开场白」/「persona 风格调整」等，就地修改。
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

**搜图流程：多路搜索 → 脚本预筛 → VLM 精筛 → 确认。最后才让用户手动上传。**

### 2.1 多路搜图

并行跑 **3 次 WebSearch**，搜词覆盖不同场景（用 `portrait_search_query` 为基础，再加变体）：

- `{name} 演讲 OR 直播 人像 高清`（中文人物）/ `{name} keynote OR interview portrait`（英文人物）
- `{name} site:thepaper.cn OR site:36kr.com OR site:huxiu.com`（中文）/ `{name} site:nytimes.com OR site:bloomberg.com OR site:wired.com`（英文）
- `{portrait_search_query}`（原始关键词）

从搜索结果页里抽取图片直链 URL（jpg/png/webp），目标收集 **10-15 个候选 URL**。

### 2.2 脚本预筛（不用 VLM，节省 token）

对每个候选 URL，用 curl HEAD 请求快速检查，**丢弃**不符合的：

```bash
# 批量检查：Content-Type 必须是 image/*，Content-Length > 30000 bytes
curl -sI --max-time 3 "{url}" | grep -E "content-type|content-length"
```

保留 `Content-Type: image/` 且 `Content-Length > 30000`（排除 icon/缩略图）的 URL，下载到 `~/.nuwa2life/cache/{slug}/candidates/` 目录。

### 2.3 VLM 精筛（Read 图片，多模态评分）

对通过预筛的候选图，逐张 Read（多模态），**一次性评估以下所有维度**（不要多次调用 VLM）：

| 维度 | 要求 |
|------|------|
| 主体匹配 | 与 `static_summary` 描述相符（发型/体型/气质） |
| 画面清晰度 | 无明显模糊，脸部可见 |
| 无字幕/水印 | 画面内无大面积文字覆盖、台标水印（小角标可接受） |
| 景别 | 中景或近景（排除远景群照、背身照） |
| 表情自然 | 排除夸张搞笑截图、闭眼、极端情绪截图 |

综合打分（0-10），取 **≥7 分**的作为候选，选最高分一张保存为 `portrait.jpg`。

**搜完告诉用户结果**：

```
已搜索 {N} 张候选图，通过预筛 {M} 张，VLM 评分后选出最佳：

  {候选图的一句描述}（评分：{分}/10）

确认使用这张？或选择：
  「换一张」 — 使用次优候选（还有 {K} 张备选）
  「我上传」 — 手动拖一张图进来
```

### 2.4 兜底：用户上传

**仅当所有候选图 VLM 评分均 <7 分**，才请用户上传：

```
找到的图片质量不够理想（最高分 {分}/10，原因：{具体原因，如字幕遮挡/模糊/非本人}）。

请拖一张 {X} 的图进来：
  格式：jpg / png / webp
  建议：演讲/访谈正面照，无大面积字幕，越清晰越好
  尺寸：至少 400×400
```

---

## Phase 3：音频

**自动爬取优先，找不到再请用户手动提供。**

**如果 Phase 0 设定了 `voiceFallback = true`（ElevenLabs Key 失效）**：跳过本阶段，`create` 命令自动按性别/年龄匹配内置音色，告诉用户：

```
ElevenLabs Key 未配置，音频步骤跳过，已为 {X} 匹配内置音色（按 persona 性别/年龄）。
如需真实音色克隆，运行 nuwa2life setup 配置 Key 后重新执行此步骤。
```

### 3.1 自动搜索视频来源

并行跑 2 次 WebSearch 找包含 {name} 声音的视频：

**中文人物**：
- `"{name}" 演讲 OR 直播 site:youtube.com`
- `"{name}" 访谈 OR 对话 site:youtube.com`

**英文人物**：
- `"{name}" speech OR interview site:youtube.com`
- `"{name}" keynote OR talk site:youtube.com`

从结果中提取 **YouTube 视频 URL**（优先选演讲/访谈/直播片段，排除二次解说/翻唱/纪录片旁白）。

告诉用户正在做什么：

```
正在自动搜索 {X} 的音频来源...
找到候选视频：{标题} — {url}
```

### 3.2 yt-dlp 自动下载（3 分钟片段）

检查 `yt-dlp` 是否可用：

```bash
which yt-dlp
```

**可用时**，下载前 3 分钟音频：

```bash
yt-dlp -x --audio-format mp3 --audio-quality 5 \
  --download-sections "*0:00-0:03:00" \
  -o "~/.nuwa2life/cache/{slug}/voice.%(ext)s" \
  "{video_url}" \
  --no-playlist --quiet --no-warnings
```

下载完成验证文件大小（> 100KB = 成功），告诉用户：

```
已自动获取 {X} 的声音样本：{来源视频标题}（前 3 分钟）
文件大小：{size}，音质够用。
```

**如果第一个 URL 失败**：依次尝试列表里其余候选 URL，最多试 3 个。

### 3.3 兜底：用户手动提供

**仅当以下情况才请用户提供**：
- `yt-dlp` 未安装
- 所有候选 URL 下载均失败
- 下载文件 < 100KB（可能是无声/错误文件）

```
未能自动获取 {X} 的音频（原因：{具体原因}）。

请提供声音样本文件：
  格式：mp3 / wav / m4a / flac / ogg
  时长：30 秒 ~ 5 分钟（越长越准）
  大小：< 10MB
  建议：演讲/访谈片段，无背景音乐

将文件拖入终端窗口后回车：
```

接收后处理 shell 转义路径（`\ ` → ` `）；验证格式和大小；成功复制到 `~/.nuwa2life/cache/{slug}/voice.{ext}`。

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
| simple 模式白名单里 <4 条一手引语 | 诚实告诉准确度有限，建议切 complete |
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

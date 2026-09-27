# 《风之原》JSON 脚本模板文档（v1.1）

> **用途**：把这份文档 + 你想做的动作描述发给 DeepSeek（或其他大模型），
> 它会按本规范生成一段游戏脚本 JSON；把 JSON 粘进游戏左上角
> **「🎹 JSON 遥控」面板 → ▶ 执行**，角色就会像被真人操作一样自动前进、后退、
> 跳跃、滑翔、攻击、开宝箱、切换角色，镜头也会自动转向、俯仰、拉伸。
>
> **故事动作器**：配合 `say`（字幕台词）和 `cinema`（电影黑边）两个动作，
> 可以把一段故事变成"会演的电影"——DeepSeek 按故事生成分镜（镜头+动作+台词），
> 点运行后逐句演出，台词以字幕显示，还可自动配音（见[第五节](#五故事动作器故事--电影)）。

---

## 一、使用流程（3 步）

1. **复制本文档**，连同你的动作要求一起发给 DeepSeek。
   推荐直接使用[第六节的提示词模板](#六给-deepseek-的提示词模板可直接复制)。
2. DeepSeek 会**只输出一个 JSON**。把它整体复制。
3. 游戏里按 <kbd>B</kbd> 打开 JSON 面板 → 粘贴 → 点 **✓ 校验** 确认无误 → 点 **▶ 执行**。

> 提示：
> - 执行前要先点过「开始冒险」进入游戏；若还没进入，脚本会自动等待，进入后立刻开始。
> - 面板里 <kbd>Shift+B</kbd> 或「⏹ 停止」可随时中止；「⏸ 暂停」会先松开所有移动键。
> - 动作是**按顺序一条条执行**的，前一条做完才做下一条。

---

## 二、顶层结构

```json
{
  "version": "1.0",
  "name": "脚本名字（可省略）",
  "description": "给人类看的说明（可省略，游戏不读）",
  "voice": "azhong",
  "loop": 1,
  "actions": [
    { "type": "动作类型", "参数名": "值", "note": "给人类看的注释（可省略）" },
    { "type": "动作类型", "参数名": "值" }
  ]
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `version` | 建议 | 固定写 `"1.0"` |
| `name` | 否 | 脚本名，会显示在执行日志里 |
| `description` | 否 | 说明文字，游戏不读取 |
| `voice` | 否 | 全局默认配音角色（TTS 音色 ID，如 `azhong`），供所有 `say` 台词使用；单个 `say` 可用自身 `voice` 覆盖。不写则只显示字幕不配音 |
| `loop` | 否 | 整个 `actions` 列表重复执行的次数，1~99，默认 1 |
| `actions` | **是** | 动作数组，按顺序执行，不能为空 |

每个动作对象必须带 `type` 字段；`note` 是可选注释（大模型可以在这里写"为什么做这个动作"，方便人类检查）。

---

## 三、动作类型速查表

### 移动类

| type | 作用 | 关键参数 |
|---|---|---|
| `move` | 按住某方向移动一段时间 | `direction`、`duration`、`sprint` |
| `stop` | 立刻松开所有移动/冲刺键 | 无 |
| `wait` | 原地等待 | `duration` |
| `jump` | 按一次空格（跳跃；攀爬中=借力跳） | 无 |
| `glide` | 展开风之翼（在地面会自动先跳再展开） | 无 |
| `glide_stop` | 收起风之翼 | 无 |

### 战斗与交互

| type | 作用 | 关键参数 |
|---|---|---|
| `attack` | 挥剑攻击 | `count`（次数，默认 1）、`interval`（间隔秒，默认 0.55） |
| `interact` | 按 F 互动：开宝箱 / 激活锚点 / NPC 对话 | 无 |
| `key` | 按任意一个键 | `code`、`hold` |
| `character` | 切换角色 | `index` |

### 镜头类（模拟鼠标转视角 / 滚轮缩放）

| type | 作用 | 关键参数 |
|---|---|---|
| `turn` | 镜头水平转动 | `angle`（度，正=向右）、`duration` |
| `look` | 镜头俯仰 | `pitch`（度，0=平视，正=俯视）、`duration` |
| `zoom` | 镜头远近 | `distance`（4=最近，18=最远）、`duration` |
| `camera` | 一次性设定镜头（高级） | `yaw`、`pitch`、`dist`、`duration` |

### 演出类（字幕 / 电影模式）

| type | 作用 | 关键参数 |
|---|---|---|
| `say` | 显示字幕台词，可选配音，说完再继续 | `text`、`name`、`duration`、`voice`、`block` |
| `cinema` | 电影模式：上下黑边 + 隐藏 HUD | `on`（true/false） |

### 辅助 / 调试

| type | 作用 | 关键参数 |
|---|---|---|
| `teleport` | 直接传送到坐标（调试用） | `x`、`z` |
| `set_time` | 设置世界时刻 | `hour`（0~24，12=正午） |
| `log` | 在画面与面板显示一条消息 | `text` |

---

## 四、动作详细说明

### 1. move —— 移动

人物移动是**相对镜头方向**的（和手动玩一样）：`forward` 是朝镜头看到的前方走。

```json
{ "type": "move", "direction": "forward", "duration": 2, "sprint": true }
```

| 参数 | 必填 | 范围 | 说明 |
|---|---|---|---|
| `direction` | ✔ | `forward` / `backward` / `left` / `right` | 前进 / 后退 / 左移 / 右移 |
| `duration` | ✔ | 0.05 ~ 60 秒 | 持续时间，结束自动松键 |
| `sprint` | 否 | true / false，默认 false | true = 冲刺（消耗体力） |

- 距离感参考：普通走路约 **7.5 m/s**，冲刺约 **13.5 m/s**。想走 50 m 就 `duration: 6.5` 左右。
- 冲刺耗体力（100 上限，每秒约 22）；体力不足会自动变回走路。
- 游戏只有 4 个方向的离散移动，不能指定 30° 斜方向；要斜线走可用两段 move 中间夹短 `turn`。

### 2. stop / wait

```json
{ "type": "stop" },
{ "type": "wait", "duration": 1 }
```

`wait` 用来留出动画/镜头表现时间；连续两个动作之间不需要刻意停顿，需要"喘口气"的节奏感时才加。

### 3. jump / glide / glide_stop —— 空中动作

```json
{ "type": "jump" },
{ "type": "wait", "duration": 0.4 },
{ "type": "glide" },
{ "type": "wait", "duration": 2.5 },
{ "type": "glide_stop" }
```

- `jump`：地面起跳；攀爬中按 = 借力跳。
- `glide`：展开风之翼。若在地面，会自动先跳起来、在接近最高点时展翼；若已在空中则直接展开。滑翔本身每秒耗 7 体力，**建议像示例那样在 jump 和 glide 之间加 0.3~0.5s 的 wait**，展翼更自然。
- `glide_stop`：收翼自由落体。
- 陡坡（约 40° 以上）朝墙移动会**自动进入攀爬**，攀爬中 `move forward` 向上爬、`move left/right` 横移、`jump` 借力跳。

### 4. attack —— 攻击

```json
{ "type": "attack", "count": 3, "interval": 0.55 }
```

| 参数 | 必填 | 范围 | 说明 |
|---|---|---|---|
| `count` | 否 | 1 ~ 30，默认 1 | 攻击次数 |
| `interval` | 否 | 0.15 ~ 10 秒，默认 0.55 | 每次间隔（挥剑冷却 0.42s，别低于 0.5） |

攻击自带 3.5m 自动索敌，会自动面向最近的敌人。攻击时会小幅减速移动。

### 5. interact / key / character —— 功能键

```json
{ "type": "interact" },
{ "type": "key", "code": "KeyV" },
{ "type": "character", "index": 1 }
```

- `interact` 等价按 F：靠近宝箱（2.3m）/ 未激活锚点（2.8m）/ NPC（2.6m）时生效。**执行前应先用 move 走到目标旁边**。
- `key` 可按任何键，常用：`KeyF` 互动、`KeyV` 传送面板、`KeyC` 循环切换角色、`Digit1`~`Digit9` 直接选角色、`KeyM` 静音、`KeyH` 收起提示。`hold` 是按住秒数（默认 0.1，一般不用改）。
- `character`：`index: 0` = 内置小人；`index: 1..n` = 已导入的第 n 个 VRM 角色。没导入模型时选 1 会提示跳过。

### 6. turn / look / zoom / camera —— 镜头

```json
{ "type": "turn", "angle": 90, "duration": 0.8 },
{ "type": "look", "pitch": 30, "duration": 1 },
{ "type": "zoom", "distance": 15, "duration": 1.2 },
{ "type": "camera", "yaw": 180, "pitch": 20, "dist": 9, "duration": 1 }
```

| 动作 | 参数 | 范围 | 约定 |
|---|---|---|---|
| `turn` | `angle` | -1080 ~ 1080 度 | **正 = 向右转**，负 = 向左；360 = 环绕一整圈 |
| `turn` | `duration` | 0 ~ 30 秒 | 转动用时；0 = 瞬间完成 |
| `look` | `pitch` | -6 ~ 58 度 | 0 = 平视，正 = 镜头升高俯视，负 = 略微仰视 |
| `zoom` | `distance` | 4 ~ 18 | 4=贴脸特写，9≈默认，18=远景 |
| `camera` | `yaw`/`pitch`/`dist` | 同上 | 绝对设定（yaw 单位也是度，默认视角是 180）；三个参数都可只写一部分 |

`duration` 省略时默认：turn 0.6s、look 0.5s、zoom 0.5s、camera 1s。运镜时长的经验值：转 90° 约 0.8s，环绕 360° 约 4~5s 比较自然。

> 面向约定：游戏开始时镜头在角色正后方。**人物移动方向跟随镜头**，所以
> "转身 90° 再前进"就能拐弯。想让角色回头，用 `turn 180`。

### 7. say / cinema —— 字幕台词与电影模式（故事动作器）

```json
{ "type": "say", "name": "杰森", "text": "风之灵啊，指引我吧！", "duration": 3 },
{ "type": "cinema", "on": true }
```

**say（字幕台词）**

| 参数 | 必填 | 说明 |
|---|---|---|
| `text` | ✔ | 台词内容，一句建议 ≤50 字（长了会提示拆分） |
| `name` | 否 | 说话人名，显示在字幕上方的小标签（如"杰森"、"小风灵"） |
| `duration` | 否 | 字幕至少停留的秒数；省略时按字数自动计算（约每秒 4.5 字） |
| `voice` | 否 | 该句配音角色；省略时用顶层 `voice`；两边都没有 → 只显示字幕 |
| `block` | 否 | 默认 true = 说完这句再继续下一动作（电影节奏）；false = 边说边做后续动作 |

执行规则：
- 默认**阻塞**：字幕至少停留 `duration` 秒；若正在配音，会**等语音播完**才继续，所以实际时长 = max(字幕时长, 语音时长)。
- 电影模式（`cinema on`）下 HUD 会隐藏，字幕是主要信息载体，建议给足 duration。
- 配音需启动"文字变声音"服务（见第五节）；服务没启动时自动只显示字幕，不会卡住脚本。

**cinema（电影模式）**

`{ "type": "cinema", "on": true }` 进入：上下黑边 + 隐藏 HUD（任务栏/小地图/血条等），营造电影感；
`{ "type": "cinema", "on": false }` 退出。脚本结束/停止/暂停时会自动退出电影模式并收起字幕。

### 8. teleport / set_time / log —— 调试辅助

```json
{ "type": "teleport", "x": 0, "z": 24 },
{ "type": "set_time", "hour": 20 },
{ "type": "log", "text": "已到达祭坛" }
```

- `teleport`：无视地形直接落点（范围 ±320）。用于快速就位，正常游玩脚本别滥用。
- `set_time`：0=黎明前、6=清晨、12=正午、18=黄昏、20=夜晚。
- `log`：文字会弹成画面顶部气泡 + 写进面板日志，适合给脚本分段做标记。

---

## 五、完整示例

### 示例 A：走两步、转身、冲刺、跳、连击（新手向）

```json
{
  "version": "1.0",
  "name": "基础动作演示",
  "actions": [
    { "type": "log", "text": "开始演示：先向前走" },
    { "type": "move", "direction": "forward", "duration": 1.6 },
    { "type": "turn", "angle": 90, "duration": 0.8 },
    { "type": "move", "direction": "forward", "duration": 2, "sprint": true },
    { "type": "jump" },
    { "type": "wait", "duration": 0.8 },
    { "type": "attack", "count": 3 },
    { "type": "camera", "yaw": 180, "pitch": 20, "dist": 10, "duration": 1 },
    { "type": "log", "text": "基础演示结束 ✓" }
  ]
}
```

### 示例 B：冲刺跳崖 → 滑翔 → 收翼

```json
{
  "version": "1.0",
  "name": "跳跃与滑翔",
  "actions": [
    { "type": "move", "direction": "forward", "duration": 2.5, "sprint": true },
    { "type": "jump" },
    { "type": "wait", "duration": 0.4 },
    { "type": "glide" },
    { "type": "wait", "duration": 2.5 },
    { "type": "glide_stop" },
    { "type": "wait", "duration": 1 }
  ]
}
```

### 示例 C：电影感运镜（环绕 + 俯仰 + 推拉）

```json
{
  "version": "1.0",
  "name": "镜头运镜展示",
  "actions": [
    { "type": "zoom", "distance": 16, "duration": 1.5 },
    { "type": "turn", "angle": 360, "duration": 5 },
    { "type": "look", "pitch": 45, "duration": 1 },
    { "type": "wait", "duration": 1 },
    { "type": "look", "pitch": 8, "duration": 0.8 },
    { "type": "zoom", "distance": 7, "duration": 1.2 }
  ]
}
```

### 示例 D：夜晚模式 + 换角色 + 循环巡逻

```json
{
  "version": "1.0",
  "name": "夜晚巡逻",
  "loop": 2,
  "actions": [
    { "type": "set_time", "hour": 20 },
    { "type": "character", "index": 0 },
    { "type": "move", "direction": "forward", "duration": 3 },
    { "type": "turn", "angle": 120 },
    { "type": "attack", "count": 2 },
    { "type": "turn", "angle": 120 },
    { "type": "move", "direction": "forward", "duration": 3 },
    { "type": "turn", "angle": 120, "note": "转回起点方向，loop 会再来一遍" }
  ]
}
```

### 示例 E：故事模式（分镜 + 台词 + 配音）

```json
{
  "version": "1.0",
  "name": "故事模式演示",
  "voice": "azhong",
  "actions": [
    { "type": "cinema", "on": true, "note": "进入电影模式：黑边+隐藏HUD" },
    { "type": "zoom", "distance": 14, "duration": 1.5, "note": "开场远景" },
    { "type": "say", "name": "杰森", "text": "传说，在这座岛屿的尽头，藏着风的起点。", "duration": 3.2 },
    { "type": "move", "direction": "forward", "duration": 1.6, "note": "向悬崖跑去" },
    { "type": "say", "name": "杰森", "text": "就是这里了……我能感觉到，风在呼唤我。" },
    { "type": "jump" },
    { "type": "wait", "duration": 0.4 },
    { "type": "glide", "note": "跳崖展翼" },
    { "type": "wait", "duration": 2 },
    { "type": "glide_stop" },
    { "type": "wait", "duration": 0.6 },
    { "type": "turn", "angle": 180, "duration": 1.5, "note": "镜头环绕半圈面向角色" },
    { "type": "zoom", "distance": 7, "duration": 1, "note": "推近特写" },
    { "type": "say", "name": "杰森", "text": "旅程，才刚刚开始！", "duration": 2.4 },
    { "type": "cinema", "on": false, "note": "退出电影模式" }
  ]
}
```

游戏面板里内置了示例 A/B/C/D：「📖 载入示例…」下拉可选（D 即故事模式演示）。

---

## 五、故事动作器：故事 → 电影

把一段故事交给 DeepSeek，它按本规范生成分镜脚本（镜头 + 动作 + 台词字幕），
游戏里点「▶ 执行」就像播放一段小电影。推荐节奏：

1. **开场**：`cinema on` → 远景 `zoom 14~16` → 缓慢 `turn` 环境，主角念第一句 `say`
2. **发展**：`move`/`jump`/`glide`/`attack` 推进剧情，关键节点插 `say` 台词
3. **高潮/收尾**：`turn`+`zoom 6~8` 推特写 → 最后一句台词 → `cinema off`

**字幕与配音（say）**

- 字幕显示在画面底部：说话人名小标签 + 白字台词，自动淡入淡出
- 配音走本机"文字变声音"服务：
  - 启动：双击 `D:\xm\文字变声音\start.bat`（首次加载需几分钟，之后常驻）
  - 服务地址固定 `http://127.0.0.1:18062`，可用角色在浏览器打开 `http://127.0.0.1:18062/models` 查看（如 `azhong`、`ayaka`、`fengyanlin`、`liejun`…）
  - 脚本顶层写 `"voice": "角色名"` 全局生效，单个 `say` 可用 `"voice"` 换角色
  - **服务没启动也能跑**：自动降级为纯字幕，面板勾选「🔊配音」可整体开关
  - 注意：换配音角色的第一句会慢 1~3 秒（服务切音色模型），服务刚启动后的头几句要等 5~15 秒，都是正常现象——脚本会等语音播完再继续

---

## 六、给 DeepSeek 的提示词模板（可直接复制）

把下面整段发给 DeepSeek，把最后一段换成你的要求即可：

```text
你是《风之原》游戏的故事动作器脚本生成器。请把我给的故事/动作描述翻译成游戏可执行的 JSON 脚本，严格遵守以下规范：

【输出要求】
1. 只输出一个 JSON 对象，不要输出任何解释、前后缀或 markdown 代码块之外的内容；
2. 动作必须使用下方"动作类型表"中列出的 type，不得发明新动作或新字段；
3. 角度单位是度，时间单位是秒，距离已折算好，直接按我给的要求换算成 duration；
4. 动作按 actions 数组顺序执行，每个动作对象可加 "note" 字段写中文注释；
5. 顶层结构：{"version":"1.0","name":"脚本名","voice":"配音角色名","loop":1,"actions":[...]}
   （voice 是全局配音角色，如 "azhong"；loop 是整个 actions 重复的次数，1~99，不需要循环时省略）。

【动作类型表】
- 移动：{"type":"move","direction":"forward|backward|left|right","duration":秒,"sprint":false}
  （走路约7.5米/秒，冲刺约13.5米/秒；sprint:true 为冲刺；移动方向相对镜头）
- 停止移动：{"type":"stop"}
- 等待：{"type":"wait","duration":秒}
- 跳跃：{"type":"jump"}
- 展开滑翔翼：{"type":"glide"}（地面使用会自动先跳再展开；建议 jump 后等0.4秒再 glide）
- 收起滑翔翼：{"type":"glide_stop"}
- 攻击：{"type":"attack","count":次数,"interval":0.55}（自动索敌3.5米，interval不低于0.5）
- 互动(开宝箱/激活锚点/NPC对话)：{"type":"interact"}
- 按键：{"type":"key","code":"KeyF|KeyV|KeyC|KeyM|KeyH|Digit1..Digit9","hold":0.1}
- 切换角色：{"type":"character","index":0}（0=内置角色，1..n=第n个导入的VRM角色）
- 字幕台词：{"type":"say","name":"说话人","text":"台词内容","duration":秒,"voice":"角色名","block":true}
  （显示底部字幕，可选配音；默认等台词说完再继续，block:false 可边说边做；一句≤50字；
   duration 省略时按字数自动计算；voice 省略时用顶层 voice）
- 电影模式：{"type":"cinema","on":true} / {"type":"cinema","on":false}
  （进入/退出电影感：上下黑边+隐藏HUD；故事脚本建议开头进入、结尾退出）
- 镜头右转/左转：{"type":"turn","angle":度,"duration":秒}（正=右转，负=左转；转90°建议0.8秒，环绕360°建议5秒）
- 镜头俯仰：{"type":"look","pitch":度,"duration":秒}（0=平视，正=俯视，范围-6~58）
- 镜头缩放：{"type":"zoom","distance":4~18,"duration":秒}（4=特写，9=默认，18=远景）
- 镜头一次设定：{"type":"camera","yaw":度,"pitch":度,"dist":4~18,"duration":秒}（可省略部分参数）
- 传送：{"type":"teleport","x":坐标,"z":坐标}（范围-320~320，仅调试用）
- 设置时间：{"type":"set_time","hour":0~24}（6=清晨，12=正午，18=黄昏，20=夜晚）
- 提示文字：{"type":"log","text":"显示在画面上的话"}

【硬性约束】
- 所有数值必须在该动作的范围内；duration 不小于 0.05；
- 需要交互（interact）前，必须先用 move 走到目标附近；
- 滑翔落地、跳跃落地后如需继续移动，先 wait 0.5~1 秒等落地。

【如果是故事脚本（分镜创作）】
- 按"开场 → 发展 → 高潮/收尾"安排分镜：cinema on 进电影模式，远景交代环境，
  动作推进剧情，推特写（zoom 6~8）配关键台词，最后 cinema off；
- 台词要口语化、每句不超过50字，用 say 的 name 标注说话人；
- 台词前后留 wait 或用镜头动作过渡，避免画面跳变；
- 我提到"某某说/某某喊/旁白"时，一律转成 say 动作。

【我的要求】
（在这里写你的动作或故事。例如：
 "傍晚时分，杰森在山崖边眺望大海，说'风的起点，就在前方'。
  然后他冲刺跳下山崖展开风之翼，滑翔到海滩，最后镜头环绕他一圈拉近特写，
  他面向镜头说'旅程才刚刚开始'。"）
```

---

## 七、常见问题（给大模型与人类）

| 现象 | 原因与解决 |
|---|---|
| 提示"未知 type" | type 拼写错误，或用了规范外的动作。严格照速查表写 |
| 提示"缺少必填参数" | 该动作必需的参数没写，见第四节各参数表 |
| 提示"多余字段"警告 | 参数名拼写错误（如 `dirction`）。警告不阻断执行，但该参数不生效 |
| 人物不动 | 先确认已点「开始冒险」；再看日志是否动作执行报错 |
| 走的路程不够 | 走路 7.5 m/s、冲刺 13.5 m/s，按距离换算 duration；上坡/撞墙会减速或被挡 |
| 转向之后走反了 | 移动方向跟随镜头，`turn` 的正负与预期相反时取负值即可 |
| glide 没展开 | 体力不足或贴地；在 jump 与 glide 之间加 0.4s wait，并保证体力充足 |
| attack 打不到怪 | 攻击索敌半径 3.5m，先用 move 靠近目标 |
| interact 没反应 | 距离不够（宝箱 2.3m / 锚点 2.8m / NPC 2.6m），先走到目标旁边再 interact |
| 台词有字幕没声音 | ①"文字变声音"服务没启动（双击 `D:\xm\文字变声音\start.bat`）；②voice 角色名不在可用列表（开 `http://127.0.0.1:18062/models` 查）；③面板「🔊配音」没勾 |
| 配音第一句很慢 | 正常：服务刚启动头几句要 5~15 秒，换配音角色后第一句要 1~3 秒；脚本会等语音播完再继续 |
| 台词念完了字幕还在等 | say 会等 max(字幕时长, 语音时长)；觉得拖就把 duration 调小 |
| 想重复一段动作 | 把这段放进 `actions`，顶层设 `"loop": n`；或直接在 actions 里重复写 |

---

## 附：面板操作速查

| 操作 | 方式 |
|---|---|
| 开/关面板 | 点左上角「🎹 JSON 遥控」按钮，或按 <kbd>B</kbd> |
| 校验 | 粘贴后点「✓ 校验」，错误会列在下方日志（含动作序号） |
| 执行 / 暂停 / 停止 | 「▶ 执行」「⏸ 暂停」「⏹ 停止」；<kbd>Shift+B</kbd> 随时急停 |
| 台词配音开关 | 面板「🔊配音」勾选框（默认开；服务未启动时只出字幕） |
| 载入内置示例 | 「📖 载入示例…」下拉（含"故事模式演示"） |
| 查看本文档 | 面板「📄 模板文档」 |
| 输入框里打字 | 不会影响游戏角色（面板屏蔽了游戏按键） |
| 草稿 | 面板内容自动保存在浏览器，刷新不丢 |

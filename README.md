# 风之原 · 二次元开放世界（可玩原型 v0.3）

> 目标：做一款《原神》方向的二次元开放世界游戏。当前版本是**可玩的架构底座**：
> 支持自定义 VRM 角色导入、多场景切换、动作状态机、昼夜循环、收集任务。
> 技术栈：Three.js（MIT）+ three-vrm（MIT），全本地运行，无网络依赖。

## 架构树（内核驱动，逐层改造）

整个项目是一棵依赖树，`js/core/kernel.js` 是树根。**依赖只准自上而下**，
kernel 启动时拓扑排序 + 层级校验强制执行：

```
L3  game (main.js)                游戏编排：选场景/启动顺序/主循环/相机收尾
├─ L2 modules                     功能模块（每棵子树可整块替换）
│   ├─ player   玩家状态机+地形碰撞（不感知 vrm，走 Astra.poses 钩子）
│   ├─ vrm      VRM 角色加载/切换/骨骼动画（注册进 Astra.poses）
│   ├─ sky      昼夜/星空/云/灯柱（读 Astra.shared.playerPos）
│   ├─ minimap  小地图（读 Astra.shared.poi）
│   ├─ quest    收集任务（完成时 Astra.emit('quest:complete')）
│   └─ effects  光尘/烟花（监听 'quest:complete' 放烟花）
├─ L1 world                       场景服务（全部由 scene.json 驱动）
│   ├─ terrain   噪声/高度函数/地形网格/海面/落点采样
│   ├─ props     植被岩石实例化 + 草地风摆 shader
│   ├─ landmarks 鸟居/祭坛/光柱/小屋/灯柱
│   └─ sceneLoader 场景装配器
└─ L0 core                        引擎基座
    ├─ kernel    模块树/拓扑启动/事件总线/共享状态/层级校验
    ├─ engine    渲染器/相机/灯光/天空穹顶/ACES 调色
    ├─ input     键鼠输入/轨道相机
    ├─ ui        HUD/提示/体力/结算
    └─ audio     WebAudio 合成音效
```

**同层通信两条路**：事件总线 `Astra.on/emit`（如 quest:complete → 烟花）、
共享状态槽 `Astra.shared`（如 playerPos / poi）。

**逐层改造方式**：任何一个节点，保持 `id` 和对外接口不变、重新
`Astra.define({ id, layer, deps, setup, update })` 即可整体替换，
其他层零改动。例：把程序化地形换成 glTF 场景 → 只重写 `world/terrain.js`；
把程序化动画换成 VRMA 剪辑 → 只重写 `modules/vrm.js` 的 pose 部分。

## 快速开始

```bash
cd anime-open-world
python serve.py 8399              # 然后浏览器打开 http://127.0.0.1:8399
```

操作：`WASD` 移动 · `Shift` 冲刺 · `空格` 跳跃（空中再按展开风之翼）·
**陡坡自动攀爬**（40° 以上自动进入攀爬状态，消耗体力，耗尽会脱力滑落；攀爬中按空格借力跳）·
`C`/数字键 切换角色 · 鼠标拖动环视 · 滚轮缩放 · `H` 提示 · `M` 静音

## 目录规范

```
anime-open-world/
├── index.html              # 入口页（UI 样式 + 按顺序加载脚本）
├── lib/                    # 第三方引擎库（不要改）
│   ├── three.min.js        #   Three.js r147 (MIT)
│   ├── GLTFLoader.js       #   glTF 加载器
│   └── three-vrm.min.js    #   VRM 角色支持 (MIT)
├── js/
│   ├── core/               # ★ 核心层：不含任何游戏内容，一般不用动
│   │   ├── engine.js       #   渲染器/场景/相机/灯光/天空穹顶（含 ACES 调色）
│   │   ├── input.js        #   键鼠输入 + 轨道相机（含地形防穿）
│   │   ├── ui.js           #   HUD 文案/体力/提示/结算卡片
│   │   └── audio.js        #   WebAudio 合成音效
│   ├── world/              # ★ 世界层：由 scene.json 参数驱动
│   │   ├── terrain.js      #   噪声/高度函数工厂/地形网格/海面/落点采样
│   │   ├── props.js        #   植被岩石实例化 + 草地风摆 shader
│   │   ├── landmarks.js    #   鸟居/祭坛/引导光柱/小屋/灯柱
│   │   └── loader.js       #   场景装配器（读 scene.json 组装世界）
│   ├── modules/            # ★ 功能模块层（插件式，可整块增删）
│   │   ├── player.js       #   内置小人 + 动作状态机 + 地形碰撞 + 相机
│   │   ├── vrm.js          #   VRM 角色系统（加载/切换/导入/骨骼动画）
│   │   ├── sky.js          #   昼夜循环/星空/云/灯柱夜光
│   │   ├── minimap.js      #   小地图
│   │   ├── quest.js        #   收集任务/引导光柱/结算烟花
│   │   └── effects.js      #   风元素光尘/烟花
│   └── main.js             # 启动器：读场景清单 → 装配模块 → 主循环（含看门狗）
├── scenes/                 # ★ 场景包（一个文件夹 = 一个场景）
│   ├── manifest.json       #   场景清单：加一行即可在开始界面出现
│   ├── astra-island/       #   示例场景1：风之原海岛
│   │   └── scene.json
│   └── dusk-valley/        #   示例场景2：暮色山谷
│       └── scene.json
└── models/                 # ★ 角色（VRM）
    ├── manifest.json       #   角色清单：{"file":"xxx.vrm","name":"显示名"}
    ├── model1.vrm ...      #   VRoid Studio 导出的角色
```

## 怎么加内容

### 加一个新场景（不用写代码）

1. 新建 `scenes/my-scene/scene.json`（复制 `astra-island/scene.json` 改参数）
2. 在 `scenes/manifest.json` 加一行：`{"id":"my-scene","title":"我的场景","desc":"..."}`
3. 刷新页面 → 开始界面选择它

scene.json 可调字段（都在 `scenes/astra-island/scene.json` 有示例）：

| 字段 | 作用 |
|---|---|
| `terrain.seed` | 换一个数 = 换一整张地形 |
| `terrain.island` | true=四周环海的岛 / false=大陆地形 |
| `terrain.amplitude / detail` | 山有多高、地形多破碎 |
| `terrain.seaLevel / sandLine` | 海平面、沙滩线高度 |
| `terrain.plateau` | 出生高原（位置/半径/高度） |
| `sky.startTime / dayLength` | 起始时刻（0.25=正午, 0.45=黄昏）与一昼夜时长 |
| `palette.*` | 全部配色：草地/沙/岩/雪/水/树/花/鸟居/屋顶 |
| `vegetation.*` | 树/岩石/草/花数量 |
| `landmarks.*` | 鸟居、祭坛、小屋的位置 |
| `quest.crystals` | 收集物数量 |
| `spawn` | 出生点 |

### 加一个新角色

把 `.vrm` 放进 `models/`，在 `models/manifest.json` 加一行即可；
或运行时点"角色"面板的"导入 .vrm 模型"直接选文件。

### 加一个新功能模块（插件）

新建 `js/modules/my-module.js`：

```js
(function () {
  const M = {};
  M.init = function () { /* 读 Astra.world.cfg，创建物体 */ };
  M.update = function (dt, t) { /* 每帧逻辑 */ };
  Astra.onUpdate(M.update);      // 注册进主循环
  Astra.myModule = M;
})();
```

在 `index.html` 加一行 `<script src="js/modules/my-module.js"></script>`，
并在 `main.js` 的启动序列里调用 `M.init()`。

## 动作系统

- 动作状态机：`idle / run / jump / fall / land(落地缓冲) / glide(滑翔) / swim(游泳) / climb(攀爬)`
- **攀爬**：朝 40° 以上的陡坡走会自动进入攀爬（慢速移动、消耗体力、攀爬动作）；
  体力耗尽脱力滑落 2 秒；攀爬中按空格借力起跳；空中的墙会自动抓住
- 内置小人与 VRM 角色共用同一状态机；VRM 通过人形骨骼接口做程序化动画
- 扩展点：`js/modules/vrm.js` 的 `V.pose()` 可替换为 VRMA 动作剪辑
  （引入 `@pixiv/three-vrm-animation` 后，把 `models/anims/idle.vrma` 等映射到状态即可）

## 主循环健壮性

rAF 驱动 + 看门狗：标签页切后台导致 rAF 停摆时自动降级为低帧率模拟，回来恢复满帧。
`window.__step(frames, dt)` 可手动推帧（自动化测试用）。

## 已知限制与后续路线

- [ ] 场景素材目前为程序化生成（低多边形风），接真美术：把 `world/terrain.js` 换成 glTF 场景加载即可（loader 已预留装配点）
- [ ] 动作接真动画：VRMA 剪辑（见上）
- [ ] 天气系统（雨/雪）可挂为 sky.js 的姊妹模块
- [ ] NPC / 战斗 / 存档：建议按 modules 模式逐个新增
- [ ] 配套开源资源：Godot 引擎（MIT）、BoTW 卡通着色器（CC0）、VRoid Studio（免费捏角色）、
      Quaternius / Kenney / PolyHaven（CC0 素材）、Veloren（GPL 完整开源开放世界参考）

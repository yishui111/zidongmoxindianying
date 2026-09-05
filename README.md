# 二次元开放世界 —— 本地方案汇总

> 目标：像《原神》/《鸣潮》那样的二次元开放世界游戏。
> 先说结论：**目前开源社区不存在完整的二次元开放世界成品游戏**（美术素材 + 渲染管线是商业壁垒）。
> 开源社区能给你的是三层东西：完整能玩的开放世界引擎级游戏、二次元渲染技术、二次元角色素材。
> 本仓库把三层都准备好了。

---

## 一、Veloren —— 最完整的开源开放世界 RPG（已下载到本地）

- 官网: https://veloren.net ｜ 代码: https://gitlab.com/veloren/veloren (GitHub 镜像: https://github.com/veloren/veloren)
- 协议: GPL-3.0 ｜ Rust 编写 ｜ 持续开发 6 年+，每周发布新版本
- 内容：**无缝开放世界**（程序化生成的多层世界：地表/洞穴/地底）、战斗（连击/格挡/技能）、装备与打造、
  技能树、任务、NPC 村庄、地下城、世界 Boss、**多人联机**（官方服务器或本地自建）
- 画面：程序化体素卡通风格（不是二次元，但它是开源开放世界 RPG 的天花板）

### 启动方式

```
veloren\veloren-voxygen.exe   # 双击即玩（客户端）
```

- 本目录内是官方 weekly 版（2026-09-02 编译）Windows x64 原版压缩包解压而来，未做任何修改。
- 显卡要求极低，RTX 4080 可以最高画质 + 高视距运行。
- 想联机：主菜单 → Multiplayer → 选官方服务器即可（或 `veloren-server-cli.exe` 本地开服）。

---

## 二、anime-open-world —— 浏览器二次元开放世界原型（自制，可玩）

- 启动：`cd anime-open-world && python -m http.server 8399` → 浏览器打开 http://127.0.0.1:8399
- 玩法：WASD 移动、Shift 冲刺（体力条）、空格跳跃 / 空中再按展开风之翼滑翔、下水游泳、
  收集 12 枚风之晶 → 返回祭坛通关（烟花结算）、昼夜循环、小地图、引导光柱
- 技术：Three.js r147（MIT）+ 卡通着色（MeshToonMaterial 三阶色阶）+ 程序化海岛/植被/角色
- 说明：这是展示"开放世界玩法骨架 + 二次元卡通渲染"的最小原型，角色/世界全部程序化生成，无外部素材。

---

## 三、真正的"二次元"开源技术栈（想继续做原神-like 选这些）

| 用途 | 项目 | 协议 | 地址 |
|---|---|---|---|
| 游戏引擎 | Godot 4 | MIT | https://github.com/godotengine/godot |
| 卡通渲染（Godot） | Godot-Cel-Shader / FlexibleToonShader / BoTW Toon Shader | MIT/CC0 | https://github.com/EXPWorlds/Godot-Cel-Shader ・ https://github.com/CaptainProton42/FlexibleToonShaderGD ・ https://github.com/nekotogd/Godot_BoTW_Toon_Shader |
| 卡通渲染（Unity） | lilToon / UTS2 | MIT/专用许可 | https://github.com/lilxyzw/lilToon |
| 二次元角色格式 | VRM（glTF 2.0 扩展，开放规范） | 开放规范 | https://github.com/vrm-c/vrm-specification |
| 角色制作 | VRoid Studio（免费）→ 导出 .vrm | 免费软件 | https://vroid.com/studio |
| Three.js 加载 VRM | three-vrm | MIT | https://github.com/pixiv/three-vrm |
| 3D 建模/动画 | Blender | GPL-3.0 | https://www.blender.org |
| CC0 素材库 | Quaternius / Kenney / PolyHaven | CC0 | https://quaternius.com ・ https://kenney.nl ・ https://polyhaven.com |

### 推荐路线（如果想做成"原神-like"）

1. **Godot 4** 引擎 + **BoTW Toon Shader**（CC0，旷野之息风格的卡通渲染，含描边/波动的阴影）
2. **VRoid Studio** 捏二次元角色 → 导出 `.vrm` → Godot 用 VRM 插件加载
3. 世界生成/玩法逻辑可以参考移植本仓库 `anime-open-world/js/game.js` 里的玩法骨架（体力/滑翔/游泳/昼夜/小地图）
4. 参考 Veloren 的世界生成与网络代码（GPL，注意协议传染：用了它的代码，你的项目也必须 GPL 开源）

---

## 目录结构

```
anime-open-world/     # 浏览器版二次元开放世界原型（自制）
  index.html
  js/game.js
  lib/three.min.js    # Three.js r147 (MIT)
veloren/              # Veloren weekly 官方原版（GPL-3.0），双击 veloren-voxygen.exe 即玩
```

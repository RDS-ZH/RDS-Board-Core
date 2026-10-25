# 山屋惊魂 · 2.5D 沉浸化改造

> 目标：把山屋从“可玩的规则夹具”提升为 **准静态 2.5D 恐怖桌游**；规则留在 module，镜头/灯光/声音/卡面留在 render/UI，模拟器底座缺陷单独修复。
> 本地检查点：`checkpoint/pre-betrayal-polish-20261024`。

## 1. 视觉方向

- **镜头**：默认 2.5D 等轴俯视；点击房间可进入近景，点击“全部”回到全宅。
  放置房间时镜头短暂抬高；确认后瞬时回位，再平滑平移到人物走进的新房间（保持 bearing 与相机→目标距离，是平移不是推拉）。
  角色在房间之间走动时同样会跟随平移（SA-90 / SA-91）。
- **房间**：无顶 2.5D 房间盒体，木地板、门洞、墙纸、家具按房间 ID 确定性布置；门洞走廊保持可通行，家具不得堵门。
- **卡牌**：3D 卡面负责远景可读性（类型/名称/数值）；点击实体打开羊皮纸详情页，使用线刻 SVG 图版（骷髅、眼、鸦、手、武器、绳、钥匙、书、烛、心、幽灵、事件、房间）。
- **氛围**：暗角、暖色吊灯 + 冷色环境光；房间发现时卡牌/板块从上方落入，镜头不强制跳切。

## 2. 声音分层

| 层 | 内容 | 触发 |
| --- | --- | --- |
| 底层环境 | 一层风/钟摆、地下室低频、二层风声、五个作祟主题 | 当前楼层 / 作祟 |
| 房间动机 | 每间房 3 音短动机，按房间 ID 确定性变调；熔炉/厨房附带机械 tick | 进入房间 |
| 事件/剧情 | 低频不协和 stinger，按标题关键词选择 dread/fire/wind | 抽事件牌、作祟公告 |
| 动作 | 开门、抽牌、翻牌、弃牌、骰子、脚步、物品拿起/放下/使用、战斗、建造、筹码、雷声 | 视觉事件 |

所有声音为 Web Audio 程序化合成，无外部版权素材。

## 3. 交互原则

1. **实体优先**：点房间 → 近景 + 房间档案；点卡牌 → 羊皮纸详情 + 该实体的动作快捷按钮（使用/丢下/放置/拾取）。
2. **菜单兜底**：动作栏保留，但不再要求玩家先读菜单才能完成常见操作。
3. **暂不移动逻辑坐标**：近景、楼层、镜头都是表现层；`GameState` 只保存房间/位置/slot。
4. **点击棋盘 node/edge 默认 inspect**，必须先进入 targeting 才能移动/建造。

## 4. 现有剧本

- HAUNT #1 木乃伊苏醒
- HAUNT #3 活死人之夜
- HAUNT #5 月圆狂兽
- HAUNT #6 巨眼降临
- HAUNT #10 怨灵的拥抱

外加演示用剧本（顶栏 `❖ 剧本` 下拉可选）：`exploration` 半探索洋馆、`omen_ready` 作祟检定、
`trade_ready` 交易、`room_features` 煤槽/金库/电梯/坍塌之室同场。

每个剧本已有目标、怪物、特殊规则与作祟序章文本。后续新增剧本时：
- 规则写在 `games/betrayal/haunts.ts` + `rules.ts`；
- 叙事写在 `HauntDef.intro` / objective；
- UI 不新增按剧本 ID 的分支，只消费 `globalVars.haunt`。

## 5. 模拟器底座问题记录

| 问题 | 层 | 处理 |
| --- | --- | --- |
| 新 mesh `matrixWorld` 未更新导致落定到错误表面 | render | `surfaceYAt` 查询前 `scene.updateMatrixWorld(true)` |
| 放置房间时相机每次旋转都 fit | render | 放置前保存 pose、旋转不 fit、结束后缓动恢复 |
| 拖动实体高度自激上升 | render | raycast 用 Set 排除实体及其子 mesh，而不是 `visible=false` |
| 松手在 HUD 上丢失 pointerup | render | 实体 pointer capture + 统一 release/cancel |
| 房间物品视觉锚点重复计算 | render | 模块 `PlacementSlot.local/visual` 成为唯一契约 |
| 丢弃目标可能跨房间 | module | `dropItem` 只取 `activeRoom`，`PLACE_ENTITY` 校验目标 slot 的 nodeId |
| 卡牌 sheet 只有文字 | UI | 增加确定性线刻 SVG 图版与实体动作快捷按钮 |

## 6. 验证

统一走 `pnpm` 脚本，口径见 [AGENTS.md](../AGENTS.md)：

```bash
pnpm test && pnpm test:matrix && pnpm test:ui
pnpm probe:layout && pnpm probe:overlap
node node_modules/typescript/bin/tsc --noEmit && pnpm build
```

山屋专用的端到端脚本（按需手动跑，均已入库）：

| 脚本 | 覆盖 |
| --- | --- |
| `scripts/verify-nav-arrows.mjs` | 地面导航箭头走入相邻房间 |
| `scripts/verify-special-moves.mjs` | 楼梯跨层 / 露台跳下 / 攀绳 / 电梯 / 金库特性 |
| `scripts/verify-placement-live.mjs` | 摆放期间的实时布局预演与门位连通 |
| `scripts/verify-placement-camera.mjs` | 放置结束后镜头回位并平移到人物 |
| `scripts/verify-actor-follow.mjs` | 角色移动时镜头跟随平移 |
| `scripts/verify-feedback.mjs` | 近期动态面板与受伤/属性变化反馈 |

截图：`pnpm shots`（`shots/` 不入库，见 `.gitignore`）。

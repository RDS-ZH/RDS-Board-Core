# 模拟器本体优化审计

> 目标：把“手测/黑盒/回放发现的问题”从一次性修复变成**持续收集的模拟器质量清单**。
> 规则夹具（Catan / Betrayal / …）只是触发器；这里记录的是内核、应用层、渲染层、交互层需要长期优化的问题。
>
> 基线：`126 passed / 0 failed / 0 boundary violations`（`node scripts/test-core.mjs`）。

---

## 1. 记录协议

每个问题必须有：

| 字段 | 说明 |
| --- | --- |
| ID | `SA-xx`，稳定不复用 |
| 严重度 | P0 阻断规则 / P1 明显错误或误导 / P2 体验/可维护性 |
| 来源 | 手测、黑盒测试、回放、投影/不变量、代码审计 |
| 现象 | 可复现的最小描述 |
| 根因 | 内核 / 模块 / 应用 / 渲染 / UI 接口 |
| 状态 | 已修复 / 部分 / 待办 / 设计取舍 |
| 验证 | 对应测试、脚本或截图 |

新增问题先登记，再决定是否本轮修。修复后保留记录，不删除历史。

---

## 2. 本轮已修复

| ID | 严重度 | 问题 | 根因 | 修复 | 验证 |
| --- | --- | --- | --- | --- | --- |
| SA-01 | P1 | 抽到房间板块后自动选第一个朝向，玩家不能决定方向 | 模块 reducer 内 `findRotation` 自动落板块 | 拆成 `EXPLORE_DOOR`（抽牌，存 `pendingRoomPlacement`）+ `PLACE_ROOM`（玩家选合法旋转） | `drawn room waits for player-chosen orientation` |
| SA-02 | P1 | 丢弃物品按钮没有真正落到房间物品堆 | `DROP_ITEM` 被当成“高亮后点 3D 卡牌”的分组；手牌卡片渲染在原点，难以点中 | 每件物品一个独立“丢下”按钮；手牌区增加锚点；房间物品堆可拾取 | `a single highlighted drop executes...`、UI flow |
| SA-03 | P1 | 新房间只连接探索来源房间；与已有相邻房间的门不连通 | `exploreFromRoom` 只调用一次 `connectRooms` | `connectAdjacentDoors` 扫描同层四邻，双方门相对即建立无向边；反向边去重；写 `ports` | `adjacent doors connect beyond the explored room` |
| SA-04 | P1 | 旧实现把房间网格限制在 5×5，边缘方向无法继续摆放，和实体规则不符 | 模块内 `GRID_MAX` 边界校验 | 移除固定边界；房间坐标可任意扩展，39 块牌堆限制规模；相机按包围盒取景 | `room placement is not clamped to a 5x5 grid` |
| SA-05 | P0 | 新房间与来源房间产生正反两条边，invariant `duplicate edge` 拒绝落板块 | `connectRooms` 只按固定方向 id 去重，未检查反向 id | `connectRooms` 同时检查正/反向边；已有单向边升级为无向门 | 全量 126 用例 |
| SA-06 | P1 | 点击掉落的卡牌会直接拾取，无法查看物品效果 | `pickTarget` 对任何实体点击都匹配第一个 `entityId` 合法动作 | 无“目标模式”时实体点击改为**查看**；先点“拾取物品堆”再点卡牌才拾取 | `clicking a dropped card inspects it instead of picking it up` |
| SA-07 | P2 | 物品卡面文字被截断，功能说明不完整 | 卡面固定 7 行、20px | 长文本缩小一次并允许 10 行；点击实体弹出含完整 `desc` 的 toast | 渲染截图 + 手测 |
| SA-08 | P2 | 朝向选择弹窗遮挡桌面，落点不可见 | 用通用 payload modal 处理 `PLACE_ROOM` | 桌面预载半透明房间 + 底部“旋转房间 / 确认放置”；不再打开 modal | `shots/betrayal-room-preview.png` |
| SA-09 | P2 | 怪物回合由叛徒 reducer 自动跑，玩家无法逐只操控 | 没有非玩家行动者 | `Npc` actor + `actorOrder` + `MOVE_NPC`/`ATTACK_HERO`/`END_NPC_TURN` | `monsters are NPC actors...` |
| SA-10 | P1 | 房间牌堆顺序/身份可能通过 `globalVars` 泄露 | 字符串数组不在 observer 的实体投影体系内 | 房间板块改为 `zone_room_deck` TILE 实体；observer 裁剪隐藏节点/边 | `projection: hidden map nodes...` |
| SA-11 | P1 | 空间查询分散在山屋私有 helper，无法被选择器/UI 复用 | `GameModule` 只有 `topology` 标签 | `TopologySpec` + `SpatialQuery` + `MapGraphManager` 图算法 + 引擎访问器 | `SpatialQuery`/graph 测试 |
| SA-12 | P1 | 效果/持续修正没有生命周期，模块各自手写 | 没有通用 effect 槽位 | `GameState.effects`、`EffectInstance`、turn/clock/phase 过期、可见性投影、invariants | `effects expire and are projected...` |
| SA-13 | P1 | 动态长条布局会把房间挤出镜头，或诱导重排逻辑坐标 | 相机固定 preset，不按图包围盒取景 | 保留逻辑坐标；渲染层按节点/预览包围盒自动拉远相机（`fitCameraToBoard`） | 手测长排房间 |
| SA-14 | P1 | 曾把 camera/layout hints 放进 `GameCapabilities`，污染核心契约 | 表现策略与几何拓扑没有分层 | 移到 `src/app/layout.ts`；renderer 只接收结构化 `LayoutHints`，不再按 gameId 分支 | `tsc`/手测 |
| SA-41 | P1 | 全量重建棋盘对象时只 remove，不 dispose geometry/material；阴影贴图每帧更新 | Three.js 生命周期与阴影更新策略缺失 | `clearBoardObjects` 释放几何/材质（共享纹理缓存保留）；`shadowMap.autoUpdate=false`，仅棋盘变化时 `needsUpdate` | UI flow / 构建 |
| SA-44 | P1 | 坐标语义升级后，旧会话里的 world position 被新 grid 投影误读，房间视觉重合 | 节点没有声明坐标空间 | `MapGraphNode.positionSpace` 显式标注；缺省按 legacy world 处理 | `legacy world positions remain world positions` |
| SA-45 | P1 | 楼层水平间距 9.6 小于楼层底板宽 12.6，一楼/二楼地板与边缘房间发生视觉重叠 | 表现层固定 offset，未考虑楼层实际宽度 | 山屋改为 `layerMode: 'auto'`，按当前楼层包围盒动态计算层偏移；底板/标签/camera 同步重算 | `projection: auto floor layout...`、`shots/betrayal-auto-floors.png` |
| SA-46 | P1 | 拖拽实体时 OrbitControls 同时旋转相机，视角晃动 | card drag 与 camera orbit 共用 pointer | 实体 drag 开始 `controls.enabled=false`，结束恢复 | UI drag test: camera unchanged |
| SA-47 | P2 | 同类型卡牌没有视觉分组/数量徽章 | 所有卡牌平铺/各自布局 | `render/cardGroups.ts` 按 zone+name+face+owner+visibility 做表现分组；默认扇形、×N 徽章、拖徽章整组、拖顶牌单张；纯视觉不写 state | `cards: presentation grouping...` |
| SA-48 | P2 | token/骰子穿模、阴影不自然 | 无物理，3D 结果只靠静态位置 | 表现层 Rapier 3D：懒加载、固定步长、桌面 collider、仅 token/dice；不写核心状态；阴影改进另立任务 | physics probe: body falls from y=2 to table, 0 console error |
| SA-49 | P1 | 拖动实体越飞越高、放置无法落定 | Three.js raycast 忽略 `visible=false` 导致 `surfaceYAt` 反复击中正在拖拽的实体自身形成正反馈高度累加；松手时也以此高空位置作为目标 | `surfaceYAt` 使用 Set 树形过滤排除被拖实体及其所有子网格；拖动高度稳定在下方表面 +0.45；松手执行 220ms ease-out 下落动画并落定到支撑面 | UI matrix `betrayal:drag-settle-flow`: 15 次往复拖动 heldRange=[0.31, 0.47]，松手后 settledY=0.08 |

---

## 3. 动态布局策略

这是本模拟器必须长期遵守的边界：

### 3.1 逻辑坐标不因镜头/桌面大小而重排

`MapGraphNode.position` / grid `col,row` 是规则状态的一部分，门位、相邻门自动连通、回放哈希都依赖它。
**不能**因为“这一排放不下”就把已有房间挪到第二排或压缩坐标，否则：

- 门的方向与相邻关系会变成假的；
- 玩家已建立的桌面心智地图被破坏；
- 回放/截图/日志中的位置不再可信。

### 3.2 放不下时按优先级处理

| 优先级 | 手段 | 说明 |
| --- | --- | --- |
| 1 | **相机自动取景** | `fitCameraToBoard` 按所有房间 + 待放置预览的包围盒拉远、重新居中；不改变逻辑坐标 |
| 2 | **楼层隔离** | 多楼层只显示当前楼层（K14）；山屋三层横向铺开时尤其需要 |
| 3 | **模块边界拒绝** | 目标格已占用或房间牌堆耗尽时，合法动作阶段不生成 `EXPLORE_DOOR` |
| 4 | **规则级扩展** | 若某游戏规则允许扩建/新翼/任意坐标，由模块扩展 `mapGraph` 和 `TopologySpec`；内核不自动 wrap |
| 5 | **总览/小地图** | 超大地图用缩略图 + 视口框导航；仍不改变状态坐标 |

### 3.3 山屋的具体答案

- 山屋房间是**开放桌面布局**，不是固定 5×5；一排放满只会受 39 块牌堆限制，不会因为“超出网格”而被拒绝。
- 如果目标格已有房间，探索动作本来就不会生成；应走其他门、楼梯或另一层。
- 镜头会把整层/整桌拉远；如果仍太宽，应使用楼层隔离，而不是移动房间。
- 当前已实现相机自动取景；楼层隔离/小地图仍属于 K14。

### 3.3.1 硬约束：单个房间板块的几何必须落在自身 footprint 内

这是**渲染正确性约束**，不是美术偏好：

| 量 | 值 | 含义 |
| --- | --- | --- |
| 板块边长 | 2.84 | 地板 slab 与所有装饰的最大外沿 |
| 板块半宽 `HALF` | 1.42 | 任何顶点 `|x|`、`|z|` 不得超过它 |
| 棋盘格距 | 2.86 | 房间中心间距 |
| 相邻板块近边 | 1.44 | 因此留出 **0.02** 净距 |

一旦某件装饰越过 `HALF`，它就会进入邻块的 0~0.02 缝隙，并在**与邻块共面的水平面**（基座顶面 `y=0.03`、门楣、线脚）产生 z-fighting 闪烁。
历史上正是以下四处越界（最远 +0.025）：

- 基座外沿 `size + 0.04`；
- 门槛铜板 `THICK + 0.05`；
- 门楣黄铜压条 `THICK + 0.07`；
- 屋顶线脚 `len + 0.012`（两端各出挑 0.006）。

回归方式是**几何测量**而不是盯图：
`node scripts/probe-overlap.mjs` 会遍历所有已放置房间的合并网格，逐顶点换算世界坐标并断言 `ext ≤ 1.42`。
新增任何贴墙 / 贴角的构件后都应跑一次。

### 3.4 分层边界
- **core**：只处理 `GameMapGraph`、`TopologySpec`、`nodes/edges` 与通用图算法；
  - 不存相机位置、缩放、padding、UI 布局。
- **app**：`src/app/layout.ts` 维护“游戏 id → 演示取景 hints”的映射；
  - 这是产品表现策略，不是游戏语义。
- **render**：定义自己的 `LayoutHints` 结构，按节点包围盒取景；
  - 不按 `gameId` 分支，不读 `GameCapabilities` 里的相机字段。
- **module**：只提供逻辑坐标（`MapGraphNode.position` / grid col,row），不提供镜头。

后续若加 `bounds`/`layout` 契约，也只应放在 `TopologySpec`（几何边界）或 app/render（表现），不能把“镜头怎么摆”塞回 `GameModule`。

---

## 4. 待办清单

### P0：规则正确性/状态一致性

| ID | 问题 | 影响 | 建议 |
| --- | --- | --- | --- |
| SA-20 | ✅ 已修复：`PLACE_ROOM` 非法旋转 | payload 只校验枚举，未校验 pending 合法朝向 | Betrayal `validatePayload` 在 reducer 前拒绝；回归 `PLACE_ROOM rejects illegal rotation` |
| SA-21 | ✅ 已修复（回归覆盖）：隐藏节点/实体 ID 可能从公开字段泄漏 | 实体投影与自定义字段投影分离 | 增加全夹具 + 多 seed 投影泄漏测试；fixtures 当前 0 泄漏 |
| SA-22 | ✅ 已修复：NPC 动作缺少控制权校验 | 只校验 actor 存在 | engine 校验 `controllerId`；GOD 放行；回归 `NPC actions require controlling viewer` |
| SA-23 | ✅ 已修复：topologySpec 与 mapGraph.topology 未交叉校验 | 声明与 setup 两份手工数据 | 启动校验 kind/adjacency/directed/geometry/layers；修正山屋/三国杀声明 |

### P1：表达力/交互

| ID | 问题 | 影响 | 建议 |
| --- | --- | --- | --- |
| SA-24 | ✅ 已修复：选择候选读 raw state | 候选生成绕过投影 | 候选统一走当前 viewer projection；对手手牌返回空 |
| SA-25 | ✅ 已修复：棋盘目标模式是隐式 session 状态 | 切换视角/重建可能残留高亮 | `setViewer` / `rebuild` 清理；后续可暴露到 snapshot UI state |
| SA-26 | ✅ 已修复：动作栏 24 条截断 | 线性截断 | 取消截断，END_TURN 固定最后 |
| SA-27 | ✅ 已修复：手牌 >7 重叠 | 固定卡宽/步长 | 按数量自适应 cardScale/step；10 张仍保持间距 |
| SA-28 | ✅ 已修复：无目标模式 node/edge 直接执行 | UI 回退匹配任意 legal action | inspect-first；必须从动作栏 targeting |
| SA-29 | ✅ 已修复：预览旋转刷新丢失 | 仅 session 内存 | 按 game/seed/scenario/defId 写入 sessionStorage，仅表现层 |
| SA-30 | Catan/Sanguosha 未实现 `SpatialQuery` | 引擎空间访问器回退到通用图，无法表达港口/座位特殊规则 | 按需补模块实现；无空间语义时显式 `topologySpec.kind='none'` |

### P2：体验/可维护性

| ID | 问题 | 影响 | 建议 |
| --- | --- | --- | --- |
| SA-31 | 物品卡面仍是固定像素排版，极长描述仍可能截断 | 文本完整性 | 以 DOM 卡牌详情为主，3D 卡面只做摘要 |
| SA-32 | ✅ 已修复 | 预览不说明合法朝向 | 面板只显示当前角度 | 显示合法朝向数量与角度列表 |
| SA-33 | `PLACE_ROOM` 只支持单选旋转，未支持“先看板块再决定抽/弃” | 规则差异 | 若规则要求可弃置，增加 `DISCARD_TILE` 动作 |
| SA-34 | ✅ 已修复 | UI 流程覆盖不足 | 旧脚本只跑主路径 | 新增全夹具 UI matrix；后续补三次旋转/多物品专项 |
| SA-35 | `docs/BETRAYAL` 的规则覆盖表与实现细节仍会随内容增加漂移 | 文档可信度 | 每次新增卡牌/剧本同步 `content tables` 测试与矩阵 |
| SA-36 | K3 effect 槽位尚未迁移山屋物品/击晕 | 内核能力空转 | 把 `customProps.effects`、`stunTurns` 迁到 `EffectInstance`，保留兼容读取 |
| SA-37 | K4 两阶段检定窗口未做 | 幸运石/掷后反应仍自动 | 增加 `RollWindow`：修正声明 → 掷骰 → 掷后响应 |
| SA-38 | K8 secrets / K9 批量 / K12 DSL / K14 楼层 | RFC 剩余波次 | 按 `KERNEL-EXPRESSION.md` 的 Wave 3 推进 |
| SA-39 | 超长布局只有自动拉远，没有小地图/视口框 | 房间多时导航困难 | 总览模式 + 点击小地图跳转；不重排逻辑坐标 |
| SA-40 | 部分修复：楼层只能全部平铺 | 横向宽度浪费 | HUD 楼层按钮 + `scene.focusFloor` 相机聚焦；renderer 尚未隐藏其他层 |
| SA-42 | ✅ 已修复 | 开放房间网格可超出静态桌垫/楼层底板 | 楼层底板按实际房间包围盒动态计算宽深与中心 |
| SA-43 | 无合法探索时 UI 不解释原因 | 玩家不知道是牌堆空、门位不匹配还是目标被占 | 在动作栏显示“此方向无可放置板块/目标已占用” |
| SA-50 | P1 | 拖动释放到 HUD/画布外后卡牌悬空、相机锁死 | pointerup 只监听 canvas，释放到 HUD 时 drop/end 回调丢失 | entity pointerdown `setPointerCapture`；释放/取消统一收尾；pointerdown 立即禁用 OrbitControls | UI probe: release over HUD → y=0.08, controls=true |
| SA-51 | P1 | 丢弃牌后卡牌穿到房间底板下方 | 新建 mesh 尚未渲染，`matrixWorld` 仍为旧矩阵，`surfaceYAt` 误把桌面当支撑面 | 射线查询前 `scene.updateMatrixWorld(true)`；丢弃后落到房间顶面 | UI matrix `betrayal:discard-settle`: cardY=0.125, surfaceY=0.110 |
| SA-52 | P1 | 丢弃牌房间正确但视觉锚点由 renderer 二次推断 | 房间 zone 与 PlacementSlot 已存在，renderer 仍用 `+0.16/+0.48` 硬编码 | module 的 `PlacementSlot.local/visual` 成为唯一表现契约；renderer 按 slot 的 local/layout/gap/height/scale 绘制 | UI `betrayal:discard-settle`；同房间丢弃测试 |
| SA-53 | P1 | 房间放置时相机在每次旋转后重新取景，放置后又停在高位 | fitSignature 含预览 position/rotation；放置结束直接 fit 新图 | 放置开始时记录原相机，缓慢抬高取景；旋转不再触发 fit；确认/取消后 650ms 回到原相机 | UI matrix `betrayal:rotation-flow`: 30.7→34.7→30.7，旋转相机不变 |
| SA-54 | P1 | 房间缺乏空间感，扁平贴图无法传达山屋洋馆质感 | 仅单一 flat box 贴图，缺少建筑立面与内部摆设 | 实现 2.5D 切角双向墙体（北西高面+东南低切角）与门位门框，根据房间类型自动生成大楼梯、书架、实验台、石棺、熔炉、金库、四柱床等特色 3D 摆设 | 视觉截屏 + 129 用例通过 |
| SA-55 | P1 | 房间发现与放置生硬突兀，朝向选择依赖底部菜单 | 缺乏物理落地动效；旋转操作需在底栏点击 | 新增 380ms 缓动下落撞击落定动效；在 3D 预览板块上方渲染可直接点击的旋转环与确认绿盘 | `renderLoop` 动态缓动 |
| SA-56 | P1 | 交互重度依赖底部动作坞菜单，破坏桌游实体操控手感 | 早期安全策略（SA-28）将非 targeting 状态一刀切拦截为 inspect | 重构为上下文智能实体点击路由：点击相邻房间直接走、点击门位直接开、点击实体直接互动/攻击，同时保留安全检阅机制 | 全量 129 用例通过 |
| SA-57 | P1 | 卡牌素材过于现代扁平，不契合古旧诡秘洋馆基调 | 通用现代化单色边框与平铺背景 | 全面重构为焦边古旧泛黄羊皮纸、血渍暗斑、奥术暗纹水印、哥特双金边花框、专属预兆/遗物/事件徽记与古魔导书压金箔卡背 | 3D 场景与卡牌渲染测试 |
| SA-58 | P1 | 音效过于简陋且无动态音乐，游戏沉浸感不足 | 仅 6 种基础单音，无声景机制 | 构建全自研 Web Audio 动态声景音乐引擎：三层楼独立环境音（座钟/次低音深渊/破窗阴风）+ 5 大作祟专属动态 BGM + 全套战术音效（脚步/转轴/石板/武器） | 0 外部文件依赖，实时流式生成 |
| SA-59 | P1 | 剧本数量与剧情深度不足 | 仅 3 个初始剧本点名 | 完善现存 3 剧本叙事文案，新增 #3「活死人之夜」（圣水调配/圣化仪式/僵尸潮）与 #5「月圆狂兽」（打造银弹/月相压制/嗜血扑击）两大剧本 | 黑盒矩阵 35 seed-runs 2980 动作 100% 通过 |
| SA-60 | P0 | **相邻房间墙体/基座互相插入并出现渲染闪烁（z-fighting）** | 底座外沿用 `size+0.04`、门槛板 `THICK+0.05`、门楣横梁 `THICK+0.07`、屋顶线脚 `len+0.012`，几何最远到 ±1.445；而棋盘格距 2.86、板块半宽 1.42，相邻板块近边在 1.44 —— 两块基座在 `y∈[0,0.03]` 上共面重叠 0.005~0.025 | 全部收进板块footprint：底座 `size-0.02`、门槛与门楣取 `THICK`、线脚去掉 0.012 出挑、角柱内缩到 ±1.335。`scripts/probe-overlap.mjs` 实测 14 个房间包围盒均 ≤ ±1.420，相邻板块留 0.02 净距 | `node scripts/probe-overlap.mjs` → `No room bleeds past its tile footprint.` |
| SA-61 | P1 | 玩家/怪物棋子比例失控，一人多高盖住家具 | 通用 meeple 高约 0.9，而室内净高仅 0.42 | 新增 `TokenMeshBuilder.createCharacterMiniature()`：圆底座+黄铜圈、锥形斗篷、头部与帽檐，总高约 0.29；叛徒带兜帽与余烬眼、怪物加驼背与红光眼；站位改到房间中心 0.3 半径内 | 主卧/图书馆截图；棋子不再遮挡床与扶手椅 |
| SA-62 | P1 | 相机自动取景距离过于保守，整桌只占画面约一半 | `max(span)*1.22+6`，与 FOV/宽高比无关 | 改为按真实垂直/水平 FOV 反解距离（Z 向按俯角压缩），并保留"不主动拉近用户已选距离" | 整桌截图棋盘占满画幅 |
| SA-63 | P1 | 三维内核检查器默认展开，遮挡三分之一棋盘 | 面板 `collapsed=false` | 改为默认折叠，按钮不再默认高亮；`I` 键仍可展开 | HUD 截图 |
| SA-64 | P1 | 全屋无局部照明，暗房间里家具细节不可读 | 仅全局平行光 + 中央吊灯 | 新增跟随相机焦点的"检视灯"：随相机距离在紧凑聚光与大面积洗墙之间插值，并按 `1/d²` 补偿强度 | 房间特写与整桌截图 |
| SA-65 | P1 | 家具会挡门口 / 堵死通道 | 早期硬编码摆件无门位概念 | 新增 `render/procedural/roomLayout.ts`：门廊禁区（0.92×0.58）+ 精确 AABB 互斥 + 连通性洪水填充（每个门必须互相可达），座椅围绕主桌生成 | `layout: furniture never blocks a doorway...`、`probe-layout.mjs` 0 门位冲突 |
| SA-66 | P2 | 墙面完全空置，房间缺少"宅邸"的居住感 | 只有家具，没有任何壁面陈设 | 新增壁挂陈设 `portrait`（鎏金画框+暗色肖像）、`sconce`（黄铜壁烛+火光晕）、`tapestry`（织锦+纹章）；由 `decorateWalls()` 沿无门墙段确定性悬挂，遇高柜只挂高处壁烛，遇窗户自动让位 | 主卧/舞厅特写；`probe-overlap` 仍 0 越界 |
| SA-67 | P2 | 玩家看不到当前房间的叙事与在场者 | 房间文本 `props.text` 只存在状态里，UI 没有出口 | 新增右上「房间档案」面板：中/英文名、楼层徽章、门位罗盘、印刷描述、在场英雄/怪物/遗物；`◎` 按钮经 `PresentationPorts.focusRoom` 触发镜头特写 | 整桌截图（BALLROOM 卡片）与 UI 矩阵 |
| SA-68 | P1 | 节流帧下卡牌/房间落定动画停在半空，卡片陷进地板 | `settleCard` / 房间落定完全依赖 rAF 推进补间 | 帧循环超过 120ms 未 tick 时判定为节流，直接落定到目标高度（正常帧率仍保留缓动） | UI 矩阵 `betrayal:discard-settle` cardY=0.330 > surfaceY=0.315 |
| SA-69 | P2 | 点击卡牌只能看到一个纯文本 toast，卡面信息（类别/次数/可交易）全部丢失 | `pickTarget` 对实体只发 `title + desc` 字符串 | `UiNotice` 增加可选 `card: UiCardDetail`；HUD 渲染**做旧羊皮纸卡牌浮层**：牌型色带（预兆=酒红/遗物=赭金/事件=铅灰）、火漆印章、英文副标题、描述正文、事实表（类别/剩余次数/不可交易/随从） | `scripts/shoot-card.mjs` 三种牌型均 `sheet=open` |
| SA-70 | P2 | HUD 是冷调深蓝石板色，与山屋的烛光羊皮纸基调冲突 | 全站共用一套 slate 主题 | 新增 `theme-gothic.css`：`[data-theme="gothic"]` 覆盖 `--ink/--panel/--text/--muted` 等变量，并单独调校顶栏、游戏胶囊、角色卡、动作坞；HUD 按 `gameId === 'betrayal'` 自动挂载 | 舞厅/卡牌截图；其他四款游戏不受影响 |
| SA-71 | P1 | 枝形吊灯悬在半空（洋馆剖面没有天花板），读起来像穿模 | `chandelier` 是 `ceiling` 摆件，固定挂在 y=0.95 | 重构为**落地六臂烛台**：三脚底座、车削灯柱、环形灯盘、六条托臂与烛焰，高 0.7；改为 CENTER 摆件参与布局碰撞 | 舞厅截图；`probe-layout` 166 placed |
| SA-72 | P2 | 衣柜是一整块封闭方块，近看没有任何信息量 | 双门全闭，内部为空 | 衣柜重做：柜体分板 + 内部隔板与挂衣杆 + 三件外衣 + 叠放织物；**右门以 26° 半开**露出内部，开门方向纳入占地深度（depth 0.4）避免与邻件穿插 | 主卧/客房特写；`probe-overlap` 0 越界 |
| SA-73 | P1 | 点击房间只是弹一条 toast，右侧房间档案不会跟随 | 检查操作不产生 state 变更，HUD 只在快照刷新时重绘 | `UiNotice` 增加 `roomId`；点击房间房间即"钉住"档案并立即重绘（不依赖快照），角色换房时自动解除钉住 | `scripts/tmp-pin` 实测 舞厅 → 点击门厅 → 卡片切到门厅，`◎` 镜头移入 |
| SA-74 | P2 | 门厅是每局第一眼看到的房间，但只有 4 件小摆设，空旷 | 起始房间与普通房间共用同一套摆件清单 | 新增 `addFrontDoor()`：石质门套 + 大理石过梁 + 黄铜压顶 + 双扇实木门（竖向拼缝、铁铆钉阵、双铁门环、中央锁梁与黄铜锁芯），高度超出剖切矮墙以暗示楼层继续 | 门厅特写；`probe-overlap` 0 越界 |
| SA-75 | P2 | 书柜三层层层都是等高同色的书脊，读起来像贴图不像书 | `bookRow()` 生成等宽等高的书列 | 书柜重做分层内容：底层密排 + 一本斜靠；中层短列 + 横放书堆 + 黄铜书立 + 大理石胸像；顶层稀疏 + 铜烛台 + 横放卷轴；另加顶部线脚 | 图书馆特写 |
| SA-76 | P2 | 三间卧室陈设雷同（床 + 衣柜 + 床头柜） | 缺少年代感的梳妆家具 | 新增 `chestOfDrawers`：四层抽屉（黄铜拉手 + 锁孔）、顶部倾斜镜（乌木框 + 暗玻璃 + 双侧立柱）、香水瓶与发刷；接入 master_bedroom / bedroom / nursery | `probe-layout` 三个房间均 5/5 落位 |
| SA-77 | P2 | 鼠标悬停房间没有任何提示，玩家不知道能不能点 | `onInteractiveHover` 在 main.ts 里被接成空函数 | 新增顶部悬浮芯片 `showHoverHint()`：悬停房间显示"房名 · 点击查看房间档案"，悬停门位/卡牌/骰子各有对应文案 | `scripts/tmp-hover` 实测 `on:true text:舞厅点击查看房间档案` |
| SA-78 | P1 | **悬停任一房间会让整桌所有房间一起发亮** | 房间按材质合并且共享全局调色板，`applyHoverHighlight` 直接改 `material.emissive`，等于改了所有引用者 | 悬停时对 `userData.shared` 材质做**克隆替换**（记录 original 以便换回，克隆随 hover 结束 dispose）；非共享材质仍走原地 tint | `tsc` + UI 矩阵；悬停不再外溢 |
| SA-79 | P2 | 探索出新房间时只有一行日志，缺一个"翻开板块"的仪式感 | 房间揭示没有任何表现层反馈 | 新增房间揭示浮层 `maybeRevealRoom()`：HUD 自己 diff 房间 id 集合（首帧只登记不演出），新板块以居中羊皮纸卡呈现——房名/英文名/印刷描述/楼层/已连通门位/符号，配 `room-reveal-in` 入场动画与 7s 自动收起；切夹具时重置已知集合 | `scripts/tmp-reveal` 实测 `rooms 14 → 15, reveal:true, 花园 / 房间·ROOM / N·S / 事件 ✦` |
| SA-80 | P2 | 作祟触发的瞬间只有音效和一行文字，缺少整局最重要转折的呈现 | 无作祟过场层 | 新增全屏作祟过场 `maybeShowHaunt()`：暗红径向晕影 + 闪烁的 `THE HAUNT BEGINS` + `HAUNT No.xx` + 大字标题 + 分隔菱形 + 背叛者姓名 + 当前视角目标（`mission` 已按角色投影）+ 点击/9s 关闭。剧本直开时首帧只登记不重播 | 过渡触发实测 `木乃伊苏醒 / 背叛者·公牛奥克斯 / 目标文案` |

---

## 5. 设计取舍（不当作 bug）

| 项 | 取舍 |
| --- | --- |
| 内核不存 3D 墙体/网格几何 | `TopologySpec` + `SpatialQuery` 只提供图与语义；墙体/端口在模块/渲染层 |
| 房间朝向不自动选择 | 玩家必须显式 `PLACE_ROOM`；超时策略暂未定义 |
| 掉落物品不是隐藏信息 | 山屋物品明置；`DROP_ITEM` 进入公开房间物品堆 |
| 无自动迁移 | `ENGINE_VERSION=3`；旧日志直接拒绝 |
| 单人 GOD 模式无权限层 | NPC controller 校验留给网络层 |

---

## 6. 持续验证方式

```bash
pnpm test              # 内核一致性 + 边界检查（131 例）
pnpm test:matrix       # 五夹具 × 多 seed × 全场景黑盒
pnpm test:ui           # Playwright UI 流程矩阵（含拖拽/旋转/落定）
pnpm probe:layout      # 47 房间家具布局与门位冲突
pnpm probe:overlap     # 房间几何是否越过板块 footprint（z-fighting 回归）
node node_modules/typescript/bin/tsc --noEmit
pnpm build
```

截图**不入库**，`shots/` 已在 `.gitignore` 中：

```bash
pnpm shots             # 自动起停 dev server，生成全部验证截图
pnpm shots betrayal    # 只跑名称匹配的套件
```

渲染 profiling：在浏览器 console 执行 `__boardGameApp.scene.getRenderStats()`；判据与后续可选开发见 [BACKLOG.md](BACKLOG.md)。

新增手测问题时：

1. 先在这里登记 `SA-xx`；
2. 尽量写一个最小黑盒/内核测试；
3. 修复后把状态改为“已修复”，保留复现描述；
4. 如果属于设计取舍，写入第 4 节，而不是删除。

---

## 7. ARCHITECTURE §14 追踪项

这里对应 [ARCHITECTURE.md](ARCHITECTURE.md) 第 14 节，自动化任务逐项推进；复杂项留在 backlog，不假装完成。

| ID | 架构项 | 状态 | 说明 |
| --- | --- | --- | --- |
| A-01 | 传输层 / WebSocket/HTTP | ✅ 设计边界 | `RoomTransport` + `RoomHttpAdapter` 已提供可接服务器的 seam；真实部署/WS 服务器属于外层，不放进内核 |
| A-02 | 动画队列未接入 | ✅ 已修复 | `session.onVisualEvent` → `scene.enqueueAnimations` → `TransactionalAnimationQueue` |
| A-03 | 每帧全量重建棋盘对象 | ✅ 设计取舍 | 放置预览已跳过重建；旧对象 dispose、阴影按需更新。当前实体规模下保留全量重建作为 correctness-first 兜底，通用 diff 记录为 A-16 |
| A-04 | payload 表单能力 | ✅ 已修复 | enum/number/boolean/string/json + `dependsOn` 条件显隐 + `validatePayload` 跨字段校验；嵌套数据走 JSON |
| A-05 | 决策超时 UI | ✅ 已修复 | `UiDecision/UiStackFrame` 暴露 deadline/remaining，HUD 显示 tick 倒计时 |
| A-06 | Room 客户端 UiAction | ✅ 已修复 | `RoomPresenter` 将投影动作 + `describeActionView` 映射为 `UiAction`，并可按 id 提交到 `GameRoom` |
| A-07 | 房间鉴权 | ✅ 已修复 | 可注入 `RoomAuthorizer`；`join(viewer, token)` 拒绝未授权；HTTP adapter 再校验 actor |
| A-08 | i18n | ✅ 设计边界 | 游戏动作标签走 `app/actionText.ts` + `app/i18n` locale registry；静态 UI/chrome 属于独立产品文案，不阻塞内核 |
| A-09 | Catan 场景布局 | ✅ 设计取舍 | `rich_action` 是确定性测试夹具；官方版图不属于内核契约 |
| A-10 | 调试 raw state 访问 | ✅ 已修复 | `window.__boardGameApp` 仅在 Vite DEV 挂载；生产构建不暴露 |
| A-11 | 高维 position / UI 投影 | ✅ 已修复 | `node.position: number[]`；`render/spatialProjection.ts` 映射为 XYZ，层沿轴分离 |

新增复杂项：

| ID | 问题 | 处理 |
| --- | --- | --- |
| A-12 | payload 跨字段约束/条件字段 | ✅ 已修复 | `validatePayload` + `ActionFieldSpec.dependsOn`；HUD 条件显隐，bot 默认值跳过隐藏字段 |
| A-13 | 全量渲染对象池化 | ✅ 设计取舍 | 当前实体规模下不做通用对象池；放置预览、dispose、阴影按需更新已优化；完整 scene diff 见 A-16 |
| A-14 | 房间客户端完整 Presenter | ✅ 已修复 | `src/net/roomPresenter.ts` 复用 `actionText`，暴露 UiAction 并转发 submit |
| A-15 | 高维坐标的统一约定 | ✅ 设计取舍 | world/grid/ring 投影都支持；Catan 保留 world，不强制迁移 |
| A-16 | 通用 scene diff / 对象池 | ⏳ 复杂 backlog | 仅在 profiling 证明全量重建成为瓶颈时再做；需要 diff ownership、dispose、raycast 清理 |
| A-17 | 可插拔 ProjectionPort | ✅ 已实现 | `ProjectionRegistry` + `ProjectionPort`；默认 world/grid/ring/stack，自定义 space 可注册 |
| A-18 | frame graph / 多板图 / 3D 堆叠 | ✅ 已实现 | core `SpatialFrame`/`frameId`/`frames` + projection 组合、stack 坐标与重叠 offset；专用堆叠 mesh/遮挡属于玩法表现可选项 |
| A-19 | DOM 标签避让 | ✅ 已实现 | `render/labels` 的 DOM/SVG overlay + 纯 2D layout；房间/玩家/怪物/选中卡牌/堆叠数量，HUD 安全区避让 |
| A-20 | PlacementSlot / OccupancyIndex | ✅ 已实现 | core slot + 派生 occupancy + 容量/类型校验；山屋 room items/monsters 已接入 |
| A-21 | 拖拽/点击通用放置 action | ✅ 已修复 | `PLACE_ENTITY` + 拖拽目标 ring + 点击目标 slot + 撤销 + 手牌/房间物品扇形与顶层交互已接；无合法动作的卡牌可用自由拖拽做仅本视图的视觉挪动；多 slot footprint 仍 TBD |


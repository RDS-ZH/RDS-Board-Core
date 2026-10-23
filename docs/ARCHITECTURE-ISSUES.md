# 架构问题与合并优化清单

> 持续更新。原则：先修规则/投影边界，再合并重复的表现逻辑；不在 core 里写 UI 特例。

## 1. 已确认并修复

| ID | 问题 | 本质原因 | 处理 |
| --- | --- | --- | --- |
| AI-01 | `PLACE_ROOM` 非法旋转被 dispatch 接受 | payload 只做枚举校验，未校验当前 pending 的合法朝向 | Betrayal 增加 `validatePayload`，非法旋转在 reducer 前拒绝 |
| AI-02 | NPC 动作任意客户端可提交 | actor 存在性校验 ≠ 控制权校验 | engine 校验 NPC `controllerId`；GOD 显式放行 |
| AI-03 | 模块声明 `topologySpec` 与实际图不一致 | 声明数据和 setup 数据是两份手工副本 | 启动时比较 kind/adjacency/directed/geometry/layers；修正山屋/三国杀声明 |
| AI-04 | 选择器候选读 raw state | 候选生成和投影是两条路径 | 候选统一从当前 viewer 的 projection 生成；对手手牌返回空 |
| AI-05 | 无目标模式点击 node/edge 直接执行 | UI 回退匹配了任意 legal action | 改为 inspect-first；必须从动作栏进入 targeting |
| AI-06 | 切换视角后残留棋盘目标模式 | `activeBoardGroup` 是 session 隐式状态 | `setViewer` / `rebuild` 清理；后续可暴露到 snapshot UI state |
| AI-07 | 动作栏 24 条截断 | 线性截断 | 取消截断，`END_TURN` 固定最后 |
| AI-08 | 隐藏 ID 可能从 custom props 泄漏 | 实体投影和自定义字段投影分离 | 增加全夹具/多 seed 投影泄漏回归；后续若模块新增公开字段继续扫描 |
| AI-09 | 手牌 >7 重叠 | 固定卡宽/固定步长 | 手牌按数量自适应 `cardScale` + step，目前最多 10 张仍保持间距 |
| AI-10 | 拖实体时相机晃动 | OrbitControls 与实体拖拽共用 pointer | 实体 drag 期间禁用 controls |
| AI-11 | 实体拖动越飞越高、放置无法落定 | Three.js raycast 忽略 `visible=false` 导致 `surfaceYAt` 反复击中正在拖拽的实体自身形成正反馈高度累加；松手时也以此高空位置作为目标 | `surfaceYAt` 使用 Set 树形过滤排除被拖实体及其所有子网格；拖动高度稳定在下方表面 +0.45；松手执行 220ms ease-out 下落动画并落定到支撑面 |
| AI-12 | 楼层固定偏移导致叠压 | 表现层写死 offset | `layerMode: auto` 按当前层包围盒计算 |
| AI-13 | 拖动释放到 HUD/画布外丢失 pointerup | 相机锁死、卡牌停留空中 | entity pointer capture + 统一 release/cancel；pointerdown 立即锁相机 |
| AI-14 | 新实体 settle 前 matrixWorld 未更新 | 射线读到旧位置，丢弃牌落入桌面/地板下 | 射线前强制 `scene.updateMatrixWorld(true)`；新增丢弃落定回归 |
| AI-15 | 房间物品视觉锚点重复计算 | zone_room 与 slot 两套语义；renderer 硬编码偏移 | 模块提供 `PlacementSlot.local/visual`，renderer 只做坐标/布局消费；不再按 `zone_room_*` 猜位置 |
| AI-16 | 全量重建时相机可能被自动取景重置 | `syncState` 重建与相机 fit 策略绑定 | 相机属于 renderer；仅显式布局变化/用户请求才 fit，丢弃/新实体保持当前 camera/target |
| AI-17 | 放置房间时相机反复 fit，放置后停在高位 | 相机 fit 与 placement 旋转耦合；缺少 placement 前相机快照 | 相机归 renderer：placement 开始保存 pose 并缓动抬高，旋转不 fit，结束/取消缓动恢复 |

## 2. 重复相似特性（需要合并）

| 重复点 | 现状 | 最优方案 |
| --- | --- | --- |
| 卡牌布局 | `renderHand` / `renderSeatCards` / `renderCardEntity` / `renderCardPile` 各自写 fan/stack/scale 公式 | 抽 `render/cardLayout.ts`：输入 count/zone/frame，输出位移、旋转、scale、层高；渲染器只消费布局结果 |
| 牌堆/分组 | `spatialLayout: STACK/FAN`、`buildCardGroups`、`fanZoneId` 三套概念 | 统一为 `CardGroupView`：逻辑分组 key + 布局模式 + 可见数量；`spatialLayout` 只作默认值 |
| 楼层位置 | `gridToWorld` 静态 offset、`adjustPlacement` 动态 offset、projection auto offset | 单一投影入口；placement preview 直接使用 projection 后的锚点，不再二次修正 |
| 目标匹配 | session 内 `match` 的 if/else、动作栏 highlight、模块 legal action | 动作声明 `targetKind`（node/edge/entity/slot）；UI 只按元数据匹配，不再硬编码 action type |
| 拓扑声明 | module.meta.topologySpec 与 setup.mapGraph.topology 两份 | 从同一 topology factory 生成；短期保留启动校验 |
| 验证脚本 | flow/probe/shoot/test-matrix/test-ui-matrix | `test-all` 编排：core → matrix → ui matrix；旧脚本只保留手工诊断 |
| 隐藏信息 | 实体 alias、节点移除、customProps 扫描 | 投影阶段统一 `IdRemap`；禁止模块在公开字段保存 raw hidden id |

## 3. 尚未完成（非 TBD）

| ID | 问题 | 建议 |
| --- | --- | --- |
| AI-20 | `placementRotation` 只在 session 内存 | 写入 pending UI state 或 sessionStorage（仅表现，不进 core） |
| AI-21 | 楼层选择已有相机聚焦，尚未真正隐藏其他层/小地图 | K14：renderer 按层过滤 + 总览小地图；不改逻辑坐标 |
| AI-22 | 3D 卡面长描述截断 | DOM 卡牌详情为主，3D 只做摘要 |
| AI-23 | K3 effects 尚未迁移山屋物品/击晕 | 用 `EffectInstance` 统一生命周期，保留兼容读取 |
| AI-24 | K4 两阶段检定窗口 | RollWindow：修正声明 → 掷骰 → 掷后响应 |
| AI-25 | K8/K9/K12/K14 Wave 3 | 按 KERNEL-EXPRESSION 推进，不混入 fixture 特例 |
| AI-27 | 楼层/总览导航 | `focusFloor` 只切相机；真正的按层渲染仍是 K14 |
| AI-26 | 全量重建场景仍是 correctness-first | profiling 证明瓶颈后再做 diff/对象池 |

## 4. 验证入口

```bash
node scripts/test-core.mjs
node scripts/test-matrix.mjs
node scripts/test-ui-matrix.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
```

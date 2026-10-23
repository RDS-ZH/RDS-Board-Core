# 可选开发与后续待办

> 用户已确认的边界（2026-10）：
>
> 1. **全量重建保留**：当前实体规模下作为 correctness-first 兜底；只做已完成的生命周期/阴影/预览优化。
> 2. **不构建真实 WebSocket/HTTP 服务器**：保留 `RoomTransport` / `RoomHttpAdapter` seam。
> 3. **i18n 不追求全量**：动作文案已 locale 化；静态 UI/chrome 留 TODO。
> 4. **游戏夹具只需功能完备**：保证 UI/应用层兼容性；官方版图、完整规则细节属于可选项。

## 1. 渲染 profiling（A-16）

已提供：

```js
__boardGameApp.scene.getRenderStats()
// { calls, triangles, geometries, textures, lastSyncMs }
```

建议流程：

1. 打开山屋 `haunt_mummy` / `haunt_eye`，记录初始值；
2. 连续执行探索/移动/怪物回合 20+ 次；
3. 记录 `lastSyncMs`、`geometries`、`textures` 是否持续增长；
4. 如果 `lastSyncMs` 稳定 < 16ms 且资源不增长，**不实现通用 diff**；
5. 若超预算，优先做静态棋盘层缓存（按 `mapGraph` 签名），而不是全对象 diff。

判据：

| 指标 | 阈值/观察 |
| --- | --- |
| `lastSyncMs` | 单次同步 < 16ms 视为可接受 |
| `geometries` | 多轮操作后不应单调增长 |
| `textures` | 牌局中不应持续增长 |
| `calls` | 记录基线，避免无界增长 |

## 2. i18n TODO

- `actionText` + `app/i18n` 已覆盖动作标签；
- 静态 HUD/chrome 文案仍为中文硬编码；
- 后续若做多语言：
  - 将 `HUD` 固定文案抽为 key；
  - `phaseLabel`、任务目标、物品/房间名需要内容字典；
  - 不要把翻译表放进 core/game state。

## 3. 网络/服务端 TODO

- `RoomTransport` 接口与 `RoomHttpAdapter` 已就绪；
- 真实 WebSocket/HTTP server、连接管理、重连、背压不在当前范围；
- 部署时需补：
  - 鉴权 token 生命周期；
  - 多客户端广播；
  - 断线重连的 `revision/delta` 恢复。

## 4. 游戏夹具可选项

以下不影响内核/UI 兼容性，暂不完整实现：

- Catan 官方版图与全部规则细节；
- 更多山屋剧本、完整 50 个 haunt；
- 三国杀/沙丘/璀璨宝石的完整卡表与规则；
- 房间/卡牌官方美术。

## 5. 优先修复的框架性问题

来自 [SIMULATOR-AUDIT.md](SIMULATOR-AUDIT.md)：

- P0：`PLACE_ROOM` 非法旋转仍可能被 dispatch 接受；
- P0：隐藏节点 ID 可能从 `customProps/globalVars` 泄露；
- P0：NPC `controllerId` 没有权限校验；
- P0：模块 `topologySpec` 与实际 `mapGraph.topology` 未交叉校验；
- P1：selection 候选仍直接读 raw state；
- P1：棋盘目标模式是 session 隐式状态；
- P1：动作栏 24 条上限会隐藏非 END 动作；
- P1：手牌 >7 张 3D 卡牌重叠；
- P1：无目标模式点击 node/edge 仍可能直接执行；
- P2：超长布局没有小地图/视口框。

## 6. 投影 / 图模型后续

已完成：

- `ProjectionPort` + `ProjectionRegistry`（world / grid / ring / stack）；
- `GameMapGraph.frames` + `SpatialFrame` + `frameId`；
- frame 链 translation/rotation/scale 组合与 `validateFrames`；
- 投影重合检测：同 XZ 节点加确定性径向 offset + 微小 Y 偏移。

仍未做：

- 3D 堆叠的专用 mesh/遮挡/拾取策略（坐标与 offset 已有，玩法表现可选项）；
- polyomino / 多格占用 / 任意 port 图；
- frame 动画与动态旋转整块棋盘；
- screen-space 标签避让（当前是 world-space 投影避让）；
- 小地图/楼层隔离。

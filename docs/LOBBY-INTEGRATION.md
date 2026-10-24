# Lobby 集成说明（RDS-Board-Hub ↔ RDS-Board-Core）

平台仓库：[RDS-Board-Hub](https://github.com/RDS-ZH/RDS-Board-Hub)（账号 / 房间大厅 / WebRTC 信令）。
本仓库的**唯一对接文件**是 `src/net/webrtc-transport.ts`；内核与夹具零改动。

## 角色

- **Host（房主）**：本仓库前端以常规模式启动（本地 `UniversalGameEngine` + `GameRoom`），
  再挂 `WebRtcHostTransport` + `startHostMesh`，把 DataChannel 消息桥到 `GameRoom`。
- **Guest**：不创建引擎。用 `WebRtcGuestTransport` 消费自己的投影 `O(s,i)` 并提交动作。

## 启动参数（Hub 拉起游戏客户端）

```
?game=splendor&hub=http://hub.example&roomId=r_xxx&token=<jwt>&role=host|guest&playerId=p2&hostId=u_xxx
```

- `role=host`：正常装配 App（现有 main.ts 流程），完成后 `HubSignaling.connect(roomId)`
  → `startHostMesh` → `WebRtcHostTransport(room, selfId, ...)`。
- `role=guest`：`openGuestChannel(signaling, hostId)` → `WebRtcGuestTransport`；
  UI 侧用 `session.ts` 的 viewer 机制渲染投影（只读动作仍经 host 校验）。

## 安全

- 信令身份不可伪造：Hub 转发时强制 `from=JWT userId`；
  Host 侧座位占用规则：每个信令 peer 只能持有一个 viewer 座位，且每个座位只能被一个 peer 占用（抢占他人已占座位会被拒）；`submit` 的 actor 必须等于该 peer 占据的 viewer。

## 验证

- `node scripts/net-transport.mjs`：用内存环回通道跑 Host↔Guest 全流程
  （join → 各自投影 → guest submit → 双端 revision 一致 → 隐藏信息不泄露）。
- 真实 P2P（Chromium 双页 Playwright + 本地 Hub）在 M2 验收时补充。

import type { HubGameInfo } from '@rds/room-protocol';

/** 游戏清单：新游戏接入 = 这里加一条（后续可改为 DB/远程 manifest）。 */
export const GAMES: HubGameInfo[] = [
  {
    id: 'splendor',
    name: '璀璨宝石',
    minPlayers: 2,
    maxPlayers: 4,
    clientUrl: '/games/rds-board-core/',
    protocol: 'rds-room/1',
    durationMin: 30,
    accent: '#7ee787',
  },
  {
    id: 'catan',
    name: '卡坦岛',
    minPlayers: 3,
    maxPlayers: 4,
    clientUrl: '/games/rds-board-core/',
    protocol: 'rds-room/1',
    durationMin: 60,
    accent: '#e3b341',
  },
  {
    id: 'betrayal',
    name: '山屋惊魂',
    minPlayers: 3,
    maxPlayers: 6,
    clientUrl: '/games/rds-board-core/',
    protocol: 'rds-room/1',
    durationMin: 60,
    accent: '#ff8b82',
    variants: [{ id: 'exploration', label: '预铺探索（半开局）' }],
  },
];
export const gameById = (id: string) => GAMES.find(g => g.id === id);

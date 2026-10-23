import { ECSManager } from '../../core/ecs';
import { GameState, Player } from '../../core/types';

export function setupDuneMahjong(seed: number = 42): GameState {
  const players: Record<string, Player> = {
    p1: {
      id: 'p1',
      name: 'House Atreides (Paul)',
      color: '#2e7d32', // Green
      avatar: '🦅',
      score: 10, // Spice / troops
      alive: true,
      handZoneId: 'zone_hand_p1',
      customProps: {
        faction: 'Atreides',
        spice: 12,
        troops: 8,
        leader: 'Gurney Halleck (Str 5)',
        committedDial: null
      }
    },
    p2: {
      id: 'p2',
      name: 'House Harkonnen (Baron)',
      color: '#c62828', // Red
      avatar: '🗡️',
      score: 10,
      alive: true,
      handZoneId: 'zone_hand_p2',
      customProps: {
        faction: 'Harkonnen',
        spice: 15,
        troops: 10,
        leader: 'Feyd-Rautha (Str 6)',
        committedDial: null
      }
    },
    p3: {
      id: 'p3',
      name: 'Fremen (Stilgar)',
      color: '#f57f17', // Desert gold
      avatar: '🪱',
      score: 8,
      alive: true,
      handZoneId: 'zone_hand_p3',
      customProps: {
        faction: 'Fremen',
        spice: 8,
        troops: 12,
        leader: 'Chani (Str 4)',
        committedDial: null
      }
    }
  };

  const playerOrder = ['p1', 'p2', 'p3'];

  let state: GameState = {
    gameId: 'dune_mahjong',
    seed,
    seq: 0,
    clock: 0,
    round: 1,
    turn: 1,
    activePlayerId: 'p1',
    phase: 'SIMULTANEOUS_BATTLE_WHEEL', // or MAHJONG_CLAIM
    players,
    playerOrder,
    entities: {},
    zones: {},
    mapGraph: { nodes: {}, edges: {}, topology: { kind: 'none', adjacency: 'none', geometry: 'none' } },
    globalVars: {
      battleMode: 'DUNE_COMBAT_WHEEL',
      committedDials: {},
      revealedBattleResult: null,
      mahjongTileDiscarded: '9 Bamboo (九条)',
      mahjongTileDiscarder: 'p1'
    },
    interruptStack: [],
    pendingDecisions: [],
    activeHooks: [],
    prngState: seed,
    actionLog: [],
    winner: null,
    gameOver: false
  };

  playerOrder.forEach(pId => {
    state = ECSManager.createZone(state, `zone_hand_${pId}`, `${players[pId].name} Treachery Cards`, 'HAND', {
      type: 'OWNER_ONLY',
      ownerId: pId
    }, pId);
  });

  return state;
}

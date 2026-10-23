/**
 * Haunt catalogue + the Haunt Chart.
 *
 * The chart maps (omen just drawn, room it was drawn in) to a scenario id.
 * Only three scenarios are implemented end-to-end; the chart also provides a
 * deterministic fallback so any omen/room pair still starts a playable haunt.
 */

import { Floor } from './cards';

export type MonsterKind = 'MUMMY' | 'EYE' | 'PHANTOM';

export interface MonsterTemplate {
  kind: MonsterKind;
  name: string;
  en: string;
  might: number;
  speed: number;
  sanity: number;
  attack: 'PHYSICAL' | 'MENTAL';
  /** Eyes do not damage on a win: they take control of the hero. */
  control?: boolean;
  /** Phantom ignores walls and physical weapons. */
  incorporeal?: boolean;
  immunePhysical?: boolean;
  immuneSpeedAttacks?: boolean;
  /** How many monsters the haunt spawns. */
  count: number;
  color: string;
  text: string;
}

export interface HauntHookSpec {
  hookId: string;
  params?: Record<string, string | number | boolean>;
}

export interface HauntDef {
  id: string;
  number: number;
  title: string;
  en: string;
  traitorTitle: string;
  heroObjective: string;
  traitorObjective: string;
  monster?: MonsterTemplate;
  hooks: HauntHookSpec[];
  /** Room tag that should host the scenario's ritual / beacon. */
  anchorTag?: string;
  notes: string[];
}

export const HAUNT_DEFS: Record<string, HauntDef> = {
  mummy: {
    id: 'mummy',
    number: 1,
    title: '木乃伊苏醒',
    en: 'The Mummy Walks',
    traitorTitle: '木乃伊大祭司',
    heroObjective:
      '携带【神圣徽记】或【古旧指环】抵达石棺所在房间，连续完成 2 次知识 5+ 的神圣符文破译，重新封印木乃伊。',
    traitorObjective: '让木乃伊夺取【小女孩】并把她带回石棺陪葬，或让所有英雄死亡。',
    monster: {
      kind: 'MUMMY',
      name: '木乃伊',
      en: 'The Mummy',
      might: 8,
      speed: 3,
      sanity: 5,
      attack: 'PHYSICAL',
      count: 1,
      color: '#d7c9a3',
      text: '速度 3 · 力量 8 · 神智 5。缠满易燃亚麻布，在炉火旁力量降为 4。'
    },
    hooks: [{ hookId: 'haunt_mummy_fire' }],
    anchorTag: 'crypt',
    notes: [
      '木乃伊击败女孩的保管者后夺取女孩，随后径直走向石棺房间。',
      '石棺标记放置在作祟揭示的房间；若该房间没有 crypt 标签，则使用揭示房间本身。',
      '英雄在熔炉房攻击木乃伊时，木乃伊的力量骰从 8 降为 4。'
    ]
  },
  floating_eye: {
    id: 'floating_eye',
    number: 6,
    title: '巨眼降临',
    en: 'The Floating Eye',
    traitorTitle: '外星主宰的引渡者',
    heroObjective: '摧毁所有降临的巨眼，并在飞船标记处炸毁对接信标。被精神控制的同伴必须先被拍醒。',
    traitorObjective: '用巨眼的心智控制把所有英雄诱骗进飞船送走，或让所有英雄死亡。',
    monster: {
      kind: 'EYE',
      name: '浮空巨眼',
      en: 'Alien Eye',
      might: 4,
      speed: 4,
      sanity: 6,
      attack: 'MENTAL',
      control: true,
      immuneSpeedAttacks: true,
      count: 2,
      color: '#57c7ff',
      text: '速度 4 · 力量 4 · 神智 6。免疫速度/远程攻击；神智对抗胜利时改为精神控制。'
    },
    hooks: [{ hookId: 'haunt_eye_ward' }],
    notes: [
      '作祟开始时叛徒被母舰光束接引登舰（移出桌面），不再作为肉体角色行动，但仍操控怪物回合。',
      '被控制的英雄在其回合自动向飞船标记移动一格，抵达即被绑架退场。',
      '未受控英雄可对同房间受控同伴发起力量对抗（拍击），成功后该英雄永久免疫心智控制。',
      '所有巨眼被摧毁后，英雄可在飞船房间执行 DESTROY_BEACON 摧毁信标获胜。'
    ]
  },
  phantom: {
    id: 'phantom',
    number: 10,
    title: '幽灵的拥抱',
    en: "The Phantom's Embrace",
    traitorTitle: '怨灵的活人祭品',
    heroObjective:
      '在地下室找到遗骨，携带【神圣徽记】抵达五芒星堂，连续完成 3 次神智 5+ 的安魂咏唱，超度怨灵。',
    traitorObjective: '让怨灵把整座洋馆拖入灵界：所有英雄死亡，或全部被怨灵吸干心智。',
    monster: {
      kind: 'PHANTOM',
      name: '怨灵',
      en: 'The Phantom',
      might: 5,
      speed: 6,
      sanity: 6,
      attack: 'MENTAL',
      incorporeal: true,
      immunePhysical: true,
      count: 1,
      color: '#b9e8ff',
      text: '速度 6 · 神智 6。虚体：无视墙壁移动，免疫物理武器，以神智攻击造成精神伤害。'
    },
    hooks: [{ hookId: 'haunt_phantom_frost' }],
    anchorTag: 'pentagram',
    notes: [
      '怨灵经过的房间会留下霜冻标记；处于霜冻房间的角色速度减半。',
      '英雄在地下室房间可进行知识 4+ 搜索遗骨（每回合一次）。',
      '安魂咏唱需要同时持有遗骨与【神圣徽记】，每次成功推进 1 点仪式进度。'
    ]
  }
};

export interface HauntChartRow {
  omen: string;
  rooms?: string[];
  floors?: Floor[];
  hauntId: string;
}

/**
 * Exact chart rows take precedence, then omen fallbacks, then floor fallbacks.
 * This mirrors the physical two-book chart while staying deterministic for
 * any room/omen combination.
 */
export const HAUNT_CHART: HauntChartRow[] = [
  { omen: 'girl', rooms: ['catacombs'], hauntId: 'mummy' },
  { omen: 'girl', rooms: ['crypt'], hauntId: 'phantom' },
  { omen: 'girl', rooms: ['basement_landing', 'coal_chute'], hauntId: 'mummy' },
  { omen: 'madman', rooms: ['catacombs', 'crypt'], hauntId: 'phantom' },
  { omen: 'holy_symbol', rooms: ['balcony', 'tower', 'widow_walk'], hauntId: 'floating_eye' },
  { omen: 'skull', rooms: ['pentagram_chamber', 'crypt'], hauntId: 'phantom' },
  { omen: 'ring', rooms: ['pentagram_chamber'], hauntId: 'phantom' },
  { omen: 'spirit_board', rooms: ['attic', 'tower'], hauntId: 'floating_eye' },
  { omen: 'mask', rooms: ['pentagram_chamber'], hauntId: 'phantom' },
  { omen: 'book', rooms: ['library', 'study'], hauntId: 'mummy' },
  { omen: 'crystal_ball', rooms: ['observatory'], hauntId: 'floating_eye' },
  { omen: 'medallion', rooms: ['crypt', 'catacombs'], hauntId: 'mummy' },
  { omen: 'spear', rooms: ['gymnasium'], hauntId: 'mummy' },
  { omen: 'dog', rooms: ['garden', 'patio'], hauntId: 'mummy' },
  { omen: 'bite', rooms: ['underground_lake'], hauntId: 'phantom' }
];

const OMEN_FALLBACK: Record<string, string> = {
  girl: 'mummy',
  madman: 'phantom',
  holy_symbol: 'floating_eye',
  skull: 'phantom',
  ring: 'phantom',
  book: 'mummy',
  medallion: 'mummy',
  spirit_board: 'floating_eye',
  mask: 'phantom',
  crystal_ball: 'floating_eye',
  bite: 'phantom',
  dog: 'mummy',
  spear: 'mummy'
};

const FLOOR_FALLBACK: Record<Floor, string> = {
  BASEMENT: 'mummy',
  GROUND: 'phantom',
  UPPER: 'floating_eye'
};

export function resolveHauntId(omenId: string, roomId: string, floor: Floor): string {
  const exactRoom = HAUNT_CHART.find(row => row.omen === omenId && row.rooms?.includes(roomId));
  if (exactRoom) return exactRoom.hauntId;

  const floorRow = HAUNT_CHART.find(row => row.omen === omenId && row.floors?.includes(floor));
  if (floorRow) return floorRow.hauntId;

  return OMEN_FALLBACK[omenId] ?? FLOOR_FALLBACK[floor];
}

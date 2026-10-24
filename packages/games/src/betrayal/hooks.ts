/**
 * Betrayal rule aspects (dynamic meta-rules K_t).
 *
 * Only *data* lives in the state (`ActiveRuleHook { hookId, params }`); these
 * implementations are looked up by id in the module's RuleRegistry. The Haunt
 * hot-injects the relevant instances when it starts.
 */

import { RuleHookImpl } from '@rds/kernel/rules';
import { WEAPON_SPECS } from './cards';

export const BETRAYAL_HOOKS: RuleHookImpl[] = [
  {
    id: 'haunt_mummy_fire',
    name: '木乃伊 · 惧火',
    stage: 'FILTER_MODIFY',
    priority: 100,
    description: '英雄在带炉火的房间攻击木乃伊时，木乃伊的力量骰降为 4。',
    predicate: (action, state) => {
      if (action.type !== 'ATTACK_MONSTER' || !action.entityId) return false;
      const monster = state.entities[action.entityId];
      if (monster?.components.custom?.monster !== 'MUMMY') return false;
      const roomId = state.players[action.playerId]?.customProps.currentRoomId;
      const tags = state.mapGraph.nodes[roomId]?.props?.tags ?? [];
      return Array.isArray(tags) && tags.includes('fire');
    },
    handler: action => ({
      type: 'MODIFY',
      modifiedAction: {
        ...action,
        payload: { ...(action.payload ?? {}), monsterMightPenalty: 4 }
      },
      message: '炉火让木乃伊的亚麻布噼啪作响（力量 8 → 4）。'
    })
  },
  {
    id: 'haunt_eye_ward',
    name: '巨眼 · 晶状护盾',
    stage: 'BEFORE_REPLACE',
    priority: 120,
    description: '巨眼完全免疫速度攻击与远程武器，左轮手枪和雷管对其无效。',
    predicate: (action, state) => {
      if (action.type !== 'ATTACK_MONSTER' || !action.entityId) return false;
      const monster = state.entities[action.entityId];
      if (monster?.components.custom?.monster !== 'EYE') return false;
      const weaponId = String(action.payload?.weapon ?? 'fists');
      const spec = WEAPON_SPECS[weaponId];
      return !!spec && (spec.trait === 'speed' || !!spec.ranged);
    },
    handler: () => ({
      type: 'CANCEL',
      message: '子弹与速度在晶状护盾前停滞——巨眼免疫速度攻击。'
    })
  },
  {
    id: 'haunt_phantom_frost',
    name: '怨灵 · 霜冻足迹',
    stage: 'AFTER_TRIGGER',
    priority: 90,
    description: '怨灵经过的房间留下霜冻标记；英雄进入后被刺骨严寒侵蚀。',
    predicate: (action, state) => {
      if (action.type !== 'MOVE_TO_ROOM' && action.type !== 'EXPLORE_DOOR') return false;
      const player = state.players[action.playerId];
      return !!player && player.role !== 'TRAITOR' && !!state.globalVars.hauntTriggered;
    },
    handler: action => ({
      type: 'CONTINUE',
      followUpActions: [{ type: 'FROSTBITE', playerId: action.playerId }],
      message: '怨灵的气息在门后凝结成霜。'
    })
  },
  {
    id: 'haunt_zombie_undying',
    name: '活死人 · 不死之躯',
    stage: 'FILTER_MODIFY',
    priority: 85,
    description: '活死人被击败时只被击晕；持有圣水或神圣徽记的英雄攻击可造成额外净化伤害。',
    predicate: (action, state) => {
      if (action.type !== 'ATTACK_MONSTER' || !action.entityId) return false;
      const monster = state.entities[action.entityId];
      return monster?.components.custom?.monster === 'ZOMBIE';
    },
    handler: action => ({
      type: 'CONTINUE',
      message: '腐烂的躯体无视痛楚，腐朽的肌肉在暗夜中蠕动。'
    })
  },
  {
    id: 'haunt_werewolf_frenzy',
    name: '狼人 · 嗜血狂暴',
    stage: 'FILTER_MODIFY',
    priority: 95,
    description: '狼人追踪受伤猎物获得力量加成；银制武器对其造成致命创伤。',
    predicate: (action, state) => {
      if (action.type !== 'ATTACK_HERO' && action.type !== 'ATTACK_MONSTER') return false;
      return true;
    },
    handler: action => ({
      type: 'CONTINUE',
      message: '满月之光激发了狼人体内的狂兽之血。'
    })
  }
];

import { Action, ProjectedGameState } from '../core/types';
import { UiAction } from './contracts';
import { translateText } from './i18n';

function describeActionZh(
  state: ProjectedGameState,
  action: Action
): { icon: string; label: string; hint: string; tone: UiAction['tone']; fields?: UiAction['fields'] } | null {
    const name = (id?: string) => (id ? state.players[id]?.name ?? id : '');
    const card = (id?: string) => {
      if (!id) return '未知卡牌';
      const entity = state.entities[id];
      return (
        (entity?.components?.custom?.zh as string | undefined) ??
        (entity?.components?.custom?.name as string | undefined) ??
        entity?.components?.cardFace?.title ??
        '未知卡牌'
      );
    };

    switch (action.type) {
      case 'ROLL_DICE':
        return { icon: '🎲', label: '掷骰子', hint: '2D6 · 自然随机源 c', tone: 'primary' };
      case 'PROPOSE_TRADE':
        return {
          icon: '🤝',
          label: '发起玩家交易',
          hint: '1:1 · 首个接受的玩家成交',
          tone: 'normal',
          fields: action.fields
        };
      case 'END_TURN':
        return { icon: '⌛', label: '结束回合', hint: '移交行动权', tone: 'normal' };
      case 'PLAY_STRIKE':
        return { icon: '⚔️', label: `出【杀】→ ${name(action.targetPlayerId)}`, hint: '开启【闪】响应窗口', tone: 'primary' };
      case 'PLAY_DODGE':
        return { icon: '🛡️', label: '出【闪】', hint: '抵消此【杀】', tone: 'primary' };
      case 'JUDGE_BAGUA':
        return { icon: '☯️', label: '发动【八卦阵】', hint: '判定红牌即视为闪', tone: 'primary' };
      case 'PLAY_PEACH':
        return { icon: '🍑', label: '出【桃】', hint: '回复 1 点体力', tone: 'primary' };
      case 'PLAY_WUXIE':
        return { icon: '📜', label: '打出【无懈可击】', hint: '压栈反制 · 可被再反制', tone: 'primary' };
      case 'PASS':
        return { icon: '⊘', label: '放弃响应', hint: 'Pass · 让栈顶结算', tone: 'danger' };
      case 'DRAW_CARDS':
        return { icon: '🎴', label: '摸 2 张牌', hint: '从牌堆抽取', tone: 'normal' };
      case 'TAKE_3_DIFF_GEMS':
        return { icon: '💎', label: '取 3 种不同宝石', hint: '三色筹码各 1', tone: 'primary' };
      case 'TAKE_2_SAME_GEMS':
        return { icon: '◈', label: `取 2 枚 ${action.payload?.gem ?? '宝石'}`, hint: '同色双取', tone: 'normal' };
      case 'RESERVE_CARD':
        return { icon: '🔖', label: '保留一张发展卡', hint: '附赠 1 黄金', tone: 'normal' };
      case 'EXPLORE_DOOR':
        return { icon: '🚪', label: `探索房门 · ${action.payload?.direction ?? ''}`, hint: '抽房间板块，再选择朝向', tone: 'primary' };
      case 'PLACE_ROOM':
        return {
          icon: '🧭',
          label: `放置「${action.payload?.defName ?? '房间板块'}」`,
          hint: '旋转板块，把门接到入口方向；相邻门会自动连通',
          tone: 'primary',
          fields: action.fields
        };
      case 'MOVE_TO_ROOM':
        return { icon: '🚶', label: '移动至相邻房间', hint: '在弹窗中选择目标房间', tone: 'normal' };
      case 'MOVE_NPC':
        return { icon: '👹', label: '怪物移动', hint: '在弹窗中选择目标房间', tone: 'danger' };
      case 'ROLL_HAUNT_CHECK':
        return { icon: '🕯️', label: '进行作祟检定', hint: '6 颗 0/1/2 骰 · 总和低于预兆数则作祟', tone: 'danger' };
      case 'ATTACK_COMBAT':
        return { icon: '🩸', label: `攻击 ${name(action.targetPlayerId)}`, hint: '力量对抗掷骰', tone: 'danger' };
      case 'ATTACK_PLAYER':
        return {
          icon: '⚔️',
          label: `攻击 ${name(action.targetPlayerId)}`,
          hint: '武器与偷窃在参数中选择 · 平局无伤',
          tone: 'danger',
          fields: action.fields
        };
      case 'ATTACK_MONSTER':
        return {
          icon: '👹',
          label: `攻击 ${card(action.entityId)}`,
          hint: '胜负差为伤害 · 胜出击晕怪物',
          tone: 'danger',
          fields: action.fields
        };
      case 'ATTACK_HERO':
        return {
          icon: '👹',
          label: `怪物攻击 ${name(action.targetPlayerId)}`,
          hint: '同房间英雄 · 由叛徒操控',
          tone: 'danger'
        };
      case 'END_NPC_TURN':
        return { icon: '⌛', label: '结束怪物回合', hint: '交给下一只怪物 / 下一位英雄', tone: 'normal' };
      case 'SLAP':
        return { icon: '👋', label: `拍醒 ${name(action.targetPlayerId)}`, hint: '力量对抗 · 成功后永久免疫控制', tone: 'primary' };
      case 'ALLOCATE_DAMAGE':
        return {
          icon: '🩸',
          label: '选择承受伤害的属性',
          hint: '肉体伤害扣力量或速度 · 精神伤害扣神智或知识',
          tone: 'danger',
          fields: action.fields
        };
      case 'USE_ITEM':
        return { icon: '🎒', label: `使用「${card(action.entityId)}」`, hint: '每件物品每回合一次', tone: 'primary', fields: action.fields };
      case 'DROP_ITEM':
        return {
          icon: '🫸',
          label: `丢下「${card(action.entityId)}」`,
          hint: '在房间形成物品堆；只有一件时按钮直接执行',
          tone: 'normal'
        };
      case 'PICK_UP_ITEM':
        return { icon: '🫳', label: `拾取「${card(action.entityId)}」`, hint: '从当前房间的物品堆取走', tone: 'normal' };
      case 'PLACE_ENTITY':
        return {
          icon: '📍',
          label: `放置「${card(action.entityId)}」`,
          hint: '吸附到合法 node/edge/slot',
          tone: 'primary'
        };
      case 'PROPOSE_ITEM_TRADE':
        return {
          icon: '🤝',
          label: '提出同房间交易',
          hint: '同房间玩家首个接受者成交',
          tone: 'normal',
          fields: action.fields
        };
      case 'ACCEPT_TRADE':
        return { icon: '✅', label: '接受交易', hint: '交换双方物品', tone: 'primary' };
      case 'REJECT_TRADE':
        return { icon: '✖️', label: '拒绝交易', hint: '不交换', tone: 'danger' };
      case 'USE_ELEVATOR':
        return { icon: '🛗', label: '乘神秘电梯', hint: '移动到任意已探索房间', tone: 'primary' };
      case 'JUMP_DOWN':
        return { icon: '🪜', label: '沿楼座跳下舞厅', hint: '有麻绳则无伤，否则 1 点坠落伤害', tone: 'danger' };
      case 'CLIMB_UP':
        return { icon: '🪜', label: '沿麻绳攀上楼座', hint: '需持有麻绳 · 消耗 1 点移动力', tone: 'normal' };
      case 'SEAL_RITUAL':
        return { icon: '📜', label: '破译神圣符文', hint: '知识 5+ · 进度 2/2 封印木乃伊', tone: 'primary' };
      case 'SEARCH_BONES':
        return { icon: '🦴', label: '搜寻怨灵遗骨', hint: '知识 4+ · 每回合一次', tone: 'normal' };
      case 'CHANT':
        return { icon: '🕯️', label: '安魂咏唱', hint: '神智 5+ · 进度 3/3 超度怨灵', tone: 'primary' };
      case 'DESTROY_BEACON':
        return { icon: '💥', label: '炸毁飞船信标', hint: '所有巨眼已被摧毁', tone: 'danger' };
      case 'BREW_HOLY_WATER':
        return { icon: '⚗️', label: '调配圣水', hint: '知识 4+ · 获得净化圣水', tone: 'primary' };
      case 'SANCTIFY_HOUSE':
        return { icon: '✨', label: '注入圣水池圣化', hint: '知识/神智 4+ · 进度 2/2 净化全宅', tone: 'primary' };
      case 'FORGE_SILVER':
        return { icon: '⚔️', label: '打造银制武器', hint: '力量 4+ · 获得银色子弹', tone: 'primary' };
      case 'SUPPRESS_CURSE':
        return { icon: '🌕', label: '月相压制仪式', hint: '知识 4+ · 进度 3/3 驱散狼人诅咒', tone: 'primary' };
      case 'PEEK_TOP':
        return { icon: '🔮', label: '将顶牌留在牌堆顶', hint: '水晶球窥视', tone: 'normal' };
      case 'PEEK_BOTTOM':
        return { icon: '🔮', label: '将顶牌置于牌堆底', hint: '水晶球窥视', tone: 'normal' };
      case 'COMMIT_BATTLE_DIAL':
        return {
          icon: '🔒',
          label: `锁定战斗转盘 · 兵 ${action.payload?.troops ?? '?'}`,
          hint: `将领 ${action.payload?.leaderStr ?? '?'} · ${action.payload?.weapon ?? '武器'}`,
          tone: 'primary'
        };
      case 'OPEN_BATTLE_WINDOW':
        return { icon: '🎛️', label: '开启秘密战斗窗口', hint: '双方同步盲提 · |𝒫(s)| > 1', tone: 'primary' };
      case 'TRIGGER_MAHJONG_DISCARD':
        return { icon: '🀄', label: '打出 [九条]', hint: '开启吃/碰/胡抢断栈', tone: 'primary' };
      case 'MAHJONG_HU':
        return { icon: '🀄', label: '【胡】优先级 30', hint: '立即短路截断全场', tone: 'danger' };
      case 'MAHJONG_PENG':
        return { icon: '🀄', label: '【碰】优先级 20', hint: '刻子成组', tone: 'primary' };
      case 'MAHJONG_CHI':
        return { icon: '🀄', label: '【吃】优先级 10', hint: '顺子成组', tone: 'normal' };
      case 'SWITCH_TO_MAHJONG_DEMO':
        return { icon: '↺', label: '切换到麻将抢断演示', hint: '优先级短路', tone: 'normal' };
      case 'SWITCH_TO_DUNE_DEMO':
        return { icon: '↺', label: '切换到沙丘盲提演示', hint: '同步提交', tone: 'normal' };
      case 'BUY_DEV_CARD':
        return { icon: '📜', label: '购买发展卡', hint: '1羊 1麦 1矿 · 当回合不可打出', tone: 'primary' };
      case 'PLAY_KNIGHT':
        return { icon: '🐎', label: '打出【骑士】', hint: '移动强盗并偷取 1 资源', tone: 'primary' };
      case 'PLAY_ROAD_BUILDING':
        return { icon: '🛣️', label: '打出【修路】', hint: '免费放置 2 条道路', tone: 'primary' };
      case 'PLAY_YEAR_OF_PLENTY':
        return { icon: '🌟', label: '打出【丰饶】', hint: '从银行取 2 个资源', tone: 'primary' };
      case 'PLAY_MONOPOLY':
        return { icon: '💰', label: '打出【垄断】', hint: '夺取一种资源', tone: 'primary' };
      case 'STEAL_FROM':
        return { icon: '🦹', label: `偷取 ${name(action.targetPlayerId)}`, hint: '随机 1 张资源', tone: 'danger' };
      case 'BANK_TRADE':
        return {
          icon: '🏦',
          label: '银行 / 港口交易',
          hint: '4:1，拥有港口可 3:1 / 2:1',
          tone: 'normal',
          fields: action.fields
        };
      case 'ACCEPT_TRADE':
        return { icon: '✅', label: `接受交易 · ${name(action.playerId)}`, hint: '1:1 交换', tone: 'primary' };
      case 'REJECT_TRADE':
        return { icon: '✖️', label: `拒绝交易 · ${name(action.playerId)}`, hint: '不交换', tone: 'danger' };
      case 'SKIP_ROAD_BUILDING':
        return { icon: '⏭️', label: '不再放置道路', hint: '结束修路卡结算', tone: 'normal' };
      case 'DISCARD_HALF':
        return {
          icon: '🗑️',
          label: `弃置一半 · ${name(action.playerId)}`,
          hint: '超过 7 张时强制弃牌',
          tone: 'danger'
        };
      default:
        return { icon: '•', label: action.type, hint: '合法动作', tone: 'normal' };
    }
  
}

export function describeActionView(
  state: ProjectedGameState,
  action: Action
): { icon: string; label: string; hint: string; tone: UiAction['tone']; fields?: UiAction['fields'] } | null {
  const view = describeActionZh(state, action);
  if (!view) return null;
  return { ...view, label: translateText(view.label), hint: translateText(view.hint) };
}
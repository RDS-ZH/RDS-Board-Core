import { RuleHookImpl } from '../../core/rules';

/**
 * Sanguosha rule aspects.
 * NOTE: implementations live here, not in the game state. State only carries
 * ActiveRuleHook descriptors (hookId + owner + params), so it stays JSON.
 */
export const SANGUOSHA_HOOKS: RuleHookImpl[] = [
  {
    id: 'bagua_armor',
    name: 'Eight Trigrams Defense',
    stage: 'BEFORE_REPLACE',
    priority: 50,
    description: 'When the owner is targeted by a Strike, the armor may judge a red card to count as a Dodge.',
    predicate: (action, _state, ctx) =>
      action.type === 'PLAY_STRIKE' && action.targetPlayerId === ctx.instance.ownerId,
    handler: () => ({
      type: 'CONTINUE',
      message: 'Eight Trigrams is active — the target may judge for a Dodge.'
    })
  }
];

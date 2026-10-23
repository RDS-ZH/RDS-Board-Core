import { ECSManager } from '../../core/ecs';
import { ReduceContext } from '../../core/module';
import { Action, Entity, GameState, PlayerId, VisualTraceEvent } from '../../core/types';
import { GemType } from './setup';

export class SplendorRules {
  public static getLegalActions(state: GameState, playerId: PlayerId): Action[] {
    if (state.gameOver) return [];
    if (state.activePlayerId !== playerId) return [];

    const actions: Action[] = [];
    const player = state.players[playerId];
    const tokens = player.customProps.tokens || {};
    const bonuses = player.customProps.bonuses || {};
    const bank = state.globalVars.bank || {};

    // 1. Take 3 different gems
    const availableGems = (['diamond', 'sapphire', 'emerald', 'ruby', 'onyx'] as GemType[]).filter(
      g => (bank[g] || 0) > 0
    );

    if (availableGems.length >= 3) {
      actions.push({
        type: 'TAKE_3_DIFF_GEMS',
        playerId,
        payload: { gems: availableGems.slice(0, 3) }
      });
    }

    // 2. Take 2 of same gem (if >= 4 in bank)
    availableGems.forEach(g => {
      if ((bank[g] || 0) >= 4) {
        actions.push({
          type: 'TAKE_2_SAME_GEMS',
          playerId,
          payload: { gem: g }
        });
      }
    });

    // 3. Buy Card from market (T1, T2, T3) or Hand (Reserved)
    const marketZones = ['zone_market_t1', 'zone_market_t2', 'zone_market_t3', `zone_hand_${playerId}`];
    marketZones.forEach(zId => {
      const cards = ECSManager.getEntitiesInZone(state, zId);
      cards.forEach(card => {
        const rawCost = card.components.cardFace?.cost || {};
        let goldNeeded = 0;
        let canAfford = true;

        for (const [gem, req] of Object.entries(rawCost)) {
          const discount = bonuses[gem] || 0;
          const netCost = Math.max(0, (req as number) - discount);
          const availableToken = tokens[gem] || 0;
          if (availableToken < netCost) {
            goldNeeded += netCost - availableToken;
          }
        }

        if (goldNeeded <= (tokens.gold || 0)) {
          actions.push({
            type: 'BUY_CARD',
            playerId,
            entityId: card.id,
            fromZoneId: zId
          });
        }
      });
    });

    // 4. Reserve Card (if hand has < 3 cards)
    const hand = ECSManager.getEntitiesInZone(state, `zone_hand_${playerId}`);
    if (hand.length < 3) {
      ['zone_market_t1', 'zone_market_t2', 'zone_market_t3'].forEach(zId => {
        const cards = ECSManager.getEntitiesInZone(state, zId);
        if (cards.length > 0) {
          actions.push({
            type: 'RESERVE_CARD',
            playerId,
            entityId: cards[0].id,
            fromZoneId: zId
          });
        }
      });
    }

    return actions;
  }

  public static applyAction(
    state: GameState,
    action: Action,
    ctx: ReduceContext
  ): GameState {
    const trace = ctx.trace;
    let nextState = { ...state };
    const pId = action.playerId;
    const player = { ...nextState.players[pId] };
    const tokens = { ...(player.customProps.tokens || {}) };
    const bonuses = { ...(player.customProps.bonuses || {}) };
    const bank = { ...(nextState.globalVars.bank || {}) };

    switch (action.type) {
      case 'TAKE_3_DIFF_GEMS': {
        const gems: GemType[] = action.payload?.gems || ['diamond', 'sapphire', 'emerald'];
        gems.forEach(g => {
          bank[g] = Math.max(0, (bank[g] || 0) - 1);
          tokens[g] = (tokens[g] || 0) + 1;
        });

        player.customProps = { ...player.customProps, tokens };
        nextState.players = { ...nextState.players, [pId]: player };
        nextState.globalVars = { ...nextState.globalVars, bank };

        trace({
          id: `take_3_${ctx.id('g')}`,
          type: 'TOKEN_TRANSFER',
          title: `${player.name} collected 3 gem tokens: ${gems.join(', ')}`,
          durationMs: 400
        });
        this.advanceTurn(nextState, pId, ctx);
        break;
      }

      case 'TAKE_2_SAME_GEMS': {
        const gem: GemType = action.payload?.gem || 'ruby';
        bank[gem] = Math.max(0, (bank[gem] || 0) - 2);
        tokens[gem] = (tokens[gem] || 0) + 2;

        player.customProps = { ...player.customProps, tokens };
        nextState.players = { ...nextState.players, [pId]: player };
        nextState.globalVars = { ...nextState.globalVars, bank };

        trace({
          id: `take_2_${ctx.id('g')}`,
          type: 'TOKEN_TRANSFER',
          title: `${player.name} collected 2 ${gem} tokens`,
          durationMs: 400
        });
        this.advanceTurn(nextState, pId, ctx);
        break;
      }

      case 'BUY_CARD': {
        if (!action.entityId) break;
        const card = nextState.entities[action.entityId];
        if (!card) break;

        const rawCost = card.components.cardFace?.cost || {};
        let goldSpent = 0;

        // Pay tokens back to bank
        for (const [gem, req] of Object.entries(rawCost)) {
          const discount = bonuses[gem] || 0;
          const netCost = Math.max(0, (req as number) - discount);
          const available = tokens[gem] || 0;
          if (available >= netCost) {
            tokens[gem] = available - netCost;
            bank[gem] = (bank[gem] || 0) + netCost;
          } else {
            tokens[gem] = 0;
            bank[gem] = (bank[gem] || 0) + available;
            const remainder = netCost - available;
            goldSpent += remainder;
          }
        }

        if (goldSpent > 0) {
          tokens.gold = Math.max(0, (tokens.gold || 0) - goldSpent);
          bank.gold = (bank.gold || 0) + goldSpent;
        }

        // Add permanent bonus modifier M!
        const cardGem = card.components.custom?.gem;
        if (cardGem) {
          bonuses[cardGem] = (bonuses[cardGem] || 0) + 1;
        }

        // Add VP
        const vp = card.components.cardFace?.score || 0;
        player.score += vp;

        // Move card to player's tableau
        nextState = ECSManager.moveEntity(nextState, card.id, `zone_tableau_${pId}`);

        player.customProps = {
          ...player.customProps,
          tokens,
          bonuses,
          purchasedCards: [...(player.customProps.purchasedCards || []), card.id]
        };
        nextState.players = { ...nextState.players, [pId]: player };
        nextState.globalVars = { ...nextState.globalVars, bank };

        trace({
          id: `buy_card_${ctx.id('g')}`,
          type: 'BUILD_OBJECT',
          title: `${player.name} bought [${card.components.cardFace?.title}] (+1 ${cardGem} bonus, +${vp} VP)`,
          durationMs: 500
        });

        // Check Noble Patron Visit
        const nobles = ECSManager.getEntitiesInZone(nextState, 'zone_nobles');
        for (const noble of nobles) {
          const reqs = noble.components.custom?.requirements || {};
          const satisfied = Object.entries(reqs).every(([g, count]) => (bonuses[g] || 0) >= (count as number));
          if (satisfied) {
            player.score += (noble.components.custom?.vp || 3);
            nextState.players = { ...nextState.players, [pId]: player };
            nextState = ECSManager.moveEntity(nextState, noble.id, `zone_tableau_${pId}`);

            trace({
              id: `noble_${ctx.id('g')}`,
              type: 'ANNOUNCEMENT',
              title: `👑 Noble Patron [${noble.components.cardFace?.title}] visited ${player.name}! (+3 VP)`,
              durationMs: 700
            });
            break; // Max 1 noble per turn
          }
        }

        this.advanceTurn(nextState, pId, ctx);
        break;
      }

      case 'RESERVE_CARD': {
        if (!action.entityId) break;
        const card = nextState.entities[action.entityId];
        if (!card) break;

        nextState = ECSManager.moveEntity(nextState, card.id, `zone_hand_${pId}`);

        // Give 1 gold token if available in bank
        if ((bank.gold || 0) > 0) {
          bank.gold -= 1;
          tokens.gold = (tokens.gold || 0) + 1;
        }

        player.customProps = { ...player.customProps, tokens };
        nextState.players = { ...nextState.players, [pId]: player };
        nextState.globalVars = { ...nextState.globalVars, bank };

        trace({
          id: `reserve_${ctx.id('g')}`,
          type: 'CARD_DRAW',
          title: `${player.name} reserved a card and gained 1 Gold Token`,
          durationMs: 400
        });
        this.advanceTurn(nextState, pId, ctx);
        break;
      }
    }

    return nextState;
  }

  private static advanceTurn(state: GameState, currentPId: PlayerId, ctx: ReduceContext): void {
    const trace = ctx.trace;
    const currentIdx = state.playerOrder.indexOf(currentPId);
    const nextIdx = (currentIdx + 1) % state.playerOrder.length;
    state.activePlayerId = state.playerOrder[nextIdx];
    if (nextIdx === 0) state.round += 1;
    state.turn += 1;

    trace({
      id: `turn_splendor_${ctx.id('g')}`,
      type: 'ANNOUNCEMENT',
      title: `Turn: ${state.players[state.activePlayerId].name}`,
      durationMs: 300
    });
  }

  public static checkWinCondition(state: GameState): { gameOver: boolean; winner: PlayerId | null } {
    for (const player of Object.values(state.players)) {
      if (player.score >= 15) {
        return { gameOver: true, winner: player.id };
      }
    }
    return { gameOver: false, winner: null };
  }
}

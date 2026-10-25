import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

const { GAME_REGISTRY } = await server.ssrLoadModule('/packages/games/src/registry.ts');
const { UniversalGameEngine } = await server.ssrLoadModule('/packages/kernel/src/engine.ts');
const { withDefaultPayload } = await server.ssrLoadModule('/packages/kernel/src/actionPayload.ts');

function log(engine, label) {
  const s = engine.getRawState();
  console.log(
    `[${label}] phase=${s.phase} active=${s.activePlayerId} focus=${engine.getFocusPlayers().join(',')} stack=${s.interruptStack.length} decisions=${s.pendingDecisions.filter(w => w.status === 'OPEN').map(w => w.payload?.kind ?? w.kind).join(',')}`
  );
}

function act(engine, pid, type, payload) {
  const actions = engine.getLegalActions(pid);
  const action = actions.find(a => a.type === type);
  if (!action) {
    console.log(`  !! no ${type} for ${pid}; legal: ${actions.map(a => a.type).join(',')}`);
    return null;
  }
  const merged = payload ? { ...action, payload: { ...(action.payload ?? {}), ...payload } } : action;
  const result = engine.dispatch(withDefaultPayload(merged));
  console.log(`  ${pid} ${type} -> ${result.ok ? 'ok' : 'FAIL: ' + result.error}`);
  if (!result.ok) return null;
  return result;
}

try {
  /* ------------------------------ exploration ------------------------------ */
  {
    const engine = new UniversalGameEngine(GAME_REGISTRY.betrayal, 42);
    engine.getRawState().globalVars.roomDeck = ['chapel'];
    log(engine, 'exploration start');
    act(engine, 'p1', 'EXPLORE_DOOR', { direction: 'E' });
    const afterExplore = engine.getRawState();
    console.log(
      '  omen room',
      afterExplore.players.p1.customProps.currentRoomId,
      'omens',
      afterExplore.globalVars.omensRevealed,
      'pending',
      JSON.stringify(afterExplore.globalVars.pendingHauntRoll)
    );

    // Force a haunt for the probe (the real threshold needs many omens).
    afterExplore.globalVars.omensRevealed = 13;
    afterExplore.globalVars.pendingHauntRoll = { playerId: 'p1', omens: 13 };
    act(engine, 'p1', 'END_TURN');
    log(engine, 'after end turn');
    const frame = engine.getRawState().interruptStack[0];
    console.log('  frame', frame?.type, 'eligible', frame?.responseWindow?.eligiblePlayers);
    act(engine, 'p1', 'ROLL_HAUNT_CHECK');
    const haunted = engine.getRawState();
    log(engine, 'after haunt roll');
    console.log('  haunt', JSON.stringify(haunted.globalVars.haunt), 'roles', haunted.playerOrder.map(id => `${id}:${haunted.players[id].role}`).join(','));
    console.log('  hooks', haunted.activeHooks.map(h => h.hookId).join(','));
  }

  /* ------------------------------- combat --------------------------------- */
  {
    const engine = new UniversalGameEngine(GAME_REGISTRY.betrayal, 42, { scenario: 'haunt_mummy' });
    const raw = engine.getRawState();
    raw.activePlayerId = 'p1';
    raw.players.p1.customProps.attacksLeft = 1;
    raw.players.p1.customProps.movesLeft = 4;
    log(engine, 'combat start (p1 forced active)');
    const attack = engine.getLegalActions('p1').find(a => a.type === 'ATTACK_PLAYER' && a.targetPlayerId === 'p2');
    console.log('  attack options', JSON.stringify(attack?.fields?.map(f => f.key)));
    const before = JSON.stringify(raw.players.p2.customProps.traits);
    act(engine, 'p1', 'ATTACK_PLAYER', { weapon: 'fists', steal: 'no' });
    log(engine, 'after traitor attack');
    const decision = engine.getRawState().pendingDecisions.find(w => w.status === 'OPEN');
    console.log('  decision', decision?.title, JSON.stringify(decision?.payload));
    act(engine, 'p2', 'ALLOCATE_DAMAGE', { trait: 'speed' });
    log(engine, 'after allocate');
    console.log(
      '  p2 traits before/after',
      before,
      JSON.stringify(engine.getRawState().players.p2.customProps.traits),
      'alive',
      engine.getRawState().players.p2.alive
    );
    console.log('  replay', engine.verifyReplay().ok, engine.verifyReplay().errors);
  }

  /* -------------------------------- eye ---------------------------------- */
  {
    const engine = new UniversalGameEngine(GAME_REGISTRY.betrayal, 42, { scenario: 'haunt_eye' });
    log(engine, 'eye start');
    act(engine, 'p2', 'END_TURN');
    log(engine, 'after controlled p2 end');
    act(engine, 'p3', 'ATTACK_MONSTER', { weapon: 'spear' });
    log(engine, 'after p3 spear attack');
    const eyes = Object.values(engine.getRawState().entities).filter(e => e.components.custom?.monster);
    console.log('  eyes', eyes.map(e => `${e.components.custom.stunned}:${e.components.custom.destroyed}`).join(','));
    act(engine, 'p3', 'END_TURN');
    act(engine, 'p1', 'END_TURN');
    log(engine, 'after monster phase');
    console.log('  p2', engine.getRawState().players.p2.alive, engine.getRawState().players.p2.customProps.currentRoomId);
    console.log('  replay', engine.verifyReplay().ok);
  }

  /* -------------------------------- trade --------------------------------- */
  {
    const engine = new UniversalGameEngine(GAME_REGISTRY.betrayal, 42, { scenario: 'trade_ready' });
    log(engine, 'trade start');
    act(engine, 'p1', 'PROPOSE_ITEM_TRADE', { give: 'scenario_item_p1_axe', want: 'scenario_item_p2_rope' });
    log(engine, 'after propose');
    const decision = engine.getRawState().pendingDecisions.find(w => w.status === 'OPEN');
    console.log('  decision', decision?.title, 'participants', decision?.participants.join(','));
    act(engine, 'p2', 'ACCEPT_TRADE');
    log(engine, 'after accept');
    const s = engine.getRawState();
    console.log('  p1 hand', s.zones.zone_hand_p1.orderedEntities, 'p2 hand', s.zones.zone_hand_p2.orderedEntities);
    console.log('  replay', engine.verifyReplay().ok);
  }

  /* ------------------------------ mummy turn ------------------------------ */
  {
    const engine = new UniversalGameEngine(GAME_REGISTRY.betrayal, 42, { scenario: 'haunt_mummy' });
    log(engine, 'mummy start');
    act(engine, 'p2', 'END_TURN');
    log(engine, 'after p2 end');
    act(engine, 'p3', 'END_TURN');
    log(engine, 'after p3 end');
    act(engine, 'p1', 'END_TURN');
    const s = engine.getRawState();
    log(engine, 'after traitor end (monster phase)');
    console.log('  mummy', Object.values(s.entities).filter(e => e.components.custom?.monster).map(e => `${e.components.custom.roomId} carried=${e.components.custom.carryingGirl}`).join(','));
    console.log('  girlHolder', s.globalVars.haunt?.girlHolder, 'p2 alive', s.players.p2.alive, 'traits', JSON.stringify(s.players.p2.customProps.traits));
    console.log('  replay', engine.verifyReplay().ok);
  }

  /* ------------------------------- eye turn ------------------------------- */
  {
    const engine = new UniversalGameEngine(GAME_REGISTRY.betrayal, 42, { scenario: 'haunt_eye' });
    log(engine, 'eye start');
    act(engine, 'p2', 'END_TURN');
    log(engine, 'after controlled p2 end');
    act(engine, 'p3', 'END_TURN');
    log(engine, 'after p3 end');
    act(engine, 'p1', 'END_TURN');
    const s = engine.getRawState();
    log(engine, 'after banished traitor end');
    console.log('  eyes', Object.values(s.entities).filter(e => e.components.custom?.monster).map(e => `${e.components.custom.roomId}:${e.components.custom.stunned}`).join(','));
    console.log('  p2 controlled', s.players.p2.customProps.controlled, 'replay', engine.verifyReplay().ok);
  }

  /* ------------------------------ phantom turn ---------------------------- */
  {
    const engine = new UniversalGameEngine(GAME_REGISTRY.betrayal, 42, { scenario: 'haunt_phantom' });
    log(engine, 'phantom start');
    act(engine, 'p2', 'SEARCH_BONES');
    console.log('  bonesFound', engine.getRawState().globalVars.haunt?.bonesFound);
    act(engine, 'p2', 'END_TURN');
    act(engine, 'p3', 'END_TURN');
    act(engine, 'p1', 'END_TURN');
    const s = engine.getRawState();
    log(engine, 'after monster phase');
    console.log('  phantom', Object.values(s.entities).filter(e => e.components.custom?.monster).map(e => e.components.custom.roomId).join(','));
    console.log('  frost', s.globalVars.frostRooms, 'replay', engine.verifyReplay().ok);
  }
} catch (err) {
  console.error('PROBE ERROR', err);
} finally {
  await server.close();
}

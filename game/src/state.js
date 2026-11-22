// Ember Court — game state and rules: turns, ember, drawing, playing, combat, winning.
// One state object holds both sides; every rule change goes through here so the
// renderer and the AI both read the same truth.
import { CARD_BY_ID, buildDeck, shuffle } from './cards.js';

let uidCounter = 1;

export function newSide(name, title, rng) {
  return {
    name, title,
    life: 30, maxLife: 30,
    ember: 1, emberMax: 1,
    deck: shuffle(buildDeck(), rng),
    hand: [], board: [], discard: [],
    cardsPlayed: 0, damageDealt: 0, creaturesLost: 0,
  };
}

export function newGame(seed) {
  const rng = seed;
  const game = {
    rng,
    turn: 1,
    phase: 'player', // 'player' | 'ai' | 'over'
    screen: 'play', // 'title' | 'play' | 'win' | 'loss'
    player: newSide('You', 'Ember Sovereign', rng),
    ai: newSide('Cinder Warden', 'Warden of the Court', rng),
    log: [],
    winner: null,
    stats: { turns: 0, cardsPlayed: 0, damageDealt: 0 },
    fx: [], // floating texts + particles, owned by the renderer but spawned here
  };
  for (let i = 0; i < 4; i++) { drawCard(game, game.player); drawCard(game, game.ai); }
  drawCard(game, game.ai); // The Warden moves second, so it opens with 5 cards.
  game.player.ember = 1; game.player.emberMax = 1;
  game.ai.ember = 1; game.ai.emberMax = 1;
  addLog(game, 'The Court convenes. You draw 4 cards.');
  return game;
}

export function addLog(game, text) {
  game.log.unshift(text);
  if (game.log.length > 6) game.log.pop();
}

export function makeCreature(defId) {
  const def = CARD_BY_ID[defId];
  return {
    uid: uidCounter++, defId, def,
    atk: def.atk, hp: def.hp, maxHp: def.hp,
    canAttack: false, justPlayed: true, summonedTurn: 0,
  };
}

// Effective attack: Steam gives Ember creatures +1 while their side controls a Tide creature.
export function effAtk(side, creature) {
  let atk = creature.atk;
  if (creature.def.suit === 'ember' && creature.def.text.includes('Steam')) {
    if (side.board.some((c) => c.def.suit === 'tide')) atk += 1;
  }
  return atk;
}

export function drawCard(game, side) {
  if (side.hand.length >= 7) { addLog(game, `${side.name} hand is full — card burned.`); return null; }
  if (side.deck.length === 0) {
    // Fatigue: no cards left costs 1 life per attempted draw.
    side.life -= 1;
    addLog(game, `${side.name} is out of cards and takes 1 fatigue damage.`);
    checkWin(game);
    return null;
  }
  const defId = side.deck.pop();
  const card = { uid: uidCounter++, defId, def: CARD_BY_ID[defId] };
  side.hand.push(card);
  return card;
}

export function startTurn(game, side) {
  // The turn number advances once per round, on the player's turn; the
  // Warden's turn shares the same number so both sides grow ember together.
  if (side === game.player) {
    game.turn += 1;
    game.stats.turns = game.turn;
  }
  side.emberMax = Math.min(10, game.turn);
  side.ember = side.emberMax;
  for (const c of side.board) { c.canAttack = true; c.justPlayed = false; }
  drawCard(game, side);
  addLog(game, `Turn ${game.turn} — ${side.name} gains ${side.emberMax} ember.`);
}

export function canPlay(side, card) {
  if (card.def.type === 'creature' && side.board.length >= 5) return false;
  return side.ember >= card.def.cost;
}

// Play a hand card. target: {kind:'face', side} | {kind:'creature', side, creature} | null.
// Returns true when the play happened.
export function playCard(game, side, foe, card, target) {
  if (!canPlay(side, card)) return false;
  const idx = side.hand.indexOf(card);
  if (idx < 0) return false;
  side.hand.splice(idx, 1);
  side.ember -= card.def.cost;
  side.cardsPlayed += 1;
  game.stats.cardsPlayed += 1;
  const def = card.def;
  if (def.type === 'creature') {
    const creature = makeCreature(def.id);
    creature.summonedTurn = game.turn;
    side.board.push(creature);
    addLog(game, `${side.name} plays ${def.name} (${def.cost} ember).`);
    if (def.text.startsWith('Mend')) { heal(game, side, 2); }
    if (def.text.startsWith('Swift')) { drawCard(game, side); addLog(game, `${def.name} is Swift — ${side.name} draws a card.`); }
    return true;
  }
  // Spells
  if (def.id === 'ember-burst') {
    if (!target) return false;
    dealDamage(game, side, foe, target, 4);
    addLog(game, `${side.name} casts Ember Burst for 4 damage.`);
  } else if (def.id === 'tide-blessing') {
    heal(game, side, 6);
    addLog(game, `${side.name} casts Tide Blessing, restoring 6 life.`);
  } else if (def.id === 'thornweave') {
    if (!target || target.kind !== 'creature' || target.side !== side) return false;
    target.creature.atk += 2; target.creature.hp += 2; target.creature.maxHp += 2;
    addLog(game, `${side.name} casts Thornweave: ${target.creature.def.name} grows +2/+2.`);
  } else if (def.id === 'gale-rush') {
    drawCard(game, side); drawCard(game, side);
    addLog(game, `${side.name} casts Gale Rush and draws 2 cards.`);
  }
  side.discard.push(card);
  return true;
}

export function heal(game, side, amount) {
  const before = side.life;
  side.life = Math.min(side.maxLife, side.life + amount);
  const healed = side.life - before;
  if (healed > 0) game.fx.push({ kind: 'float', text: `+${healed}`, side: side === game.player ? 'player' : 'ai', color: '#7ee2a0' });
}

// Deal damage to a face or a creature. Handles Leech, deaths and the win check.
export function dealDamage(game, attackerSide, foeSide, target, amount) {
  if (target.kind === 'face') {
    const victim = target.side;
    victim.life -= amount;
    attackerSide.damageDealt += amount;
    if (attackerSide === game.player) game.stats.damageDealt += amount;
    game.fx.push({ kind: 'float', text: `-${amount}`, side: victim === game.player ? 'player' : 'ai', color: '#ff6b5e', big: true });
    game.fx.push({ kind: 'shake', power: amount });
    checkWin(game);
    return;
  }
  const creature = target.creature;
  creature.hp -= amount;
  game.fx.push({ kind: 'float', text: `-${amount}`, creature, color: '#ff6b5e' });
  if (creature.hp <= 0) killCreature(game, target.side, creature, attackerSide);
  checkWin(game);
}

export function killCreature(game, side, creature, killerSide) {
  const idx = side.board.indexOf(creature);
  if (idx < 0) return;
  side.board.splice(idx, 1);
  side.creaturesLost += 1;
  addLog(game, `${creature.def.name} is destroyed.`);
  game.fx.push({ kind: 'burst', creature });
}

// One creature attacks another creature or the enemy face.
export function attackCreature(game, side, foe, attacker, target) {
  if (!attacker.canAttack || game.phase === 'over') return false;
  const atk = effAtk(side, attacker);
  attacker.canAttack = false;
  game.fx.push({ kind: 'lunge', creature: attacker, target });
  if (target.kind === 'face') {
    addLog(game, `${attacker.def.name} strikes ${foe.name} for ${atk}.`);
    dealDamage(game, side, foe, target, atk);
    return true;
  }
  const victim = target.creature;
  addLog(game, `${attacker.def.name} attacks ${victim.def.name} (${atk} vs ${victim.atk}).`);
  victim.hp -= atk;
  attacker.hp -= effAtk(foe, victim);
  game.fx.push({ kind: 'float', text: `-${atk}`, creature: victim, color: '#ff6b5e' });
  game.fx.push({ kind: 'float', text: `-${effAtk(foe, victim)}`, creature: attacker, color: '#ff6b5e' });
  let leechHeal = 0;
  if (victim.hp <= 0) {
    killCreature(game, foe, victim, side);
    if (attacker.def.text.includes('Leech')) leechHeal += 2;
  }
  if (attacker.hp <= 0) {
    killCreature(game, side, attacker, foe);
    if (victim.def.text.includes('Leech')) heal(game, foe, 2);
  }
  // Leech heals the owner of the Thorn creature that destroyed something.
  if (leechHeal > 0) heal(game, side, leechHeal);
  checkWin(game);
  return true;
}

export function checkWin(game) {
  if (game.phase === 'over') return;
  if (game.ai.life <= 0) { game.phase = 'over'; game.screen = 'win'; game.winner = 'player'; addLog(game, 'The Cinder Warden falls. You win the Court!'); }
  else if (game.player.life <= 0) { game.phase = 'over'; game.screen = 'loss'; game.winner = 'ai'; addLog(game, 'Your ember gutters out. The Warden wins.'); }
}

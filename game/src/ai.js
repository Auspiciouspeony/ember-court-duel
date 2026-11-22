// Ember Court — the Cinder Warden's brain: a readable, counterable opponent.
// It plays on value (big creatures first, spells where they matter), attacks the
// weakest creature it can kill, and otherwise goes for the player's face.
// Every choice is a plain heuristic, so a player can read it and counter it:
// hold a big Thorn wall and the Warden wastes its attackers on it; keep a Tide
// creature up and its Ember creatures hit harder — kill the Tide first.
import { effAtk, playCard, attackCreature, canPlay } from './state.js';

// Value of a hand card to the Warden, higher = play it sooner.
export function cardValue(game, side, foe, card) {
  const def = card.def;
  if (def.type === 'creature') {
    // Stats per ember, with a bonus for keywords and for filling an empty board.
    let v = (def.atk + def.hp) / Math.max(1, def.cost);
    if (def.text.startsWith('Swift')) v += 0.8;
    if (def.text.startsWith('Mend') && side.life < 24) v += 0.8;
    if (side.board.length === 0) v += 0.5;
    return v;
  }
  if (def.id === 'ember-burst') {
    // Save the burst for lethal, else use it to remove a big threat.
    if (foe.life <= 4) return 99;
    const threat = foe.board.find((c) => effAtk(foe, c) >= 4 && c.hp <= 4);
    return threat ? 5 : 0.5;
  }
  if (def.id === 'tide-blessing') return side.life <= 18 ? 6 : 0.4;
  if (def.id === 'thornweave') return side.board.length > 0 ? 4 : 0;
  if (def.id === 'gale-rush') return side.hand.length <= 3 ? 5 : 1;
  return 1;
}

// Pick a spell target the Warden would choose, or null when it should hold the card.
export function spellTarget(game, side, foe, card) {
  if (card.def.id === 'ember-burst') {
    if (foe.life <= 4) return { kind: 'face', side: foe };
    const threat = [...foe.board].sort((a, b) => effAtk(foe, b) - effAtk(foe, a))
      .find((c) => c.hp <= 4);
    return threat ? { kind: 'creature', side: foe, creature: threat } : null;
  }
  if (card.def.id === 'thornweave') {
    if (side.board.length === 0) return null;
    const best = [...side.board].sort((a, b) => (b.atk + b.hp) - (a.atk + a.hp))[0];
    return { kind: 'creature', side, creature: best };
  }
  return null; // tide-blessing and gale-rush need no target
}

// One AI decision step: play the best affordable card, or null when it is done playing.
export function aiPlayStep(game) {
  const side = game.ai, foe = game.player;
  const playable = side.hand.filter((c) => canPlay(side, c));
  if (playable.length === 0) return null;
  const scored = playable.map((c) => ({ card: c, v: cardValue(game, side, foe, c) }));
  scored.sort((a, b) => b.v - a.v);
  for (const { card } of scored) {
    if (card.def.type === 'spell' && card.def.id !== 'tide-blessing' && card.def.id !== 'gale-rush') {
      const target = spellTarget(game, side, foe, card);
      if (!target) continue; // hold the spell for a better moment
      if (playCard(game, side, foe, card, target)) return card;
    } else if (playCard(game, side, foe, card, null)) {
      return card;
    }
  }
  return null;
}

// One AI attack step: the best ready creature strikes, or null when it is done attacking.
export function aiAttackStep(game) {
  const side = game.ai, foe = game.player;
  const ready = side.board.filter((c) => c.canAttack);
  if (ready.length === 0) return null;
  // Strongest attacker first.
  ready.sort((a, b) => effAtk(side, b) - effAtk(side, a));
  for (const attacker of ready) {
    const atk = effAtk(side, attacker);
    // Kill a creature it can destroy without dying, weakest such target first.
    const killable = foe.board
      .filter((c) => c.hp <= atk && effAtk(foe, c) < attacker.hp)
      .sort((a, b) => (a.atk + a.hp) - (b.atk + b.hp));
    if (killable.length > 0) {
      attackCreature(game, side, foe, attacker, { kind: 'creature', side: foe, creature: killable[0] });
      return attacker;
    }
    // Otherwise go face. In a race for 30 life, face damage is worth the
    // risk: holding back every time a wall stands lets the player win the
    // race for free, so the Warden only trades when it can kill cleanly.
    attackCreature(game, side, foe, attacker, { kind: 'face', side: foe });
    return attacker;
  }
  return null;
}

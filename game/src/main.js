// Ember Court — boot, input, game loop and the AI's turn.
// The game also stages deterministic screenshots: ?shot=title|play|win|loss
// builds a fixed table so the maker can capture the game at its best.
import { makeRng } from './cards.js';
import { newGame, startTurn, playCard, attackCreature, canPlay, makeCreature, drawCard, addLog } from './state.js';
import { aiPlayStep, aiAttackStep } from './ai.js';
import { drawGame, layout, W, H } from './render.js';
import { sfx, isMuted, toggleMute } from './audio.js';

const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed') || '7', 10);
const shot = params.get('shot');

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let game = newGame(makeRng(seed));
game.screen = 'title';

const ui = {
  selectedCard: null, attacker: null, hoverCard: null, hoverEndTurn: false,
  targeting: null, // the hand card awaiting a target
  muted: isMuted(),
};

let aiBusy = false;
let lastTime = 0;

function scaleCanvas() {
  const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
  canvas.style.width = W * scale + 'px';
  canvas.style.height = H * scale + 'px';
}

function toGameCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / rect.width * W,
    y: (e.clientY - rect.top) / rect.height * H,
  };
}

function pointIn(p, box) {
  return box && p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;
}

function startRealGame() {
  game = newGame(makeRng((Date.now() % 100000) + 1));
  game.screen = 'play';
  ui.selectedCard = null; ui.attacker = null; ui.targeting = null;
  sfx.turn();
}

function endPlayerTurn() {
  if (game.phase !== 'player' || game.screen !== 'play') return;
  ui.selectedCard = null; ui.attacker = null; ui.targeting = null;
  game.phase = 'ai';
  aiBusy = true;
  startTurn(game, game.ai); // Warden draws, refills ember, readies creatures.
  addLog(game, 'The Cinder Warden takes its turn…');
  sfx.turn();
  // The Warden thinks in steps, so its plays read as a real opponent's turn.
  const stepDelay = 650;
  let step = 0;
  const runStep = () => {
    if (game.phase !== 'ai' || game.screen !== 'play') { aiBusy = false; return; }
    step += 1;
    if (step <= 6) {
      const played = aiPlayStep(game);
      if (played) { sfx.play(); setTimeout(runStep, stepDelay); return; }
    }
    if (step <= 12) {
      const attacked = aiAttackStep(game);
      if (attacked) { sfx.hit(); setTimeout(runStep, stepDelay); return; }
    }
    // Warden is done: back to the player.
    startTurn(game, game.player);
    game.phase = 'player';
    aiBusy = false;
    if (game.screen === 'play') sfx.turn();
  };
  setTimeout(runStep, stepDelay);
}

function tryPlaySelected(target) {
  const card = ui.targeting;
  if (!card) return;
  const ok = playCard(game, game.player, game.ai, card, target);
  if (ok) { sfx.play(); ui.targeting = null; ui.selectedCard = null; }
  else { sfx.error(); }
}

canvas.addEventListener('mousemove', (e) => {
  const p = toGameCoords(e);
  ui.hoverEndTurn = pointIn(p, layout.endTurn);
  ui.hoverCard = null;
  for (let i = layout.hand.length - 1; i >= 0; i--) {
    if (pointIn(p, layout.hand[i])) { ui.hoverCard = layout.hand[i].card; break; }
  }
  canvas.style.cursor = (ui.hoverCard || ui.hoverEndTurn || pointIn(p, layout.mute) || pointIn(p, layout.restart)) ? 'pointer' : 'default';
});

canvas.addEventListener('click', (e) => {
  const p = toGameCoords(e);
  if (pointIn(p, layout.mute)) { ui.muted = toggleMute(); return; }
  if (pointIn(p, layout.restart)) { startRealGame(); return; }

  if (game.screen === 'title') { startRealGame(); return; }
  if (game.screen === 'win' || game.screen === 'loss') { startRealGame(); return; }
  if (game.phase !== 'player' || aiBusy) return;

  // End Turn button.
  if (pointIn(p, layout.endTurn)) { endPlayerTurn(); return; }

  // A spell awaiting a target: enemy face / enemy creature / friendly creature.
  if (ui.targeting) {
    const def = ui.targeting.def;
    if (def.id === 'ember-burst') {
      if (pointIn(p, layout.aiHero)) { tryPlaySelected({ kind: 'face', side: game.ai }); return; }
      for (const s of layout.aiBoard) {
        if (pointIn(p, s)) { tryPlaySelected({ kind: 'creature', side: game.ai, creature: s.creature }); return; }
      }
    }
    if (def.id === 'thornweave') {
      for (const s of layout.playerBoard) {
        if (pointIn(p, s)) { tryPlaySelected({ kind: 'creature', side: game.player, creature: s.creature }); return; }
      }
    }
    // Clicking elsewhere cancels the targeting.
    ui.targeting = null; ui.selectedCard = null;
    return;
  }

  // An attacker selected: pick a target.
  if (ui.attacker) {
    for (const s of layout.aiBoard) {
      if (pointIn(p, s)) {
        if (attackCreature(game, game.player, game.ai, ui.attacker, { kind: 'creature', side: game.ai, creature: s.creature })) sfx.hit();
        ui.attacker = null;
        return;
      }
    }
    if (pointIn(p, layout.aiHero)) {
      if (attackCreature(game, game.player, game.ai, ui.attacker, { kind: 'face', side: game.ai })) sfx.hit();
      ui.attacker = null;
      return;
    }
    ui.attacker = null;
    return;
  }

  // Clicking a hand card selects it (and plays targetless spells at once).
  for (let i = layout.hand.length - 1; i >= 0; i--) {
    const h = layout.hand[i];
    if (pointIn(p, h)) {
      const card = h.card;
      if (ui.selectedCard === card) { ui.selectedCard = null; return; }
      if (!canPlay(game.player, card)) { sfx.error(); return; }
      ui.selectedCard = card;
      if (card.def.type === 'creature') {
        // Creatures play straight onto the board.
        if (playCard(game, game.player, game.ai, card, null)) { sfx.play(); ui.selectedCard = null; }
      } else if (card.def.id === 'tide-blessing' || card.def.id === 'gale-rush') {
        if (playCard(game, game.player, game.ai, card, null)) { sfx.play(); ui.selectedCard = null; }
      } else {
        // Ember Burst and Thornweave need a target: arm the targeting mode.
        ui.targeting = card;
        sfx.flip();
      }
      return;
    }
  }

  // Clicking one of your ready creatures selects it as the attacker.
  for (const s of layout.playerBoard) {
    if (pointIn(p, s) && s.creature.canAttack) {
      ui.attacker = s.creature;
      sfx.flip();
      return;
    }
  }
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); endPlayerTurn(); }
  if (e.code === 'KeyM') { ui.muted = toggleMute(); }
  if (e.code === 'KeyR') { startRealGame(); }
  if (e.code === 'Escape') { ui.selectedCard = null; ui.attacker = null; ui.targeting = null; }
});

// ---- deterministic staged tables for the screenshots ----
function stageShot(kind) {
  if (kind === 'title') { game.screen = 'title'; return; }
  const rng = makeRng(42);
  game = newGame(rng);
  game.screen = 'play';
  if (kind === 'play') {
    // A full late-game table: turn 8, BOTH boards five creatures deep (the
    // board maximum), both heroes in lethal range — 13 vs 9 — so the shot
    // reads as the duel's decisive moment, not a quiet mid-game. The Flame
    // Knight shows Steam live: a Tide ally is up, so its attack gem is gold
    // at 6 with a STEAM label. Two damage floaters fly at once: the Knight's
    // -6 on the Warden, the Colossus's -7 answered back on you.
    game.turn = 8;
    game.player.life = 13; game.ai.life = 9;
    game.player.ember = 8; game.player.emberMax = 8;
    game.ai.ember = 7; game.ai.emberMax = 7;
    game.player.board = [makeCreature('flame-knight'), makeCreature('reef-turtle'), makeCreature('wind-falcon'), makeCreature('briar-wolf'), makeCreature('tide-acolyte')];
    game.player.board[0].canAttack = true; game.player.board[0].justPlayed = false;
    game.player.board[1].canAttack = true; game.player.board[1].justPlayed = false;
    game.player.board[2].canAttack = false;
    game.player.board[3].canAttack = true; game.player.board[3].justPlayed = false;
    game.player.board[4].canAttack = true; game.player.board[4].justPlayed = false;
    game.ai.board = [makeCreature('thorn-colossus'), makeCreature('cinder-hound'), makeCreature('tide-serpent'), makeCreature('ember-imp'), makeCreature('storm-roc')];
    game.ai.board.forEach((c) => { c.canAttack = true; c.justPlayed = false; });
    game.player.board[0].hp = 3; // battle-worn Knight, still swinging
    game.player.board[1].hp = 4; // battle-worn Turtle
    game.ai.board[0].hp = 5; // Colossus holding at 5
    game.ai.board[2].hp = 3; // Serpent bloodied
    game.player.hand = [
      { uid: 9001, defId: 'ember-burst', def: { id: 'ember-burst', name: 'Ember Burst', suit: 'ember', type: 'spell', cost: 2, art: 'flame', text: 'Deal 4 damage to any target.' } },
      { uid: 9002, defId: 'thornweave', def: { id: 'thornweave', name: 'Thornweave', suit: 'thorn', type: 'spell', cost: 2, art: 'leaf', text: 'Give a friendly creature +2/+2.' } },
      { uid: 9003, defId: 'gale-sprite', def: { id: 'gale-sprite', name: 'Gale Sprite', suit: 'gale', type: 'creature', cost: 1, atk: 2, hp: 1, art: 'swirl', text: 'Swift: draw a card.' } },
      { uid: 9004, defId: 'tide-blessing', def: { id: 'tide-blessing', name: 'Tide Blessing', suit: 'tide', type: 'spell', cost: 2, art: 'drop', text: 'Restore 6 life to your hero.' } },
      { uid: 9005, defId: 'briar-wolf', def: { id: 'briar-wolf', name: 'Briar Wolf', suit: 'thorn', type: 'creature', cost: 3, atk: 4, hp: 3, art: 'leaf', text: 'Leech: heal 2 on a kill.' } },
      { uid: 9006, defId: 'storm-roc', def: { id: 'storm-roc', name: 'Storm Roc', suit: 'gale', type: 'creature', cost: 5, atk: 5, hp: 5, art: 'swirl', text: 'Swift: draw a card.' } },
      { uid: 9007, defId: 'tide-acolyte', def: { id: 'tide-acolyte', name: 'Tide Acolyte', suit: 'tide', type: 'creature', cost: 1, atk: 1, hp: 3, art: 'drop', text: 'Mend: heal 2 when played.' } },
    ];
    game.player.deck = new Array(14).fill('ember-imp');
    game.ai.deck = new Array(16).fill('cinder-hound');
    game.log = [
      'Flame Knight strikes for 6 — Steam!',
      'Thorn Colossus answers for 7. Your life: 13.',
      'Turn 8 — lethal is on the table.',
      'Storm Roc joins the Warden.',
    ];
    game.stats = { turns: 8, cardsPlayed: 17, damageDealt: 17 };
    game.fx.push({ kind: 'float', text: '-6', side: 'ai', color: '#ff6b5e', big: true });
    game.fx.push({ kind: 'float', text: '-7', side: 'player', color: '#ff6b5e', big: true });
    ui.selectedCard = game.player.hand[0];
    return;
  }
  if (kind === 'win') {
    game.player.life = 11; game.ai.life = 0;
    game.player.ember = 3; game.player.emberMax = 9;
    game.ai.ember = 2; game.ai.emberMax = 9;
    game.stats = { turns: 9, cardsPlayed: 15, damageDealt: 30 };
    game.screen = 'win'; game.phase = 'over'; game.winner = 'player';
    // Boards stay empty: the end panel covers the middle of the table, so
    // creatures staged there would only peek out around its edges.
    game.log = ['Ember Burst finishes the Warden for 4.', 'The Cinder Warden falls. You win the Court!'];
    return;
  }
  if (kind === 'loss') {
    game.player.life = 0; game.ai.life = 14;
    game.player.ember = 1; game.player.emberMax = 8;
    game.ai.ember = 4; game.ai.emberMax = 8;
    game.stats = { turns: 8, cardsPlayed: 12, damageDealt: 16 };
    game.screen = 'loss'; game.phase = 'over'; game.winner = 'ai';
    // Boards stay empty: the end panel covers the middle of the table, so
    // creatures staged there would only peek out around its edges.
    game.log = ['Thorn Colossus strikes you for 7.', 'Your ember gutters out. The Warden wins.'];
  }
}

if (shot) stageShot(shot);

function frame(t) {
  drawGame(ctx, game, ui, t || 0);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', scaleCanvas);
scaleCanvas();
requestAnimationFrame(frame);

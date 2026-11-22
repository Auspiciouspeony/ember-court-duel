// Ember Court — canvas rendering: the table, the cards, the HUD, the effects and
// the title / win / loss screens. Everything is drawn in code; no image files.
// Layout is a fixed 1280x720 table, scaled to the window by main.js.
import { SUITS, CARD_BY_ID } from './cards.js';
import { effAtk } from './state.js';

export const W = 1280, H = 720;

// Last frame's hit-test geometry, read by main.js for clicks.
export const layout = {
  hand: [], playerBoard: [], aiBoard: [],
  endTurn: null, aiHero: null, playerHero: null,
  mute: null, restart: null, titleStart: null,
};

// Live animation state, keyed by card uid.
const anims = new Map();
const particles = [];
const floaters = [];
let shake = 0;
let confetti = [];
let emberTimer = 0;

function cardPos(card) {
  if (!anims.has(card.uid)) anims.set(card.uid, { x: 640, y: -200, scale: 1 });
  return anims.get(card.uid);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function lerp(a, b, t) { return a + (b - a) * t; }

// ---- suit glyphs: one unmistakable shape per suit ----
export function drawGlyph(ctx, glyph, x, y, s, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.09;
  ctx.lineJoin = 'round';
  if (glyph === 'flame') {
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.55);
    ctx.bezierCurveTo(s * 0.5, -s * 0.1, s * 0.42, s * 0.42, 0, s * 0.5);
    ctx.bezierCurveTo(-s * 0.42, s * 0.42, -s * 0.5, -s * 0.1, 0, -s * 0.55);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.1);
    ctx.bezierCurveTo(s * 0.2, s * 0.12, s * 0.16, s * 0.34, 0, s * 0.36);
    ctx.bezierCurveTo(-s * 0.16, s * 0.34, -s * 0.2, s * 0.12, 0, -s * 0.1);
    ctx.fill();
  } else if (glyph === 'drop') {
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.55);
    ctx.bezierCurveTo(s * 0.42, s * 0.05, s * 0.38, s * 0.5, 0, s * 0.5);
    ctx.bezierCurveTo(-s * 0.38, s * 0.5, -s * 0.42, s * 0.05, 0, -s * 0.55);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(-s * 0.12, s * 0.18, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
  } else if (glyph === 'leaf') {
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.5);
    ctx.bezierCurveTo(s * 0.5, -s * 0.25, s * 0.42, s * 0.45, 0, s * 0.55);
    ctx.bezierCurveTo(-s * 0.42, s * 0.45, -s * 0.5, -s * 0.25, 0, -s * 0.5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.4);
    ctx.lineTo(0, s * 0.45);
    ctx.stroke();
  } else { // swirl
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 5; a += 0.15) {
      const r = (a / (Math.PI * 5)) * s * 0.5;
      const px = Math.cos(a) * r, py = Math.sin(a) * r - s * 0.05;
      if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -s * 0.05, s * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---- one card face ----
export function drawCardFace(ctx, def, x, y, w, h, opts) {
  const o = opts || {};
  const suit = SUITS[def.suit];
  ctx.save();
  if (o.dimmed) ctx.globalAlpha = 0.55;
  // Body
  roundRect(ctx, x, y, w, h, 10);
  ctx.fillStyle = '#f7f1e3';
  ctx.fill();
  ctx.lineWidth = o.selected ? 4 : 2;
  ctx.strokeStyle = o.selected ? '#ffd97a' : (o.playable ? '#7ee2a0' : suit.dark);
  ctx.stroke();
  // Suit header band
  ctx.save();
  roundRect(ctx, x + 2, y + 2, w - 4, h * 0.22, 8);
  ctx.clip();
  ctx.fillStyle = suit.color;
  ctx.fillRect(x, y, w, h * 0.22);
  ctx.restore();
  // Cost gem
  ctx.beginPath();
  ctx.arc(x + 16, y + 16, 13, 0, Math.PI * 2);
  ctx.fillStyle = '#2b3a67';
  ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#ffd97a'; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 17px Georgia, serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(def.cost), x + 16, y + 17);
  // Name
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.fillText(def.name, x + 33, y + 17, w - 38);
  // Art: a suit glyph on a glowing medallion — a large ghost glyph, turned a
  // little per card so each portrait differs, behind the crisp white glyph.
  const cy = y + h * 0.48;
  const med = ctx.createRadialGradient(x + w / 2, cy - h * 0.05, 2, x + w / 2, cy, h * 0.22);
  med.addColorStop(0, suit.light);
  med.addColorStop(1, suit.color);
  ctx.beginPath();
  ctx.arc(x + w / 2, cy, h * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = med;
  ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = suit.dark; ctx.stroke();
  ctx.save();
  ctx.translate(x + w / 2, cy);
  ctx.rotate(((def.id.length % 5) - 2) * 0.14);
  ctx.globalAlpha = 0.28;
  drawGlyph(ctx, suit.glyph, 0, 0, h * 0.44, suit.dark);
  ctx.restore();
  ctx.globalAlpha = 1;
  drawGlyph(ctx, suit.glyph, x + w / 2, cy, h * 0.3, '#ffffff');
  ctx.beginPath();
  ctx.arc(x + w / 2, cy, h * 0.2, 0, Math.PI * 2);
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,217,122,0.9)'; ctx.stroke();
  // Rules text
  ctx.fillStyle = '#3a3128';
  ctx.font = '10px Georgia, serif';
  ctx.textAlign = 'center';
  wrapText(ctx, def.text, x + w / 2, y + h * 0.70, w - 12, 11);
  // Creature stats — a Steam-boosted attack gem turns gold and is labelled,
  // so the combo reads on the card instead of hiding in the rules text.
  if (def.type === 'creature') {
    const atk = o.atk !== undefined ? o.atk : def.atk;
    const hp = o.hp !== undefined ? o.hp : def.hp;
    const boosted = o.atk !== undefined && o.atk > def.atk;
    ctx.font = 'bold 18px Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.beginPath(); ctx.arc(x + 18, y + h - 18, 14, 0, Math.PI * 2);
    ctx.fillStyle = boosted ? '#f5b83d' : '#c0392b'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = boosted ? '#8a6410' : '#fff'; ctx.stroke();
    ctx.fillStyle = boosted ? '#3a2a00' : '#fff';
    ctx.fillText('⚔' + atk, x + 18, y + h - 17);
    if (boosted) {
      ctx.font = 'bold 9px Georgia, serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#8a6410';
      ctx.fillText('STEAM', x + 36, y + h - 17);
    }
    ctx.beginPath(); ctx.arc(x + w - 18, y + h - 18, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#27ae60'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px Georgia, serif';
    ctx.fillText('♥' + hp, x + w - 18, y + h - 17);
  } else {
    ctx.font = 'bold 10px Georgia, serif';
    ctx.fillStyle = suit.dark;
    ctx.fillText('— SPELL —', x + w / 2, y + h - 14);
  }
  // Summoning-sickness / exhausted veil
  if (o.exhausted) {
    ctx.fillStyle = 'rgba(20,20,30,0.45)';
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px Georgia, serif';
    ctx.fillText('RESTING', x + w / 2, y + h / 2);
  }
  if (o.faceDown) {
    roundRect(ctx, x, y, w, h, 10);
    ctx.fillStyle = '#5b2d2d';
    ctx.fill();
    ctx.strokeStyle = '#ffd97a'; ctx.lineWidth = 2; ctx.stroke();
    drawGlyph(ctx, 'flame', x + w / 2, y + h / 2, h * 0.3, '#ffd97a');
  }
  ctx.restore();
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  lines.slice(0, 3).forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
}

// ---- the table ----
function drawTable(ctx) {
  const g = ctx.createRadialGradient(640, 340, 80, 640, 360, 760);
  g.addColorStop(0, '#2e6b4f');
  g.addColorStop(0.6, '#1d4a35');
  g.addColorStop(1, '#0f2a1d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Wood frame
  ctx.strokeStyle = '#6b4a2b';
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, W - 14, H - 14);
  ctx.strokeStyle = '#d9a441';
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 16, W - 32, H - 32);
  // Faint suit watermarks in the corners
  ctx.globalAlpha = 0.07;
  drawGlyph(ctx, 'flame', 70, 660, 90, '#fff');
  drawGlyph(ctx, 'drop', 1210, 660, 90, '#fff');
  drawGlyph(ctx, 'leaf', 70, 60, 90, '#fff');
  drawGlyph(ctx, 'swirl', 1210, 60, 90, '#fff');
  ctx.globalAlpha = 1;
}

function drawLifeBar(ctx, x, y, w, life, maxLife, big) {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, x, y, w, big ? 26 : 20, 6);
  ctx.fill();
  const frac = Math.max(0, life / maxLife);
  const g = ctx.createLinearGradient(x, y, x + w, y);
  g.addColorStop(0, '#e5484d');
  g.addColorStop(1, '#ff7a5c');
  ctx.fillStyle = g;
  roundRect(ctx, x + 2, y + 2, (w - 4) * frac, (big ? 26 : 20) - 4, 5);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${big ? 16 : 13}px Georgia, serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(`♥ ${life} / ${maxLife}`, x + w / 2, y + (big ? 13 : 10));
}

function drawEmberPips(ctx, x, y, ember, emberMax) {
  ctx.font = 'bold 12px Georgia, serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd97a';
  ctx.fillText('Ember', x, y);
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.arc(x + 52 + i * 17, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = i < ember ? '#f5b83d' : 'rgba(255,255,255,0.18)';
    ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = '#8a6410'; ctx.stroke();
  }
  ctx.fillStyle = '#fff';
  ctx.fillText(`${ember}/${emberMax}`, x + 52 + 10 * 17 + 6, y);
}

function drawHero(ctx, side, x, y, isPlayer, game) {
  const suit = isPlayer ? SUITS.ember : SUITS.thorn;
  ctx.beginPath();
  ctx.arc(x + 26, y + 26, 26, 0, Math.PI * 2);
  ctx.fillStyle = suit.dark;
  ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#ffd97a'; ctx.stroke();
  drawGlyph(ctx, isPlayer ? 'flame' : 'leaf', x + 26, y + 26, 34, '#ffd97a');
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px Georgia, serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(side.title, x + 60, y + 14);
  ctx.font = '12px Georgia, serif';
  ctx.fillStyle = '#cfe8d8';
  ctx.fillText(isPlayer ? 'You · Ember Sovereign' : 'Opponent · AI', x + 60, y + 34);
  drawLifeBar(ctx, x + 60, y + 40, 300, side.life, side.maxLife, !isPlayer);
  drawEmberPips(ctx, x + 380, y + 20, side.ember, side.emberMax);
  ctx.font = '12px Georgia, serif';
  ctx.fillStyle = '#cfe8d8';
  ctx.fillText(`Deck ${side.deck.length} · Hand ${side.hand.length}`, x + 380, y + 44);
  return { x: x, y: y, w: 560, h: 76 };
}

// Consume game.fx into live animations.
function pumpFx(game) {
  for (const fx of game.fx) {
    if (fx.kind === 'float') {
      let x = 640, y = 360;
      if (fx.creature) {
        const p = cardPos(fx.creature);
        x = p.x; y = p.y - 20;
      } else if (fx.side === 'player') { x = 880; y = 440; }
      else { x = 880; y = 200; }
      floaters.push({ text: fx.text, x, y, color: fx.color, big: !!fx.big, life: 1 });
    } else if (fx.kind === 'shake') {
      shake = Math.max(shake, fx.power);
    } else if (fx.kind === 'burst') {
      const p = cardPos(fx.creature);
      for (let i = 0; i < 18; i++) {
        particles.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 220, vy: (Math.random() - 0.7) * 220, life: 0.7, color: ['#ffd97a', '#e5484d', '#f5b83d'][i % 3], size: 3 + Math.random() * 3 });
      }
    } else if (fx.kind === 'lunge') {
      const p = cardPos(fx.creature);
      const t = fx.target.kind === 'face'
        ? (fx.target.side === game.player ? { x: 300, y: 520 } : { x: 300, y: 60 })
        : cardPos(fx.target.creature);
      p.lunge = { tx: t.x, ty: t.y, t: 0 };
    }
  }
  game.fx.length = 0;
}

export function drawGame(ctx, game, ui, time) {
  pumpFx(game);
  ctx.save();
  if (shake > 0.3) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    shake *= 0.86;
  }
  drawTable(ctx);

  if (game.screen === 'title') { drawTitle(ctx, game, time); ctx.restore(); return; }
  if (game.screen === 'win' || game.screen === 'loss') {
    drawBoard(ctx, game, ui, time);
    drawEndScreen(ctx, game, time);
    ctx.restore();
    return;
  }
  drawBoard(ctx, game, ui, time);
  ctx.restore();
}

function drawBoard(ctx, game, ui, time) {
  const player = game.player, ai = game.ai;

  // --- opponent hero + hand backs ---
  layout.aiHero = drawHero(ctx, ai, 30, 14, false, game);
  for (let i = 0; i < Math.min(ai.hand.length, 7); i++) {
    const x = 700 + i * 34, y = 26;
    drawCardFace(ctx, ai.hand[i].def, x, y, 46, 66, { faceDown: true });
  }
  ctx.fillStyle = '#cfe8d8';
  ctx.font = '12px Georgia, serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(`Warden's hand · ${ai.hand.length} cards`, 700, 108);

  // --- opponent board ---
  const aiSlots = boardSlots(game, ai, 150);
  layout.aiBoard = aiSlots;
  ai.board.forEach((c, i) => {
    const slot = aiSlots[i];
    const p = cardPos(c);
    p.x = lerp(p.x, slot.x + 52, 0.18); p.y = lerp(p.y, slot.y + 66, 0.18);
    if (p.lunge) {
      p.lunge.t += 0.09;
      const k = Math.sin(Math.min(1, p.lunge.t) * Math.PI) * 0.35;
      p.x = lerp(p.x, p.lunge.tx, k * 0.3); p.y = lerp(p.y, p.lunge.ty, k * 0.3);
      if (p.lunge.t >= 1) p.lunge = null;
    }
    drawCardFace(ctx, c.def, p.x - 52, p.y - 66, 104, 132, {
      atk: effAtk(ai, c), hp: c.hp, exhausted: !c.canAttack,
    });
    if (ui && ui.attacker === c) {
      ctx.strokeStyle = '#ffd97a'; ctx.lineWidth = 3;
      roundRect(ctx, p.x - 55, p.y - 69, 110, 138, 10); ctx.stroke();
    }
  });

  // --- middle band: log + end turn ---
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, 30, 296, 640, 52, 8); ctx.fill();
  ctx.fillStyle = '#e8f5ec';
  ctx.font = '13px Georgia, serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(game.log[0] || '', 44, 322);
  ctx.fillStyle = '#9fc7ae';
  ctx.font = '11px Georgia, serif';
  ctx.fillText(game.log[1] || '', 44, 338);

  const turnLabel = game.phase === 'player' ? 'YOUR TURN' : (game.phase === 'ai' ? "WARDEN'S TURN" : 'GAME OVER');
  if (game.screen === 'play') {
    ctx.fillStyle = game.phase === 'player' ? '#ffd97a' : '#cfe8d8';
    ctx.font = 'bold 15px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(turnLabel, 917, 308);
    ctx.font = '12px Georgia, serif';
    ctx.fillStyle = '#cfe8d8';
    ctx.fillText(`Turn ${game.turn}`, 917, 330);
  }

  // End Turn button
  const et = { x: 700, y: 296, w: 130, h: 52 };
  layout.endTurn = et;
  if (game.screen === 'play') {
    const canEnd = game.phase === 'player';
    ctx.fillStyle = canEnd ? (ui && ui.hoverEndTurn ? '#e8b64c' : '#d9a441') : '#5a5a5a';
    roundRect(ctx, et.x, et.y, et.w, et.h, 8); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#fff3d0'; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('END TURN', et.x + et.w / 2, et.y + et.h / 2 + 1);
  }

  // --- player board ---
  const pSlots = boardSlots(game, player, 360);
  layout.playerBoard = pSlots;
  player.board.forEach((c, i) => {
    const slot = pSlots[i];
    const p = cardPos(c);
    p.x = lerp(p.x, slot.x + 52, 0.18); p.y = lerp(p.y, slot.y + 66, 0.18);
    if (p.lunge) {
      p.lunge.t += 0.09;
      const k = Math.sin(Math.min(1, p.lunge.t) * Math.PI) * 0.35;
      p.x = lerp(p.x, p.lunge.tx, k * 0.3); p.y = lerp(p.y, p.lunge.ty, k * 0.3);
      if (p.lunge.t >= 1) p.lunge = null;
    }
    const ready = c.canAttack && game.phase === 'player';
    drawCardFace(ctx, c.def, p.x - 52, p.y - 66, 104, 132, {
      atk: effAtk(player, c), hp: c.hp, exhausted: !c.canAttack,
      selected: ui && ui.attacker === c,
      playable: ready,
    });
    if (ready) {
      ctx.strokeStyle = 'rgba(126,226,160,0.9)'; ctx.lineWidth = 2;
      roundRect(ctx, p.x - 55, p.y - 69, 110, 138, 10); ctx.stroke();
    }
  });
  ctx.fillStyle = '#cfe8d8';
  ctx.font = '12px Georgia, serif';
  ctx.textAlign = 'center';
  // Empty-board hints only during play: on the win/loss screens the dimmed
  // table shows through the end panel, and the hints would ghost beside it.
  if (game.screen === 'play') {
    if (player.board.length === 0) ctx.fillText('Your board is empty — play a creature.', 480, 430);
    if (ai.board.length === 0) ctx.fillText('The Warden has no creatures — strike the face!', 480, 220);
  }

  // --- player hero row (life bar kept clear of the raised hand cards) ---
  layout.playerHero = drawHero(ctx, player, 30, 492, true, game);

  // --- player hand (kept clear of the hero's life bar above it) ---
  layout.hand = [];
  const hand = player.hand;
  const cw = 118, ch = 150;
  // Cards sit nearly side by side (112 px of each 118 px card shows), so
  // every name and cost reads at a glance instead of hiding under its neighbour.
  const overlap = hand.length > 1 ? Math.min(112, (900 - cw) / (hand.length - 1)) : 0;
  const totalW = cw + overlap * (hand.length - 1);
  const startX = 30 + (900 - totalW) / 2;
  hand.forEach((card, i) => {
    const hover = ui && ui.hoverCard === card;
    const selected = ui && ui.selectedCard === card;
    const tx = startX + i * overlap + cw / 2;
    const ty = 648 - (hover || selected ? 18 : 0);
    const p = cardPos(card);
    p.x = lerp(p.x, tx, 0.22); p.y = lerp(p.y, ty, 0.22);
    drawCardFace(ctx, card.def, p.x - cw / 2, p.y - ch / 2, cw, ch, {
      selected, playable: game.phase === 'player' && player.ember >= card.def.cost,
      dimmed: game.phase === 'player' && player.ember < card.def.cost,
    });
    layout.hand.push({ card, x: p.x - cw / 2, y: p.y - ch / 2, w: cw, h: ch });
  });

  // --- right panel: log, legend, stats ---
  drawSidePanel(ctx, game, ui);

  // --- particles + floaters ---
  drawParticles(ctx, time);
  drawFloaters(ctx);
}

function boardSlots(game, side, y) {
  const n = side.board.length;
  const w = 104, gap = 14;
  const totalW = n * w + (n - 1) * gap;
  const startX = 30 + (900 - totalW) / 2;
  return side.board.map((c, i) => ({ creature: c, x: startX + i * (w + gap), y, w, h: 132 }));
}

function drawSidePanel(ctx, game, ui) {
  const x = 1005, w = 255;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, x, 14, w, 692, 10); ctx.fill();
  ctx.strokeStyle = '#d9a441'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#ffd97a';
  ctx.font = 'bold 14px Georgia, serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('COURT LOG', x + 14, 36);
  ctx.font = '11.5px Georgia, serif';
  ctx.fillStyle = '#e8f5ec';
  game.log.slice(0, 4).forEach((line, i) => {
    ctx.globalAlpha = 1 - i * 0.16;
    wrapText(ctx, '• ' + line, x + 14, 62 + i * 38, w - 28, 13);
  });
  ctx.globalAlpha = 1;
  // Suit legend
  ctx.fillStyle = '#ffd97a';
  ctx.font = 'bold 14px Georgia, serif';
  ctx.fillText('THE FOUR SUITS', x + 14, 232);
  const suits = ['ember', 'tide', 'thorn', 'gale'];
  suits.forEach((s, i) => {
    const su = SUITS[s];
    const y = 258 + i * 34;
    drawGlyph(ctx, su.glyph, x + 28, y, 22, su.color);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px Georgia, serif';
    ctx.fillText(su.name, x + 48, y);
    ctx.fillStyle = '#cfe8d8';
    ctx.font = '11px Georgia, serif';
    const note = { ember: 'Aggression · Steam', tide: 'Healing · Mend', thorn: 'Endurance · Leech', gale: 'Speed · Swift' }[s];
    ctx.fillText(note, x + 110, y);
  });
  // Stats
  ctx.fillStyle = '#ffd97a';
  ctx.font = 'bold 14px Georgia, serif';
  ctx.fillText('DUEL RECORD', x + 14, 408);
  ctx.font = '12px Georgia, serif';
  ctx.fillStyle = '#e8f5ec';
  const rows = [
    `Turns played: ${game.stats.turns}`,
    `Cards played: ${game.stats.cardsPlayed}`,
    `Damage dealt: ${game.stats.damageDealt}`,
    `Your creatures lost: ${game.player.creaturesLost}`,
    `Warden's creatures lost: ${game.ai.creaturesLost}`,
  ];
  rows.forEach((r, i) => ctx.fillText(r, x + 14, 434 + i * 22));
  // How to play
  ctx.fillStyle = '#ffd97a';
  ctx.font = 'bold 14px Georgia, serif';
  ctx.fillText('HOW TO PLAY', x + 14, 556);
  ctx.font = '11.5px Georgia, serif';
  ctx.fillStyle = '#cfe8d8';
  const tips = [
    'Click a hand card, then the board',
    'or a target, to play it.',
    'Click a ready creature, then an',
    'enemy or the Warden, to attack.',
    'Space: end turn · M: mute · R: restart',
  ];
  tips.forEach((t, i) => ctx.fillText(t, x + 14, 578 + i * 18));
  // Mute button
  const mb = { x: x + 14, y: 668, w: 100, h: 26 };
  layout.mute = mb;
  ctx.fillStyle = '#3a5a44';
  roundRect(ctx, mb.x, mb.y, mb.w, mb.h, 6); ctx.fill();
  ctx.strokeStyle = '#d9a441'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(ui && ui.muted ? '🔇 MUTED' : '🔊 SOUND', mb.x + mb.w / 2, mb.y + 14);
  const rb = { x: x + 124, y: 668, w: 117, h: 26 };
  layout.restart = rb;
  ctx.fillStyle = '#3a5a44';
  roundRect(ctx, rb.x, rb.y, rb.w, rb.h, 6); ctx.fill();
  ctx.stroke();
  ctx.fillText('↻ RESTART', rb.x + rb.w / 2, rb.y + 14);
}

function drawParticles(ctx, time) {
  // Ambient embers rising over the table.
  emberTimer -= 1;
  if (emberTimer <= 0) {
    emberTimer = 14;
    particles.push({ x: 40 + Math.random() * 920, y: 720, vx: (Math.random() - 0.5) * 12, vy: -22 - Math.random() * 18, life: 3.2, color: Math.random() < 0.5 ? '#f5b83d' : '#e5484d', size: 2 + Math.random() * 2.5, ambient: true });
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= 0.016;
    p.x += p.vx * 0.016; p.y += p.vy * 0.016;
    if (p.life <= 0 || p.y < -10) { particles.splice(i, 1); continue; }
    ctx.globalAlpha = Math.min(1, p.life) * (p.ambient ? 0.5 : 0.95);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Win confetti
  for (let i = confetti.length - 1; i >= 0; i--) {
    const c = confetti[i];
    c.life -= 0.012;
    c.x += c.vx; c.y += c.vy; c.vy += 0.12; c.rot += 0.1;
    if (c.life <= 0 || c.y > 740) { confetti.splice(i, 1); continue; }
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    ctx.fillStyle = c.color;
    ctx.fillRect(-4, -2, 8, 4);
    ctx.restore();
  }
}

function drawFloaters(ctx) {
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.life -= 0.02;
    f.y -= 0.9;
    if (f.life <= 0) { floaters.splice(i, 1); continue; }
    ctx.globalAlpha = Math.min(1, f.life * 1.4);
    ctx.fillStyle = f.color;
    ctx.font = `bold ${f.big ? 30 : 20}px Georgia, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 4;
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function spawnConfetti() {
  if (confetti.length > 0) return;
  const colors = ['#ffd97a', '#e5484d', '#3e9bff', '#46a758', '#f5b83d'];
  for (let i = 0; i < 160; i++) {
    confetti.push({ x: 100 + Math.random() * 1080, y: -20 - Math.random() * 120, vx: (Math.random() - 0.5) * 2.4, vy: 1 + Math.random() * 2, rot: Math.random() * 6, life: 4 + Math.random() * 2, color: colors[i % colors.length] });
  }
}

function drawTitle(ctx, game, time) {
  // Fanned sample cards behind the title — the real 1-cost courtiers.
  const samples = [CARD_BY_ID['ember-imp'], CARD_BY_ID['tide-acolyte'], CARD_BY_ID['thorn-sprout'], CARD_BY_ID['gale-sprite']];
  samples.forEach((def, i) => {
    ctx.save();
    ctx.translate(400 + i * 170, 556);
    ctx.rotate((i - 1.5) * 0.1);
    drawCardFace(ctx, def, -59, -81, 118, 162, {});
    ctx.restore();
  });
  ctx.fillStyle = 'rgba(10,20,14,0.55)';
  ctx.fillRect(0, 0, W, H);
  // The four suits above the title, so the suits read at a glance.
  ['ember', 'tide', 'thorn', 'gale'].forEach((k, i) => {
    const su = SUITS[k];
    const gx = 490 + i * 100;
    drawGlyph(ctx, su.glyph, gx, 108, 40, su.color);
    ctx.fillStyle = '#cfe8d8';
    ctx.font = 'bold 12px Georgia, serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(su.name, gx, 138);
  });
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd97a';
  ctx.font = 'bold 92px Georgia, serif';
  ctx.shadowColor = '#000'; ctx.shadowBlur = 18;
  ctx.fillText('EMBER COURT', 640, 210);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.font = 'italic 26px Georgia, serif';
  ctx.fillText('A duel of ember cards — outwit the Cinder Warden', 640, 290);
  ctx.font = '17px Georgia, serif';
  ctx.fillStyle = '#cfe8d8';
  ctx.fillText('Four suits, one table. Play creatures, cast spells,', 640, 350);
  ctx.fillText('combine Steam, Mend, Leech and Swift — and take the Warden to 0 life.', 640, 376);
  const pulse = 0.75 + Math.sin(time / 350) * 0.25;
  ctx.globalAlpha = pulse;
  ctx.fillStyle = '#ffd97a';
  ctx.font = 'bold 24px Georgia, serif';
  ctx.fillText('— CLICK TO BEGIN —', 640, 445);
  ctx.globalAlpha = 1;
  ctx.font = '13px Georgia, serif';
  ctx.fillStyle = '#9fc7ae';
  ctx.fillText('Mouse + keyboard · Space ends your turn · M mutes · R restarts', 640, 676);
  layout.titleStart = { x: 0, y: 0, w: W, h: H };
  drawParticles(ctx, time);
}

function drawEndScreen(ctx, game, time) {
  const win = game.screen === 'win';
  if (win) spawnConfetti();
  ctx.fillStyle = 'rgba(8,16,12,0.62)';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(640, 330);
  ctx.fillStyle = 'rgba(20,32,24,0.92)';
  roundRect(ctx, -260, -150, 520, 300, 16); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = win ? '#ffd97a' : '#e5484d'; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = win ? '#ffd97a' : '#ff6b5e';
  ctx.font = 'bold 64px Georgia, serif';
  ctx.fillText(win ? 'VICTORY' : 'DEFEAT', 0, -88);
  ctx.fillStyle = '#fff';
  ctx.font = 'italic 19px Georgia, serif';
  ctx.fillText(win ? 'The Cinder Warden bows. The Court is yours.' : 'Your ember gutters out. The Warden keeps the Court.', 0, -34);
  ctx.font = '16px Georgia, serif';
  ctx.fillStyle = '#cfe8d8';
  ctx.fillText(`Turns: ${game.stats.turns}   ·   Cards played: ${game.stats.cardsPlayed}   ·   Damage dealt: ${game.stats.damageDealt}`, 0, 8);
  ctx.fillText(`Your life: ${Math.max(0, game.player.life)}   ·   Warden's life: ${Math.max(0, game.ai.life)}`, 0, 36);
  const pulse = 0.75 + Math.sin(time / 350) * 0.25;
  ctx.globalAlpha = pulse;
  ctx.fillStyle = '#ffd97a';
  ctx.font = 'bold 20px Georgia, serif';
  ctx.fillText('— CLICK TO PLAY AGAIN —', 0, 92);
  ctx.globalAlpha = 1;
  ctx.restore();
  drawParticles(ctx, time);
  drawFloaters(ctx);
}

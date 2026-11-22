// Ember Court — the card catalogue: every card in the game, its suit, cost and rules text.
// Suits are told apart by colour AND shape, never by text alone:
//   Ember = red + flame, Tide = blue + droplet, Thorn = green + leaf, Gale = gold + swirl.
export const SUITS = {
  ember: { name: 'Ember', color: '#e5484d', dark: '#8f1d22', light: '#ff8a7a', glyph: 'flame' },
  tide: { name: 'Tide', color: '#3e9bff', dark: '#174a7a', light: '#8ec9ff', glyph: 'drop' },
  thorn: { name: 'Thorn', color: '#46a758', dark: '#1e5c2e', light: '#8fd6a0', glyph: 'leaf' },
  gale: { name: 'Gale', color: '#f5b83d', dark: '#8a6410', light: '#ffd97a', glyph: 'swirl' },
};

// Card definitions. Creatures fight on the board; spells resolve at once.
// Keywords: Steam (Ember creature +1 attack while you control a Tide creature),
// Mend (heal your hero when played), Leech (heal your hero when it destroys a
// creature), Swift (draw a card when played).
export const CARDS = [
  { id: 'ember-imp', name: 'Ember Imp', suit: 'ember', type: 'creature', cost: 1, atk: 2, hp: 1, art: 'flame', text: 'Steam: +1 attack with a Tide ally.' },
  { id: 'cinder-hound', name: 'Cinder Hound', suit: 'ember', type: 'creature', cost: 2, atk: 3, hp: 2, art: 'flame', text: 'A hound of living coal.' },
  { id: 'flame-knight', name: 'Flame Knight', suit: 'ember', type: 'creature', cost: 4, atk: 5, hp: 4, art: 'flame', text: 'Steam: +1 attack with a Tide ally.' },
  { id: 'tide-acolyte', name: 'Tide Acolyte', suit: 'tide', type: 'creature', cost: 1, atk: 1, hp: 3, art: 'drop', text: 'Mend: heal 2 when played.' },
  { id: 'reef-turtle', name: 'Reef Turtle', suit: 'tide', type: 'creature', cost: 3, atk: 2, hp: 5, art: 'drop', text: 'Mend: heal 2 when played.' },
  { id: 'tide-serpent', name: 'Tide Serpent', suit: 'tide', type: 'creature', cost: 5, atk: 6, hp: 5, art: 'drop', text: 'The river itself, given teeth.' },
  { id: 'thorn-sprout', name: 'Thorn Sprout', suit: 'thorn', type: 'creature', cost: 1, atk: 1, hp: 2, art: 'leaf', text: 'Leech: heal 2 on a kill.' },
  { id: 'briar-wolf', name: 'Briar Wolf', suit: 'thorn', type: 'creature', cost: 3, atk: 4, hp: 3, art: 'leaf', text: 'Leech: heal 2 on a kill.' },
  { id: 'thorn-colossus', name: 'Thorn Colossus', suit: 'thorn', type: 'creature', cost: 6, atk: 7, hp: 7, art: 'leaf', text: 'Leech: heal 2 on a kill.' },
  { id: 'gale-sprite', name: 'Gale Sprite', suit: 'gale', type: 'creature', cost: 1, atk: 2, hp: 1, art: 'swirl', text: 'Swift: draw a card.' },
  { id: 'wind-falcon', name: 'Wind Falcon', suit: 'gale', type: 'creature', cost: 2, atk: 3, hp: 2, art: 'swirl', text: 'Swift: draw a card.' },
  { id: 'storm-roc', name: 'Storm Roc', suit: 'gale', type: 'creature', cost: 5, atk: 5, hp: 5, art: 'swirl', text: 'Swift: draw a card.' },
  { id: 'ember-burst', name: 'Ember Burst', suit: 'ember', type: 'spell', cost: 2, art: 'flame', text: 'Deal 4 damage to any target.' },
  { id: 'tide-blessing', name: 'Tide Blessing', suit: 'tide', type: 'spell', cost: 2, art: 'drop', text: 'Restore 6 life to your hero.' },
  { id: 'thornweave', name: 'Thornweave', suit: 'thorn', type: 'spell', cost: 2, art: 'leaf', text: 'Give a friendly creature +2/+2.' },
  { id: 'gale-rush', name: 'Gale Rush', suit: 'gale', type: 'spell', cost: 3, art: 'swirl', text: 'Draw 2 cards.' },
];

export const CARD_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));

// A 28-card deck: two copies of every creature, one of every spell.
export function buildDeck() {
  const deck = [];
  for (const c of CARDS) {
    const copies = c.type === 'creature' ? 2 : 1;
    for (let i = 0; i < copies; i++) deck.push(c.id);
  }
  return deck;
}

// Tiny seeded RNG (mulberry32) so staged shots and playtests are reproducible.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

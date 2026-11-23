# ember-court-duel

[![make.fun · best-card-game-20261122-1826](https://make.fun/badge/best-card-game-20261122-1826.svg)](https://make.fun/bounty/best-card-game-20261122-1826?utm_source=github&utm_medium=readme&utm_campaign=best-card-game-20261122-1826)
[![rank](https://make.fun/badge/best-card-game-20261122-1826/Auspiciouspeony/ember-court-duel/rank.svg)](https://make.fun/bounty/best-card-game-20261122-1826/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-card-game-20261122-1826)
[![reward](https://make.fun/badge/best-card-game-20261122-1826/Auspiciouspeony/ember-court-duel/reward.svg)](https://make.fun/bounty/best-card-game-20261122-1826?utm_source=github&utm_medium=readme&utm_campaign=best-card-game-20261122-1826)

Ember Court is an original turn-based duel card game, built for make.fun's
best-card-game-20261122-1826 bounty. You are the Ember Sovereign; across the
table sits the Cinder Warden, an AI opponent you can read and counter. Both
heroes start at 30 life. Play creatures, cast spells, and take the Warden to
zero before it takes you.

## The game

- **16 unique cards, 4 suits** — told apart by colour *and* shape, never by
  text alone: Ember (red flame), Tide (blue droplet), Thorn (green leaf),
  Gale (gold swirl). 12 creatures, 4 spells.
- **Keywords that combine** — Steam (an Ember creature gains +1 attack while
  you control a Tide creature), Mend (heal 2 when played), Leech (heal 2 on a
  kill), Swift (draw a card when played).
- **Real duel rules** — ember (mana) grows 1 per turn to 10, draw 1 per turn,
  7-card hand, 5-creature board, summoning sickness, combat both ways.
- **A readable opponent** — the Warden plays on value, saves Ember Burst for
  lethal, removes big threats, and trades up when a cheap creature can take
  down an expensive one. Hold a big Thorn wall and it wastes attackers on it;
  keep a Tide creature up and its Ember creatures hit harder — kill the Tide
  first.
- **Feel** — synthesized WebAudio sounds, deal/play/attack animations,
  floating damage numbers, screen shake, and confetti on victory. No network
  calls anywhere in the game.

## Run it

```sh
node serve.ts
```

Then open http://127.0.0.1:8080/ in a desktop browser. Click a hand card to
play it (spells that need a target ask you to pick one), click one of your
ready creatures, then click its target. Space ends your turn, M mutes, R
restarts.

## Layout

- `game/src/cards.js` — the 16-card catalogue and the seeded RNG.
- `game/src/state.js` — game state and the duel rules.
- `game/src/ai.js` — the Cinder Warden's heuristics.
- `game/src/render.js` — every pixel, drawn in code; no image files.
- `game/src/main.js` — boot, input, game loop, and the staged screenshot tables.
- `game/src/audio.js` — synthesized sounds.
- `main.ts` — the hand-in program: copies `game/` and `screenshots/` into
  `/output` and writes the dossier.
- `screenshots/` — the four entry screenshots: late-game duel, title, victory,
  defeat.

---

<sub>Entered on [make.fun](https://make.fun/?ref=wa0stw5e&utm_source=github&utm_medium=readme&utm_campaign=best-card-game-20261122-1826) · AI agents build software for cash rewards</sub>

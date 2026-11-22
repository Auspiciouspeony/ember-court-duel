// Ember Court — synthesized sound: every effect is a WebAudio oscillator, no files.
// Mute is remembered across sessions; sounds are created lazily on first user input.
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('ember-court-muted') === '1'; } catch (e) { /* private mode */ }

export function isMuted() { return muted; }

export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('ember-court-muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
  return muted;
}

function audioCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// One short tone: frequency slide, gain envelope, optional waveform.
export function tone(freq, dur, type, vol, slideTo) {
  if (muted) return;
  const ac = audioCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, ac.currentTime);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), ac.currentTime + dur);
  gain.gain.setValueAtTime(vol || 0.12, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + dur + 0.02);
}

export const sfx = {
  deal() { tone(520, 0.09, 'triangle', 0.08, 340); },
  play() { tone(330, 0.12, 'square', 0.07, 220); tone(660, 0.1, 'sine', 0.06); },
  flip() { tone(700, 0.07, 'triangle', 0.06, 900); },
  hit() { tone(160, 0.16, 'sawtooth', 0.12, 70); },
  heal() { tone(440, 0.18, 'sine', 0.09, 880); },
  draw() { tone(600, 0.08, 'triangle', 0.05, 760); },
  turn() { tone(392, 0.12, 'triangle', 0.08); tone(523, 0.14, 'triangle', 0.08); },
  error() { tone(140, 0.15, 'square', 0.07, 110); },
  win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'triangle', 0.1), i * 130)); },
  lose() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sine', 0.09), i * 150)); },
};

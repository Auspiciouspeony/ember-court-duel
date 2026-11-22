// Ember Court — take the game's screenshots with headless Chrome (no dependencies):
// for each entry of shots.json, load game/ with its query string, let the staged
// table settle, and capture 1280x720. Chrome writes PNG; a small Python step
// converts each capture to JPEG under the 256 KiB cap.
// Usage: node shot.mjs [port] — serve.ts must already be running on that port.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const port = process.argv[2] ?? '8080';
const chrome = process.env.CHROME ?? '/home/hatch/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome';
const shots = JSON.parse(readFileSync(join(here, 'shots.json'), 'utf8'));

for (const shot of shots) {
  const png = join(here, 'screenshots', shot.name.replace(/\.jpg$/, '.png'));
  const jpg = join(here, 'screenshots', shot.name);
  const url = `http://127.0.0.1:${port}/${shot.query}`;
  execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--window-size=1280,720',
      '--virtual-time-budget=12000',
      `--screenshot=${png}`,
      url,
    ],
    { stdio: 'inherit', timeout: 60000 },
  );
  // Convert to JPEG (quality 82) so the file stays under the 256 KiB cap.
  spawnSync('python3', ['-c', `
from PIL import Image
im = Image.open(${JSON.stringify(png)}).convert('RGB')
im.save(${JSON.stringify(jpg)}, 'JPEG', quality=82)
`,], { stdio: 'inherit' });
  const bytes = statSync(jpg).size;
  console.log(`${shot.name}: ${bytes} bytes${bytes > 262144 ? '  WARNING: over the 256 KiB cap' : ''}`);
}

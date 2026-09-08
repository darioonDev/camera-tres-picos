import { spawn } from 'node:child_process';
import { writeFile, rename, mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { overlayText } from './overlay-text.mjs';
const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const role = process.argv[2];
let stopped = false, child = null;
const stop = () => { stopped = true; child?.kill('SIGTERM'); setTimeout(() => { child?.kill('SIGKILL'); process.exit(0); }, 3000).unref(); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
const common = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
const video = ['-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', '25', '-g', '50', '-keyint_min', '50', '-sc_threshold', '0', '-b:v', '3000k', '-maxrate', '3000k', '-bufsize', '6000k'];
async function writeOverlay(data) {
  for (const [key, text] of Object.entries(overlayText(data))) {
    await writeFile(`/data/${key}.tmp`, text, { mode: 0o644 });
    await rename(`/data/${key}.tmp`, `/data/${key}.txt`);
  }
}
function run(args, watchdog = true) {
  return new Promise(resolve => {
    let progressAt = Date.now(), lastTime = '', buffer = '';
    child = spawn('ffmpeg', [...common, '-progress', 'pipe:1', ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    // Do not print FFmpeg stderr: it may include camera credentials or the YouTube key.
    child.stderr.on('data', () => {});
    child.stdout.on('data', data => {
      buffer += data.toString();
      const lines = buffer.split('\n'); buffer = lines.pop();
      for (const line of lines) if (line.startsWith('out_time_us=') && line !== lastTime) { lastTime = line; progressAt = Date.now(); }
    });
    const timer = setInterval(() => { if (watchdog && Date.now() - progressAt > 45000) child?.kill('SIGKILL'); }, 5000);
    child.once('error', () => { clearInterval(timer); resolve(1); });
    child.once('close', code => { clearInterval(timer); child = null; resolve(code); });
  });
}
function requiredUrl(name, protocol) {
  const raw = process.env[name];
  try { if (!raw || !protocol.includes(new URL(raw).protocol)) throw Error(); } catch { throw Error(`Configure ${name} with a valid URL before starting this worker.`); }
  return raw;
}
async function main() {
  if (role === 'prepare') {
    await mkdir('/data', { recursive: true });
    await writeOverlay(null);
    const filter = `drawtext=fontfile=${font}:text='OLHAR TRES PICOS':fontsize=44:fontcolor=white:x=(w-tw)/2:y=h/2-70,drawtext=fontfile=${font}:text='Reconectando a camera. Voltamos em instantes.':fontsize=22:fontcolor=0xc5d2c5:x=(w-tw)/2:y=h/2+10`;
    const code = await run(['-y', '-f', 'lavfi', '-i', 'color=c=0x183d35:s=1280x720:r=25', '-vf', filter, '-t', '6', ...video, '-an', '/data/offline.mp4']);
    if (code !== 0) throw Error('Could not create fallback video. Check FFmpeg/fonts installation.');
    return;
  }
  if (role === 'overlay') {
    const url = requiredUrl('WEATHER_URL', ['http:', 'https:']);
    let latest = null, nextFetch = 0;
    while (!stopped) {
      if (Date.now() >= nextFetch) {
        try { const r = await fetch(url, { signal: AbortSignal.timeout(10000) }); if (!r.ok) throw Error(); latest = await r.json(); }
        catch { latest = { ...latest, status: 'stale' }; }
        nextFetch = Date.now() + 60000;
      }
      await writeOverlay(latest);
      await delay(10000);
    }
    return;
  }
  let args;
  if (role === 'ingest') {
    const source = requiredUrl('CAMERA_RTSP_URL', ['rtsp:', 'rtsps:']);
    args = ['-rtsp_transport', 'tcp', '-timeout', '15000000', '-i', source, '-map', '0:v:0', '-an', '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1', ...video, '-f', 'rtsp', '-rtsp_transport', 'tcp', 'rtsp://media:8554/camera'];
  } else if (role === 'broadcast') {
    const destination = requiredUrl('YOUTUBE_RTMPS_URL', ['rtmps:']);
    const text = (name, x, y, size, color = 'white') => `drawtext=fontfile=${font}:textfile=/data/${name}.txt:reload=1:expansion=none:fontcolor=${color}:fontsize=${size}:x=${x}:y=${y}`;
    const filter = [
      'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1',
      'drawbox=x=30:y=30:w=465:h=66:color=0x183d35@0.88:t=fill',
      `drawtext=fontfile=${font}:text='OLHAR TRES PICOS':fontsize=28:fontcolor=white:x=50:y=49`,
      'drawbox=x=30:y=530:w=1220:h=164:color=0x183d35@0.88:t=fill',
      text('temperature', 52, 549, 46), text('metrics', 295, 554, 20), text('detail', 295, 592, 16, '0xc5d2c5'),
      text('status', 52, 659, 13, '0xd6d6b1'), text('clock', 930, 659, 14),
    ].join(',');
    args = ['-rtsp_transport', 'tcp', '-timeout', '20000000', '-i', 'rtsp://media:8554/camera', '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-map', '0:v:0', '-map', '1:a:0', '-vf', filter, ...video, '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-f', 'flv', '-rw_timeout', '20000000', destination];
  } else throw Error('Use prepare, ingest, overlay, or broadcast.');
  let backoff = 2000;
  while (!stopped) {
    const started = Date.now();
    const code = await run(args);
    if (stopped) break;
    if (Date.now() - started > 120000) backoff = 2000;
    console.log(`${role}: process stopped (code ${code ?? 'signal'}). Reconnecting in ${backoff / 1000}s.`);
    await delay(backoff); backoff = Math.min(backoff * 2, 30000);
  }
}
main().catch(error => { console.error(error.message); process.exit(1); });

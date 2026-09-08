import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWeatherService } from './weather.mjs';
import { demoData } from './demo.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const app = express();
const dev = process.argv.includes('--dev');
const stationId = process.env.WU_STATION_ID || 'INOVAF30';
const videoId = /^[A-Za-z0-9_-]{11}$/.test(process.env.YOUTUBE_VIDEO_ID || '') ? process.env.YOUTUBE_VIDEO_ID : null;
const streamUrl = (() => {
  try {
    const value = process.env.CAMERA_STREAM_URL || '';
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch { return null; }
})();
const weather = createWeatherService({
  apiKey: process.env.WU_API_KEY,
  stationId,
  publicPageUrl: process.env.WU_PAGE_URL || undefined,
  publicFallback: process.env.WU_PUBLIC_FALLBACK !== 'false',
});
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
});
app.get('/api/config', (_req, res) => res.json({ stationId, videoId, streamUrl, demoAllowed: dev || process.env.ALLOW_DEMO === 'true' }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/weather', async (req, res) => res.json(req.query.demo === '1' && (dev || process.env.ALLOW_DEMO === 'true') ? demoData() : await weather.current()));
app.get('/api/history', async (req, res) => res.json(req.query.demo === '1' && (dev || process.env.ALLOW_DEMO === 'true') ? demoData() : await weather.history()));
app.get('/api/history/30d', async (req, res) => res.json(req.query.demo === '1' && (dev || process.env.ALLOW_DEMO === 'true') ? demoData() : await weather.history30()));
app.get('/api/history/monthly', async (req, res) => {
  const { start, end } = req.query;
  if (typeof start !== 'string' || typeof end !== 'string') return res.status(400).json({ error: 'Use start e end no formato AAAA-MM-DD.' });
  try {
    return res.json(req.query.demo === '1' && (dev || process.env.ALLOW_DEMO === 'true') ? demoData() : await weather.historyRange(start, end));
  } catch {
    return res.status(400).json({ error: 'O intervalo deve ter entre 1 e 31 dias.' });
  }
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
if (dev) {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(root, 'dist'), { maxAge: '1h' }));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(root, 'dist/index.html')));
}
const server = app.listen(Number(process.env.PORT) || 3000, '0.0.0.0');
server.on('listening', () => console.log(`Olhar Três Picos · http://localhost:${process.env.PORT || 3000}`));
server.on('error', error => { console.error(`Could not start web server: ${error.code}`); process.exit(1); });

import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight, MapPin, Wind, Droplets, Thermometer, Gauge, Sun, CloudSun, CloudRain, Maximize, Eye, EyeOff, Share2, Youtube, ArrowUp, ArrowDown, ArrowUpDown, X, Check, Radio, Clock3, Info, RefreshCw, ArrowRight, Camera, Server, Router, ChevronDown, ExternalLink, List, Play, Pause, Film, Settings, Save, ShieldCheck, RotateCcw } from 'lucide-react';
import './style.css';
import WeatherIcon from './WeatherIcon.jsx';
import './weather-motion.css';

const fmt = (n, digits = 1) => typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : '—';
const time = (date, opts = {}) => new Date(date).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', ...opts });
const shortDate = date => new Date(date).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
const photoSource = 'https://commons.wikimedia.org/wiki/File:Tr%C3%AAs_Picos_ao_fundo.jpg';
const landscapeSources = [
  'https://upload.wikimedia.org/wikipedia/commons/b/b0/Tr%C3%AAs_Picos_ao_fundo.jpg',
  'https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b0/Tr%C3%AAs_Picos_ao_fundo.jpg/1920px-Tr%C3%AAs_Picos_ao_fundo.jpg',
];
const wu = 'https://www.wunderground.com/dashboard/pws/INOVAF30/';
const augustHistoryUrl = 'https://www.wunderground.com/dashboard/pws/INOVAF30/table/2026-08-8/2026-08-8/monthly';
const augustRange = { start: '2026-08-01', end: '2026-08-31', label: 'Agosto 2026' };
const demoRequested = new URLSearchParams(location.search).get('demo') === '1';
const overlayRoute = location.pathname === '/overlay';
if (overlayRoute) document.documentElement.classList.add('overlay-page');
const statusText = { loading: 'Conectando à estação', online: 'Estação atualizada', stale: 'Leitura desatualizada', unavailable: 'Estação indisponível', unconfigured: 'Estação não conectada', demo: 'Demonstração · dados ilustrativos' };
const chartMetrics = [
  { key: 'temperature', label: 'Temperatura', Icon: Thermometer },
  { key: 'feelsLike', label: 'Sensação', Icon: Thermometer },
  { key: 'humidity', label: 'Umidade', Icon: Droplets },
  { key: 'windGust', label: 'Rajadas', Icon: Wind },
  { key: 'rain', label: 'Chuva', Icon: CloudRain },
];
function AnimatedValue({ value, digits = 1, className = '', playToken = 0 }) {
  const [display, setDisplay] = useState(null);
  const previous = useRef(null);
  const previousToken = useRef(playToken);
  useEffect(() => {
    const target = typeof value === 'number' && Number.isFinite(value) ? value : null;
    if (target === null) { previous.current = null; setDisplay(null); return undefined; }
    const replay = playToken !== previousToken.current;
    previousToken.current = playToken;
    const from = replay ? 0 : typeof previous.current === 'number' && Number.isFinite(previous.current) ? previous.current : 0;
    previous.current = target;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || from === target) { setDisplay(target); return undefined; }
    setDisplay(from);
    let frame;
    const started = performance.now();
    const duration = replay ? 1200 : 850;
    const tick = nowTime => {
      const progress = Math.min(1, (nowTime - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 4);
      setDisplay(from + (target - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, playToken]);
  return <span className={`animated-number ${className}`}>{display === null ? '—' : fmt(display, digits)}</span>;
}
function ReadingCard({ type, label, value, digits, unit, detail, className }) {
  const [playToken, setPlayToken] = useState(0);
  const [hovering, setHovering] = useState(false);
  const replay = () => setPlayToken(token => token + 1);
  return <article className={`weather-card ${hovering ? 'is-counting' : ''}`} onPointerEnter={() => { setHovering(true); replay(); }} onPointerLeave={() => setHovering(false)}><div className="metric-label"><span className={`metric-icon ${className}`}><WeatherIcon type={type} /></span>{label}</div><div className="metric-value"><AnimatedValue value={value} digits={digits} playToken={playToken} /><small>{unit}</small></div><div className="metric-detail">{detail}</div></article>;
}
function HoverAnimatedValue({ value, digits = 1 }) {
  const [playToken, setPlayToken] = useState(0);
  const [hovering, setHovering] = useState(false);
  const replay = () => setPlayToken(token => token + 1);
  return <span className={`overlay-number-hit ${hovering ? 'is-counting' : ''}`} onPointerEnter={() => { setHovering(true); replay(); }} onPointerLeave={() => setHovering(false)}><AnimatedValue value={value} digits={digits} playToken={playToken} /></span>;
}

function useStation() {
  const [config, setConfig] = useState({ stationId: 'INOVAF30', videoId: null, streamUrl: null, demoAllowed: false });
  const [data, setData] = useState({ status: 'loading', observation: null });
  const [monthlyHistory, setMonthlyHistory] = useState([]);
  const [monthlyHistoryStatus, setMonthlyHistoryStatus] = useState('loading');
  const [detailedHistory, setDetailedHistory] = useState([]);
  const [detailedSummary, setDetailedSummary] = useState(null);
  const [detailedHistoryStatus, setDetailedHistoryStatus] = useState('loading');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function update() {
      const suffix = demoRequested ? '?demo=1' : '';
      const [current, month] = await Promise.allSettled([
        fetch(`/api/weather${suffix}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) }).then(r => { if (!r.ok) throw Error(); return r.json(); }),
        fetch(`/api/history/30d${suffix}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) }).then(r => { if (!r.ok) throw Error(); return r.json(); }),
      ]);
      if (!active) return;
      if (current.status === 'fulfilled') setData(current.value);
      else setData(old => ({ ...old, status: old.observation ? 'stale' : 'unavailable' }));
      if (month.status === 'fulfilled') { setMonthlyHistory(month.value.monthlyHistory || month.value.history || []); setMonthlyHistoryStatus(month.value.status); }
      else setMonthlyHistoryStatus('unavailable');
    }
    fetch('/api/config', { signal: controller.signal }).then(r => r.json()).then(c => { if (active) setConfig(c); }).catch(() => {});
    update();
    const detailQuery = new URLSearchParams({ start: augustRange.start, end: augustRange.end });
    if (demoRequested) detailQuery.set('demo', '1');
    fetch(`/api/history/monthly?${detailQuery}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) })
      .then(r => { if (!r.ok) throw Error(); return r.json(); })
      .then(value => { if (active) { setDetailedHistory(value.monthlyHistory || value.history || []); setDetailedSummary(value.summary || null); setDetailedHistoryStatus(value.status); } })
      .catch(() => { if (active) setDetailedHistoryStatus('unavailable'); });
    const poll = setInterval(update, 60_000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { active = false; controller.abort(); clearInterval(poll); clearInterval(tick); };
  }, []);
  const status = data.status === 'online' && now - Date.parse(data.observation?.observedAt) > 900000 ? 'stale' : data.status;
  return { config, ...data, status, monthlyHistory, monthlyHistoryStatus, detailedHistory, detailedSummary, detailedHistoryStatus, now };
}
function ThreePeaks({ size = 24, strokeWidth = 1.5, ...props }) {
  return <svg {...props} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m2.5 19.5 3.9-7.8 3.3 4.3 3.5-8.6 3.6 6.8 3.3-4 2.4 9.3Z" /><path d="M2.5 19.5h20" /></svg>;
}
function Brand({ small = false }) { return <div className={`brand ${small ? 'small' : ''}`}><span className="brand-icon"><ThreePeaks size={small ? 22 : 29} strokeWidth={1.5} /></span><span>olhar<span className="brand-sub">TRÊS PICOS</span></span></div>; }
function Badge({ status }) { return <span className={`status-badge ${status}`}><span className="dot" />{statusText[status]}</span>; }
function WeatherStrip({ observation: o, status, now }) {
  return <div className="weather-overlay">
    <div className="overlay-heading"><span className="overlay-place"><ThreePeaks size={18} /> TRÊS PICOS</span></div>
    <div className="overlay-readings"><div className="overlay-temperature"><CloudSun size={37} strokeWidth={1.3} /><span><HoverAnimatedValue value={o?.temperature} /> <small>°C</small></span></div><div><Wind size={19} /><strong><HoverAnimatedValue value={o?.windSpeed} /> <small>km/h</small></strong><span>Vento</span></div><div><Droplets size={19} /><strong><HoverAnimatedValue value={o?.humidity} digits={0} /><small>%</small></strong><span>Umidade</span></div><div><CloudRain size={19} /><strong><HoverAnimatedValue value={o?.rain} /> <small>mm</small></strong><span>Chuva hoje</span></div></div>
    <div className="overlay-sub">
      <span className="overlay-sub-item muted"><Thermometer size={13} /> sensação <strong>{fmt(o?.feelsLike, 0)}°</strong></span>
      <span className="overlay-sub-divider" />
      <span className="overlay-sub-item max"><ArrowUp size={12} /> máx {fmt(o?.temperatureHigh, 0)}°</span>
      <span className="overlay-sub-item min"><ArrowDown size={12} /> mín {fmt(o?.temperatureLow, 0)}°</span>
    </div>
    {status !== 'online' && <div className="overlay-warning">{statusText[status]}</div>}
  </div>;
}
function ResilientLandscape({ alt, className = 'landscape' }) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  if (failed) return <div className={`${className} landscape-fallback`} role="img" aria-label="Imagem da câmera indisponível"><div><Camera size={28} /><strong>Imagem da câmera indisponível</strong><span>Verifique a conexão da Reolink ao servidor</span></div></div>;
  return <img className={className} src={landscapeSources[sourceIndex]} alt={alt} loading="eager" decoding="async" onError={() => { if (sourceIndex < landscapeSources.length - 1) setSourceIndex(index => index + 1); else setFailed(true); }} />;
}
function CameraStream({ src, onError }) {
  const videoRef = useRef(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const isHls = /\.m3u8(?:$|\?)/i.test(src);
    let hls = null;
    let cancelled = false;
    async function attach() {
      if (isHls && !video.canPlayType('application/vnd.apple.mpegurl')) {
        const { default: Hls } = await import('hls.js');
        if (cancelled) return;
        if (!Hls.isSupported()) { onError(); return; }
        hls = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 30 });
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) onError(); });
      } else {
        video.src = src;
      }
    }
    attach().catch(() => onError());
    return () => { cancelled = true; hls?.destroy(); video.removeAttribute('src'); video.load(); };
  }, [src]);
  return <video ref={videoRef} className="camera-stream" autoPlay muted playsInline controls preload="auto" onError={onError} aria-label="Transmissão ao vivo da câmera Três Picos" />;
}
function daylightWindow(date = new Date()) {
  const yearStart = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date - yearStart) / 86400000);
  const angle = 2 * Math.PI * (dayOfYear - 81) / 364;
  const equationOfTime = 7.5 * Math.sin(2 * angle) - 5.8 * Math.cos(angle) - 1.5 * Math.sin(angle);
  const declination = 23.44 * Math.sin(2 * Math.PI * (dayOfYear - 81) / 368);
  const latitude = -22.28;
  const longitude = -42.53;
  const timezone = -3;
  const zenith = 90.833;
  const cosHourAngle = (Math.cos(zenith * Math.PI / 180) / (Math.cos(latitude * Math.PI / 180) * Math.cos(declination * Math.PI / 180))) - Math.tan(latitude * Math.PI / 180) * Math.tan(declination * Math.PI / 180);
  const hourAngle = Math.acos(Math.min(1, Math.max(-1, cosHourAngle))) * 180 / Math.PI;
  const solarNoon = 720 - 4 * longitude - equationOfTime + timezone * 60;
  const minutesToTime = minutes => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(Math.round(minutes % 60)).padStart(2, '0')}`;
  return { sunrise: solarNoon - hourAngle * 4, sunset: solarNoon + hourAngle * 4, minutesToTime };
}
function TimeLapsePanel() {
  const periods = [
    { key: 'daylight', label: 'Nascer → pôr', note: 'Luz do dia' },
    { key: '7d', label: '7 dias', note: 'Só luz do dia' },
    { key: '30d', label: '30 dias', note: 'Só luz do dia' },
  ];
  const [period, setPeriod] = useState('daylight');
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const daylight = daylightWindow();
  useEffect(() => {
    if (!playing) return undefined;
    const timer = setInterval(() => setProgress(value => value >= 100 ? 0 : value + 1.2), 80);
    return () => clearInterval(timer);
  }, [playing]);
  const currentPeriod = periods.find(item => item.key === period) || periods[0];
  const periodDays = period === '7d' ? 7 : 30;
  const daylightProgress = period === 'daylight' ? progress : progress >= 100 ? 100 : (progress * periodDays) % 100;
  const frameLabel = period === 'daylight'
    ? daylight.minutesToTime(daylight.sunrise + (daylight.sunset - daylight.sunrise) * progress / 100)
    : `${Math.max(1, Math.ceil(progress / 100 * periodDays))}º dia · ${daylight.minutesToTime(daylight.sunrise + (daylight.sunset - daylight.sunrise) * daylightProgress / 100)}`;
  return <section className="timelapse-section" id="timelapse" aria-labelledby="timelapse-title">
    <div className="section-heading timelapse-heading"><div><span className="eyebrow"><Film size={12} /> SEQUÊNCIA DA PAISAGEM</span><h2 id="timelapse-title">Time-lapse</h2><span className="section-sub">Veja a serra mudar ao longo do tempo.</span></div><span className="timelapse-status"><span className="dot amber" />Prévia da sequência</span></div>
    <div className="timelapse-layout">
      <div className="timelapse-player">
        <div className="timelapse-stage" style={{ '--timelapse-progress': `${progress}%` }}>
          <ResilientLandscape className="timelapse-landscape" alt="Paisagem dos Três Picos usada como prévia do time-lapse" />
          <div className="timelapse-shade" />
          <div className="timelapse-stage-top"><span><span className="dot" /> TIME-LAPSE DA SERRA</span><span>{currentPeriod.label}</span></div>
          <div className="timelapse-stage-copy"><span>TRÊS PICOS</span><strong>A paisagem em movimento.</strong></div>
          <span className="timelapse-frame">{frameLabel}</span>
        </div>
        <div className="timelapse-controls"><button type="button" className="timelapse-play" aria-label={playing ? 'Pausar time-lapse' : 'Reproduzir time-lapse'} onClick={() => setPlaying(value => !value)}>{playing ? <Pause size={16} /> : <Play size={16} />}</button><input aria-label="Posição do time-lapse" type="range" min="0" max="100" step="0.1" value={progress} onChange={event => setProgress(Number(event.target.value))} /><span>{Math.round(progress)}%</span></div>
      </div>
      <aside className="timelapse-info"><span className="eyebrow">ESCOLHA O INTERVALO</span><div className="timelapse-periods">{periods.map(item => <button type="button" key={item.key} className={period === item.key ? 'active' : ''} aria-pressed={period === item.key} onClick={() => { setPeriod(item.key); setProgress(0); setPlaying(false); }}><strong>{item.label}</strong><span>{item.note}</span></button>)}</div><div className="timelapse-facts"><div><span>JANELA DE CAPTURA</span><strong>{daylight.minutesToTime(daylight.sunrise)} → {daylight.minutesToTime(daylight.sunset)}</strong></div><div><span>INTERVALO</span><strong>Uma imagem a cada 1 min</strong></div><div><span>DESTINO</span><strong>Vídeo para o site e YouTube</strong></div></div><p>O time-lapse pausa durante a noite e retoma no nascer do sol, acompanhando somente a luz natural da serra.</p></aside>
    </div>
  </section>;
}
const adminDefaults = {
  stationId: 'INOVAF30',
  cameraModel: 'Reolink RLC-511WA',
  cameraIp: '192.168.0.102',
  rtspPort: '554',
  onvifPort: '8000',
  timelapseInterval: '1',
  retentionDays: '30',
  youtubeVideoId: '',
  cameraStreamUrl: '',
};
function AdminPanel({ config, status, notify, onApplyStreamUrl }) {
  const [settings, setSettings] = useState(() => {
    try { const stored = JSON.parse(localStorage.getItem('olharTresPicos.adminSettings') || '{}'); return { ...adminDefaults, ...stored, ...(stored.cameraIp === '192.168.0.13' ? { cameraIp: adminDefaults.cameraIp } : {}) }; } catch { return adminDefaults; }
  });
  const [saved, setSaved] = useState(false);
  const update = (key, value) => { setSaved(false); setSettings(current => ({ ...current, [key]: value })); };
  const save = () => { const streamUrl = settings.cameraStreamUrl.trim(); if (streamUrl && !/^https?:\/\//i.test(streamUrl)) { notify('A URL do vídeo deve começar com http:// ou https://.'); return; } const next = { ...settings, cameraStreamUrl: streamUrl }; try { localStorage.setItem('olharTresPicos.adminSettings', JSON.stringify(next)); setSettings(next); onApplyStreamUrl(streamUrl); setSaved(true); notify('Configurações administrativas salvas neste navegador.'); } catch { notify('Não foi possível salvar neste navegador.'); } };
  const reset = () => { const streamUrl = config.streamUrl || ''; setSettings({ ...adminDefaults, stationId: config.stationId || adminDefaults.stationId, youtubeVideoId: config.videoId || '', cameraStreamUrl: streamUrl }); setSaved(false); try { localStorage.removeItem('olharTresPicos.adminSettings'); } catch {} onApplyStreamUrl(streamUrl); notify('Configurações restauradas.'); };
  return <section className="admin-section" id="admin" aria-labelledby="admin-title">
    <div className="section-heading admin-heading"><div><span className="eyebrow"><Settings size={12} /> CONTROLE DO SISTEMA</span><h2 id="admin-title">Administração</h2><span className="section-sub">Configure as conexões da estação e da transmissão.</span></div><span className="admin-status"><ShieldCheck size={13} />Sessão local</span></div>
    <div className="admin-shell">
      <aside className="admin-aside"><div className="admin-aside-icon"><Settings size={19} /></div><strong>Painel do operador</strong><p>Os ajustes abaixo organizam a integração da câmera Reolink, da estação Nicetymeter e do vídeo.</p><span className="admin-connection"><span className={`dot ${status === 'online' ? '' : 'amber'}`} />{statusText[status]}</span></aside>
      <div className="admin-form"><div className="admin-form-header"><div><span className="eyebrow">CONFIGURAÇÕES</span><h3>Fontes de dados</h3></div><span className="admin-save-state">{saved ? 'Salvo agora' : 'Alterações locais'}</span></div><div className="admin-fields">
        <label><span>Estação Weather Underground</span><input value={settings.stationId} onChange={event => update('stationId', event.target.value.toUpperCase())} /></label>
        <label><span>Modelo da câmera</span><input value={settings.cameraModel} onChange={event => update('cameraModel', event.target.value)} /></label>
        <label><span>IP local da câmera</span><input value={settings.cameraIp} onChange={event => update('cameraIp', event.target.value)} inputMode="decimal" /></label>
        <label><span>Porta RTSP</span><input value={settings.rtspPort} onChange={event => update('rtspPort', event.target.value)} inputMode="numeric" /></label>
        <label><span>Porta ONVIF</span><input value={settings.onvifPort} onChange={event => update('onvifPort', event.target.value)} inputMode="numeric" /></label>
        <label><span>ID do vídeo YouTube</span><input value={settings.youtubeVideoId} onChange={event => update('youtubeVideoId', event.target.value)} placeholder="11 caracteres" /></label>
        <label className="admin-field-wide"><span>URL pública do vídeo (HLS ou MP4)</span><input value={settings.cameraStreamUrl} onChange={event => update('cameraStreamUrl', event.target.value)} placeholder="https://dominio/camera/index.m3u8" inputMode="url" /></label>
      </div><div className="admin-subsection"><div><span className="eyebrow">TIME-LAPSE</span><strong>Captura somente entre nascer e pôr do sol</strong></div><div className="admin-inline-fields"><label><span>Intervalo (minutos)</span><input value={settings.timelapseInterval} onChange={event => update('timelapseInterval', event.target.value)} inputMode="numeric" /></label><label><span>Retenção (dias)</span><input value={settings.retentionDays} onChange={event => update('retentionDays', event.target.value)} inputMode="numeric" /></label></div></div><div className="admin-actions"><button type="button" className="admin-reset" onClick={reset}><RotateCcw size={14} />Restaurar padrão</button><button type="button" className="admin-save" onClick={save}><Save size={14} />Salvar configurações</button></div><p className="admin-note">As configurações desta tela ficam salvas neste navegador. Para aplicar no VPS Hostinger, os mesmos valores devem ser definidos nas variáveis de ambiente do servidor.</p></div>
    </div>
  </section>;
}
function Chart({ history, metric, status, rangeDays = 1 }) {
  const [hover, setHover] = useState(null);
  const usable = history.filter(p => typeof p[metric] === 'number');
  if (usable.length < 2) return <div className={`chart-empty chart-empty-${metric}`}><Radio size={27} /><strong>O clima tem uma história.</strong><span>O gráfico aparecerá quando o histórico da estação estiver disponível.</span></div>;
  const values = usable.map(p => p[metric]);
  const min = Math.floor(Math.min(...values) - 1), max = Math.ceil(Math.max(...values) + 1);
  const start = Date.parse(usable[0].observedAt), end = Date.parse(usable.at(-1).observedAt);
  const points = usable.map(p => [48 + (Date.parse(p.observedAt) - start) / (end - start || 1) * 704, 162 - (p[metric] - min) / (max - min) * 138]);
  const d = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const unit = ['temperature', 'feelsLike'].includes(metric) ? '°C' : metric === 'humidity' ? '%' : metric === 'rain' ? 'mm' : 'km/h';
  const metricLabel = { temperature: 'temperatura', feelsLike: 'sensação térmica', humidity: 'umidade', windSpeed: 'vento médio', windGust: 'rajadas de vento', rain: 'chuva' }[metric] || metric;
  const label = date => rangeDays > 1 ? shortDate(date) : time(date);
  return <div className={`chart-wrap chart-wrap-${metric}`}>
    <svg viewBox="0 0 800 200" role="img" aria-label={`Histórico de ${metricLabel} nos últimos ${rangeDays} dias`} onMouseLeave={() => setHover(null)} onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); const target = start + (((e.clientX - r.left) / r.width * 800 - 48) / 704) * (end - start); setHover(usable.reduce((best, p, i) => Math.abs(Date.parse(p.observedAt) - target) < Math.abs(Date.parse(usable[best].observedAt) - target) ? i : best, 0)); }}>
      <defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#769787" stopOpacity=".25" /><stop offset="100%" stopColor="#769787" stopOpacity="0" /></linearGradient></defs>
      {[0, 1, 2, 3].map(i => <g key={i}><line x1="48" x2="752" y1={24 + i * 46} y2={24 + i * 46} stroke="#e8eae6" strokeDasharray="3 5" /><text x="0" y={28 + i * 46}>{fmt(max - (max - min) * i / 3, 0)}{unit}</text></g>)}
      <path className="chart-area" d={`${d} L752,162 L48,162 Z`} fill="url(#area)" />
      <path className="chart-line" d={d} pathLength="1" fill="none" stroke="var(--chart-accent)" strokeWidth="2.5" strokeLinejoin="round" />
      {[0, .25, .5, .75, 1].map((fraction, i) => <text key={i} x={48 + fraction * 704} y="194" textAnchor="middle">{label(start + fraction * (end - start))}</text>)}
      {hover !== null && <g><line x1={points[hover][0]} x2={points[hover][0]} y1="18" y2="162" stroke="#90a499" strokeDasharray="3 3" /><circle cx={points[hover][0]} cy={points[hover][1]} r="5" fill="#244e40" stroke="white" strokeWidth="2" /></g>}
    </svg>
    <div className="chart-caption">{hover !== null ? `${label(usable[hover].observedAt)} · ${fmt(usable[hover][metric])} ${unit}` : status === 'demo' ? 'Série ilustrativa para visualizar a interface' : status === 'stale' || status === 'unavailable' ? 'Histórico desatualizado · atualização indisponível' : `${rangeDays} dias · passe sobre o gráfico para explorar`}</div>
  </div>;
}
const summaryGroups = [
  [{ key: 'temperature', label: 'Temperatura', unit: '°C' }, { key: 'dewPoint', label: 'Ponto de orvalho', unit: '°C' }, { key: 'humidity', label: 'Umidade', unit: '%' }, { key: 'precipitation', label: 'Precipitação', unit: 'mm', digits: 2 }],
  [{ key: 'windSpeed', label: 'Velocidade do vento', unit: 'km/h' }, { key: 'windGust', label: 'Rajada de vento', unit: 'km/h' }, { key: 'windDirection', label: 'Direção do vento', unit: '' }, { key: 'pressure', label: 'Pressão', unit: 'hPa', digits: 2 }],
];
const historySortColumns = [
  { key: 'date', label: 'Data', value: row => Date.parse(row.observedAt) },
  { key: 'temperature', label: 'Média', value: row => row.temperature },
  { key: 'temperatureHigh', label: 'Máx. / mín.', value: row => row.temperatureHigh },
  { key: 'feelsLike', label: 'Sensação', value: row => row.feelsLike },
  { key: 'humidity', label: 'Umidade', value: row => row.humidity },
  { key: 'windSpeed', label: 'Vento', value: row => row.windSpeed },
  { key: 'windGust', label: 'Rajada', value: row => row.windGust },
  { key: 'rain', label: 'Chuva', value: row => row.rain },
];
function summaryValue(metric, field, summary) {
  const value = summary?.[metric.key]?.[field];
  if (value == null || value === '') return '—';
  if (typeof value === 'string') return value;
  const digits = metric.digits ?? (metric.key === 'humidity' ? 0 : 1);
  return `${fmt(value, digits)}${metric.unit ? ` ${metric.unit}` : ''}`;
}
function MonthlySummary({ summary }) {
  if (!summary) return null;
  return <section className="monthly-summary" aria-labelledby="monthly-summary-title">
    <div className="monthly-summary-heading"><div><span className="eyebrow">RESUMO DO MÊS</span><strong id="monthly-summary-title">1 a 31 de agosto de 2026</strong></div><span>Máximas, mínimas e médias</span></div>
    <div className="monthly-summary-grid">{summaryGroups.map((group, index) => <table className="monthly-summary-table" key={index}><caption>Resumo meteorológico de agosto · bloco {index + 1}</caption><thead><tr><th scope="col"></th><th scope="col">Máxima</th><th scope="col">Mínima</th><th scope="col">Média</th></tr></thead><tbody>{group.map(metric => <tr key={metric.key}><th scope="row">{metric.label}</th><td>{summaryValue(metric, 'high', summary)}</td><td>{summaryValue(metric, 'low', summary)}</td><td>{summaryValue(metric, 'average', summary)}</td></tr>)}</tbody></table>)}</div>
  </section>;
}
function DetailedHistory({ history, status, summary }) {
  const [sort, setSort] = useState({ key: 'date', direction: 'desc' });
  const sortColumn = historySortColumns.find(column => column.key === sort.key) || historySortColumns[0];
  const rows = [...history].sort((a, b) => {
    const first = sortColumn.value(a), second = sortColumn.value(b);
    if (first == null && second == null) return 0;
    if (first == null) return 1;
    if (second == null) return -1;
    const result = typeof first === 'string' ? first.localeCompare(second, 'pt-BR') : first - second;
    return sort.direction === 'asc' ? result : -result;
  });
  const changeSort = key => setSort(current => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' });
  if (status === 'loading') return <div className="history-detail-empty"><RefreshCw size={17} /><span>Carregando a tabela de agosto…</span></div>;
  if (!rows.length) return <div className="history-detail-empty"><Radio size={19} /><span>Não há dados detalhados disponíveis para este período.</span></div>;
  return <div className="history-detail-body">
    <MonthlySummary summary={summary} />
    <div className="history-detail-summary"><span><strong>{rows.length}</strong> dias observados</span><span>Temperatura, vento e precipitação</span></div>
    <div className="history-table-scroll">
      <table className="history-table">
        <caption>Detalhamento diário de {augustRange.label}</caption>
        <thead><tr>{historySortColumns.map(column => { const active = sort.key === column.key; const label = active ? `${column.label}, ordem ${sort.direction === 'asc' ? 'crescente' : 'decrescente'}` : `Ordenar por ${column.label}`; return <th key={column.key} scope="col" aria-sort={active ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button className={`history-sort ${active ? 'active' : ''}`} type="button" onClick={() => changeSort(column.key)} aria-label={label} title={label}><span>{column.label}</span><span className="history-sort-icon">{active ? sort.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : <ArrowUpDown size={12} />}</span></button></th>; })}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.observedAt}><th scope="row">{shortDate(row.observedAt)}</th><td className="history-temperature">{fmt(row.temperature)} °C</td><td>{fmt(row.temperatureHigh)} / {fmt(row.temperatureLow)} °C</td><td>{fmt(row.feelsLike)} °C</td><td>{fmt(row.humidity, 0)}%</td><td>{fmt(row.windSpeed)} km/h</td><td>{fmt(row.windGust)} km/h</td><td>{fmt(row.rain)} mm</td></tr>)}</tbody>
      </table>
    </div>
    <div className="history-detail-footer"><span>Valores diários fornecidos pelo Weather Underground.</span><a href={augustHistoryUrl} target="_blank" rel="noreferrer">Abrir tabela original <ExternalLink size={12} /></a></div>
  </div>;
}
function Modal({ name, close, station }) {
  const ref = useRef(null);
  useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} onCancel={close} onClick={e => { if (e.target === ref.current) close(); }}><button className="modal-close icon-button" aria-label="Fechar" onClick={close}><X size={21} /></button>
    {name === 'station' ? <><span className="eyebrow">UM OLHAR MAIS PERTO</span><h2>A estação e a paisagem.</h2><p>Um espaço para acompanhar a paisagem dos Três Picos e as observações da estação meteorológica INOVAF30.</p><div className="modal-facts"><div><Camera /><span>Câmera<strong>Reolink RLC-511WA</strong></span></div><div><Radio /><span>Estação<strong>Nicetymeter · INOVAF30</strong></span></div><div><Clock3 /><span>Horário das observações<strong>Brasília · UTC−3</strong></span></div></div><p>Os dados são observações de uma estação pessoal, disponibilizados pelo Weather Underground. A imagem de apresentação é ilustrativa e será substituída pela transmissão configurada.</p><p>Foto de apresentação: <a href={photoSource} target="_blank" rel="noreferrer">“Três Picos ao fundo”, Vanessa Cassano</a>, sob <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>. Exibida com recorte e ajuste de cor. Não é uma captura ao vivo.</p><a className="primary-link" href={wu} target="_blank" rel="noreferrer">Conhecer a estação no Wunderground <ExternalLink size={16} /></a></> : <><span className="eyebrow">CONEXÕES DO SISTEMA</span><h2>Cada parte, no seu lugar.</h2><div className="modal-facts"><div><Server /><span>Site e processamento<strong>VPS Hostinger · arquitetura prevista</strong></span></div><div><Router /><span>Acesso remoto à câmera<strong>VPN no roteador ou DDNS com IP público</strong></span></div><div><Radio /><span>Dados meteorológicos<strong>{statusText[station.status]}</strong></span></div><div><Youtube /><span>Transmissão<strong>{station.config.videoId ? 'Player configurado · sinal não verificado' : 'Aguardando configuração do YouTube'}</strong></span></div></div><p>O VPS processa o vídeo e sobrepõe os dados. Uma tela de espera mantém a saída de vídeo durante a reconexão da câmera. O comportamento final depende da rede e da configuração do servidor.</p></>}
  </dialog>;
}
function App() {
  const station = useStation();
  const { observation: o, status, monthlyHistory, monthlyHistoryStatus, detailedHistory, detailedSummary, detailedHistoryStatus, config, now } = station;
  const [metric, setMetric] = useState('temperature');
  const [activeSection, setActiveSection] = useState(() => location.hash.slice(1) || 'camera');
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [showOverlay, setShowOverlay] = useState(true);
  const [streamFailed, setStreamFailed] = useState(false);
  const [adminStreamUrl, setAdminStreamUrl] = useState(() => { try { return JSON.parse(localStorage.getItem('olharTresPicos.adminSettings') || '{}').cameraStreamUrl || ''; } catch { return ''; } });
  const effectiveStreamUrl = adminStreamUrl || config.streamUrl;
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const playerRef = useRef(null);
  const toastTimer = useRef(null);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    const onHashChange = () => setActiveSection(location.hash.slice(1) || 'camera');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  useEffect(() => setStreamFailed(false), [effectiveStreamUrl]);
  const notify = message => { setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 4000); };
  async function share() { try { await navigator.clipboard.writeText(location.href); notify('Link copiado. Compartilhe esse olhar!'); } catch { notify('Copie o endereço desta página para compartilhar.'); } }
  async function fullscreen() { try { if (document.fullscreenElement) await document.exitFullscreen(); else await playerRef.current.requestFullscreen(); } catch { notify('Seu navegador não permite tela cheia neste modo.'); } }
  if (overlayRoute) return <div className="broadcast-overlay"><div className="broadcast-brand"><Brand /><span>PAISAGEM & METEOROLOGIA</span></div><WeatherStrip observation={o} status={status} now={now} /></div>;
  const readings = [
    { type: 'temperature', label: 'Temperatura', value: o?.temperature, digits: 1, unit: '°C', detail: `Sensação de ${fmt(o?.feelsLike)}°C`, className: 'warm' },
    { type: 'feelsLike', label: 'Sensação térmica', value: o?.feelsLike, digits: 1, unit: '°C', detail: 'Temperatura aparente', className: 'warm' },
    { type: 'humidity', label: 'Umidade', value: o?.humidity, digits: 0, unit: '%', detail: `Ponto de orvalho ${fmt(o?.dewPoint)}°C`, className: 'blue' },
    { type: 'wind', label: 'Vento', value: o?.windSpeed, digits: 1, unit: 'km/h', detail: `Rajadas de ${fmt(o?.windGust)} km/h`, className: 'green' },
    { type: 'windGust', label: 'Rajada de vento', value: o?.windGust, digits: 1, unit: 'km/h', detail: 'Rajada registrada pela estação', className: 'green' },
    { type: 'rain', label: 'Chuva hoje', value: o?.rain, digits: 1, unit: 'mm', detail: `Intensidade ${fmt(o?.rainRate)} mm/h`, className: 'blue' },
    { type: 'pressure', label: 'Pressão', value: o?.pressure, digits: 1, unit: 'hPa', detail: 'Pressão atmosférica', className: 'violet' },
    { type: 'uv', label: 'Índice UV', value: o?.uv, digits: 0, unit: '', detail: o?.uv == null ? 'Aguardando leitura' : o.uv <= 2 ? 'Baixo' : o.uv <= 5 ? 'Moderado' : o.uv <= 7 ? 'Alto' : o.uv <= 10 ? 'Muito alto' : 'Extremo', className: 'gold' },
  ];
  return <>
    <header className="site-header"><a className="brand-link" href="/" aria-label="Olhar Três Picos, início"><Brand /></a><nav aria-label="Navegação principal"><a className={activeSection === 'camera' ? 'active' : ''} href="#camera">Câmera & clima</a><a className={activeSection === 'timelapse' ? 'active' : ''} href="#timelapse">Time-lapse</a><a className={activeSection === 'historico' ? 'active' : ''} href="#historico">Histórico</a><a className={activeSection === 'admin' ? 'active' : ''} href="#admin"><Settings size={13} />Admin</a><button onClick={() => setModal('station')}>Sobre a estação <ArrowUpRight size={14} /></button></nav><div className="header-right"><span className="local-time"><Clock3 size={14} />{time(now)}</span><span className="header-place">Três Picos, RJ</span></div></header>
    <main>
      <section className="page-heading"><div><div className="eyebrow"><span className="tiny-line" /> NATUREZA EM TEMPO REAL</div><h1>Um novo olhar para os <em>Três Picos.</em></h1><p>A paisagem muda. Acompanhe cada detalhe do tempo por aqui.</p></div><button className="share-button" onClick={share}><Share2 size={16} /> Compartilhar</button></section>
      {status === 'demo' && <div className="demo-notice"><Info size={15} /><span>Prévia da interface · imagem e dados ilustrativos. Nenhuma transmissão real conectada.</span><a href="/">Sair da prévia <ArrowRight size={14} /></a></div>}
      <section className="camera-section" id="camera" aria-label="Câmera e clima">
        <div className="camera-topline"><span><span className="camera-label-icon"><Camera size={15} /></span> Câmera Três Picos <span className="muted slash">/</span> <span className="camera-location">Nova Friburgo · RJ</span></span><span className="camera-note">{config.videoId ? 'Transmissão via YouTube' : effectiveStreamUrl && !streamFailed ? 'Transmissão direta' : 'Câmera aguardando conexão'}<span className={`dot ${config.videoId || (effectiveStreamUrl && !streamFailed) ? '' : 'amber'}`} /></span></div>
        <div className="camera-view" ref={playerRef}>
          {config.videoId ? <iframe title="Transmissão da câmera Três Picos" src={`https://www.youtube-nocookie.com/embed/${config.videoId}?autoplay=1&mute=1&playsinline=1`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen /> : effectiveStreamUrl && !streamFailed ? <CameraStream src={effectiveStreamUrl} onError={() => setStreamFailed(true)} /> : <><ResilientLandscape alt="Paisagem de montanhas usada como ilustração da interface; não é a imagem da câmera" /><div className="camera-shade" /><div className="preview-caption"><span className="preview-tag"><span className="dot" /> PRÉVIA DA CÂMERA</span><span className="image-credit">Foto ilustrativa · Três Picos</span></div><div className="landscape-caption"><span>Respire. Observe. Sinta a serra.</span><span>Um horizonte, infinitas mudanças.</span></div></>}
          {showOverlay && !config.videoId && <WeatherStrip observation={o} status={status} now={now} />}
          <div className="camera-controls"><span><span className="dot amber" />{config.videoId ? 'PLAYER YOUTUBE' : effectiveStreamUrl && !streamFailed ? 'TRANSMISSÃO DIRETA' : 'AGUARDANDO SINAL'}</span><div>{!config.videoId && <button aria-label={showOverlay ? 'Ocultar dados sobre a imagem' : 'Mostrar dados sobre a imagem'} aria-pressed={showOverlay} onClick={() => setShowOverlay(!showOverlay)}>{showOverlay ? <Eye size={18} /> : <EyeOff size={18} />}</button>}<button aria-label="Abrir câmera em tela cheia" onClick={fullscreen}><Maximize size={18} /></button></div></div>
        </div>
        <div className="camera-bottom"><span><Info size={14} />{config.videoId || (effectiveStreamUrl && !streamFailed) ? 'Os dados meteorológicos acompanham a transmissão.' : 'Uma janela para a serra, de onde você estiver.'}</span>{config.videoId ? <a href={`https://www.youtube.com/watch?v=${config.videoId}`} target="_blank" rel="noreferrer"><Youtube size={19} /> Assistir no YouTube <ArrowUpRight size={15} /></a> : effectiveStreamUrl && !streamFailed ? <a href={effectiveStreamUrl} target="_blank" rel="noreferrer"><ExternalLink size={17} /> Abrir fonte de vídeo <ArrowUpRight size={15} /></a> : <button onClick={() => notify('Configure uma URL pública de vídeo no VPS ou um ID de live do YouTube.')}><Youtube size={19} /> Configurar transmissão <ArrowUpRight size={15} /></button>}</div>
        {!config.videoId && !(effectiveStreamUrl && !streamFailed) && <div className="photo-attribution">Foto: <a href={photoSource} target="_blank" rel="noreferrer">Vanessa Cassano</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a> · recorte e ajuste de cor</div>}
      </section>
      <TimeLapsePanel />
      <section className="conditions" aria-labelledby="conditions-title"><div className="section-heading"><div><h2 id="conditions-title">O tempo, agora<span className="heading-dot">.</span></h2><span className="section-sub">Observações da estação INOVAF30</span></div><div className="reading-status"><Badge status={status} />{o?.observedAt && <span>Leitura às {time(o.observedAt)}</span>}</div></div><div className="weather-cards">{readings.map(reading => <ReadingCard {...reading} key={reading.label} />)}</div></section>
      <section className="lower-grid" id="historico"><article className={`history-panel ${detailsOpen ? 'history-panel-expanded' : ''}`}><div className="panel-header"><div><span className="eyebrow">HISTÓRICO DA ESTAÇÃO</span><h2>Os últimos 30 dias</h2><p>Resumo diário da estação INOVAF30, vindo do Weather Underground.</p></div><span className="period"><Clock3 size={13} />30 dias</span></div><div className="chart-tabs" role="tablist" aria-label="Variável meteorológica">{chartMetrics.map(({ key, label, Icon }) => <button key={key} className={`chart-tab chart-tab-${key}`} role="tab" id={`tab-${key}`} aria-controls="weather-chart" aria-selected={metric === key} onClick={() => setMetric(key)}><span className="chart-tab-icon"><Icon size={13} strokeWidth={1.8} /></span><span>{label}</span></button>)}</div><div id="weather-chart" role="tabpanel" aria-labelledby={`tab-${metric}`}><div className={`chart-stage chart-stage-${metric}`} key={metric}><Chart history={monthlyHistory} metric={metric} status={monthlyHistoryStatus} rangeDays={30} /></div></div><div className="detail-divider"><div><span className="eyebrow">VISÃO EXPANDIDA</span><strong>Detalhes diários · {augustRange.label}</strong></div><div className="detail-actions"><a href={augustHistoryUrl} target="_blank" rel="noreferrer">Fonte WU <ExternalLink size={12} /></a><button className="detail-toggle" aria-expanded={detailsOpen} aria-controls="history-detail" onClick={() => setDetailsOpen(open => !open)}><List size={14} />{detailsOpen ? 'Recolher tabela' : 'Ver tabela detalhada'}<ChevronDown size={14} /></button></div></div>{detailsOpen && <div id="history-detail"><DetailedHistory history={detailedHistory} status={detailedHistoryStatus} summary={detailedSummary} /></div>}</article>
      <article className="station-panel"><span className="eyebrow">CONECTADOS À NATUREZA</span><div className="station-mountains"><ThreePeaks size={104} strokeWidth={.65} /><Sun size={29} strokeWidth={.8} /></div><h2>Da serra, para você.</h2><p>Uma câmera, uma estação e um convite para observar a natureza com mais calma.</p><div className="station-id"><Radio size={17} /><span>Estação meteorológica<strong>INOVAF30 <span>· Nicetymeter</span></strong></span><ArrowUpRight size={18} /></div><a href={wu} target="_blank" rel="noreferrer">Explorar no Wunderground <ArrowUpRight size={15} /></a></article></section>
      <AdminPanel config={config} status={status} notify={notify} onApplyStreamUrl={setAdminStreamUrl} />
      <div className="source-note"><Info size={13} /><span>Dados de estação meteorológica pessoal. As condições podem variar em outros pontos da região.{status === 'demo' ? ' Nesta prévia, todos os valores são ilustrativos.' : ''}</span><a href={wu} target="_blank" rel="noreferrer">Fonte dos dados <ArrowUpRight size={13} /></a></div>
    </main>
    <footer><Brand small /><span>Um olhar para a natureza. Todos os dias.</span><button onClick={() => setModal('status')}><span className="dot amber" />Status das conexões <ArrowUpRight size={14} /></button><span className="copyright">© {new Date(now).getFullYear()} Olhar Três Picos</span></footer>
    {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}{modal && <Modal name={modal} close={() => setModal(null)} station={station} />}
  </>;
}

createRoot(document.getElementById('root')).render(<App />);

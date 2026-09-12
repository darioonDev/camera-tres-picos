export const STALE_MS = 15 * 60_000;
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
export function normalizeObservation(raw, stationId = 'INOVAF30', now = Date.now()) {
  if (!raw || raw.stationID !== stationId) throw new Error('Invalid station');
  const time = Date.parse(raw.obsTimeUtc);
  if (!Number.isFinite(time) || time > now + 5 * 60_000) throw new Error('Invalid observation time');
  const m = raw.metric || {};
  return {
    stationId, observedAt: new Date(time).toISOString(),
    temperature: number(m.temp), feelsLike: number(m.temp >= 27 ? m.heatIndex : m.temp <= 10 ? m.windChill : m.temp),
    temperatureHigh: number(m.tempHigh), temperatureLow: number(m.tempLow),
    humidity: number(raw.humidity), windSpeed: number(m.windSpeed), windGust: number(m.windGust),
    windDirection: number(raw.winddir), pressure: number(m.pressure),
    rain: number(m.precipTotal), rainRate: number(m.precipRate), dewPoint: number(m.dewpt),
    uv: number(raw.uv), solarRadiation: number(raw.solarRadiation),
  };
}
/** Today's high/low across the day's observations (mirrors the WU "1day" tempHigh/tempLow per interval). */
function dailyExtrema(history) {
  let low = null, high = null;
  for (const obs of history) {
    const l = obs.temperatureLow ?? obs.temperature;
    const h = obs.temperatureHigh ?? obs.temperature;
    if (typeof l === 'number' && Number.isFinite(l)) low = low == null ? l : Math.min(low, l);
    if (typeof h === 'number' && Number.isFinite(h)) high = high == null ? h : Math.max(high, h);
  }
  return { high, low };
}
export function normalizeDailySummary(raw, stationId = 'INOVAF30', now = Date.now()) {
  if (!raw || raw.stationID !== stationId) throw new Error('Invalid station');
  const time = Date.parse(raw.obsTimeUtc || raw.obsTimeLocal);
  if (!Number.isFinite(time) || time > now + 5 * 60_000) throw new Error('Invalid observation time');
  const m = raw.metric || {};
  const avgTemperature = number(m.tempAvg);
  return {
    stationId, observedAt: new Date(time).toISOString(),
    temperature: avgTemperature, temperatureHigh: number(m.tempHigh), temperatureLow: number(m.tempLow),
    feelsLike: number(m.heatindexAvg ?? m.windchillAvg ?? avgTemperature),
    humidity: number(raw.humidityAvg), humidityHigh: number(raw.humidityHigh), humidityLow: number(raw.humidityLow),
    windSpeed: number(m.windspeedAvg), windSpeedHigh: number(m.windspeedHigh), windSpeedLow: number(m.windspeedLow),
    windGust: number(m.windgustHigh ?? m.windgustAvg), windGustHigh: number(m.windgustHigh), windGustLow: number(m.windgustLow), windGustAverage: number(m.windgustAvg),
    windDirection: number(raw.winddirAvg), pressure: number((m.pressureMax ?? m.pressureMin) ?? null), pressureHigh: number(m.pressureMax), pressureLow: number(m.pressureMin),
    rain: number(m.precipTotal), rainRate: number(m.precipRate), dewPoint: number(m.dewptAvg), dewPointHigh: number(m.dewptHigh), dewPointLow: number(m.dewptLow),
    uv: number(raw.uvHigh), solarRadiation: number(raw.solarRadiationHigh),
  };
}
const finiteValues = (history, key) => history.map(item => item[key]).filter(value => typeof value === 'number' && Number.isFinite(value));
const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const extrema = (history, key, reducer) => { const values = finiteValues(history, key); return values.length ? reducer(...values) : null; };
function directionName(degrees) {
  if (typeof degrees !== 'number' || !Number.isFinite(degrees)) return null;
  return ['Norte', 'Nordeste', 'Leste', 'Sudeste', 'Sul', 'Sudoeste', 'Oeste', 'Noroeste'][Math.round(((degrees % 360) + 360) % 360 / 45) % 8];
}
export function summarizeDailyHistory(history) {
  const directionValues = finiteValues(history, 'windDirection');
  const directionAverage = average(directionValues);
  const summary = (key, highKey = key, lowKey = key) => ({ high: extrema(history, highKey, Math.max), low: extrema(history, lowKey, Math.min), average: average(finiteValues(history, key)) });
  return {
    temperature: summary('temperature', 'temperatureHigh', 'temperatureLow'),
    dewPoint: summary('dewPoint', 'dewPointHigh', 'dewPointLow'),
    humidity: summary('humidity', 'humidityHigh', 'humidityLow'),
    precipitation: { high: finiteValues(history, 'rain').reduce((sum, value) => sum + value, 0), low: null, average: null },
    windSpeed: summary('windSpeed', 'windSpeedHigh', 'windSpeedLow'),
    windGust: { high: extrema(history, 'windGustHigh', Math.max), low: finiteValues(history, 'windGustLow').some(value => value > 0) ? extrema(history, 'windGustLow', Math.min) : null, average: average(finiteValues(history, 'windGustAverage')) },
    windDirection: { high: null, low: null, average: directionName(directionAverage) },
    pressure: { high: extrema(history, 'pressureHigh', Math.max), low: extrema(history, 'pressureLow', Math.min), average: null },
  };
}
export function observationStatus(observation, now = Date.now()) {
  return now - Date.parse(observation.observedAt) > STALE_MS ? 'stale' : 'online';
}
const PUBLIC_PAGE_URL = 'https://www.wunderground.com/dashboard/pws/INOVAF30';
const PUBLIC_KEY_TTL_MS = 6 * 60 * 60_000;

export function createWeatherService({
  apiKey,
  stationId = 'INOVAF30',
  fetcher = fetch,
  clock = Date.now,
  publicPageUrl = PUBLIC_PAGE_URL,
  publicFallback = true,
}) {
  const caches = new Map();
  let discoveredKey = null;
  let discoveredUntil = 0;
  let discoveryInflight = null;

  async function resolveApiKey() {
    if (apiKey) return apiKey;
    if (!publicFallback) return null;
    if (discoveredKey && clock() < discoveredUntil) return discoveredKey;
    if (!discoveryInflight) {
      discoveryInflight = (async () => {
        try {
          const response = await fetcher(new URL(publicPageUrl), {
            signal: AbortSignal.timeout(8000),
            headers: { accept: 'text/html,application/xhtml+xml' },
          });
          if (!response.ok || typeof response.text !== 'function') return null;
          const html = await response.text();
          const match = html.match(/apiKey=([A-Za-z0-9_-]{20,})/i);
          return match?.[1] || null;
        } catch {
          return null;
        }
      })().then(key => {
        discoveredKey = key;
        discoveredUntil = clock() + (key ? PUBLIC_KEY_TTL_MS : 60_000);
        return key;
      }).finally(() => { discoveryInflight = null; });
    }
    return discoveryInflight;
  }

  async function request(kind, range) {
    const resolvedApiKey = await resolveApiKey();
    if (!resolvedApiKey) return { status: 'unconfigured', observation: null, history: [], message: 'Aguardando conexão com a estação.' };
    const cacheKey = kind === 'historyRange' ? `${kind}:${range.startDate}:${range.endDate}` : kind;
    const cache = caches.get(cacheKey) || { nextAt: 0, data: null, inflight: null };
    caches.set(cacheKey, cache);
    const refreshStatus = result => {
      if (kind === 'history30' || kind === 'historyRange') return result;
      const latest = result?.observation || result?.history?.at(-1);
      return latest && result.status === 'online' ? { ...result, status: observationStatus(latest, clock()) } : result;
    };
    if (cache.inflight) return cache.inflight;
    if (cache.data && clock() < cache.nextAt) return refreshStatus(cache.data);
    const isMonthly = kind === 'history30' || kind === 'historyRange';
    cache.inflight = (async () => {
      try {
        const endpoint = kind === 'history' ? 'observations/all/1day' : isMonthly ? 'history/daily' : 'observations/current';
        const url = new URL(`https://api.weather.com/v2/pws/${endpoint}`);
        const params = { stationId, format: 'json', units: 'm', numericPrecision: 'decimal', apiKey: resolvedApiKey };
        if (isMonthly) {
          const dateKey = date => date.toISOString().slice(0, 10).replaceAll('-', '');
          if (kind === 'historyRange') {
            params.startDate = range.startDate.replaceAll('-', '');
            params.endDate = range.endDate.replaceAll('-', '');
          } else {
            const end = new Date(clock());
            const start = new Date(clock() - 29 * 86400_000);
            params.startDate = dateKey(start);
            params.endDate = dateKey(end);
          }
        }
        url.search = new URLSearchParams(params);
        const response = await fetcher(url, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error('Weather provider unavailable');
        const body = await response.json();
        if (!Array.isArray(body.observations) || body.observations.length === 0) throw new Error('Empty observations');
        if (kind === 'history') {
          const history = body.observations.flatMap(raw => {
            try {
              const normalized = normalizeObservation({ ...raw, metric: { ...raw.metric, temp: raw.metric?.tempAvg, windSpeed: raw.metric?.windspeedAvg }, humidity: raw.humidityAvg }, stationId, clock());
              return Date.parse(normalized.observedAt) >= clock() - 86400_000 ? [normalized] : [];
            } catch { return []; }
          }).sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
          if (!history.length) throw new Error('Invalid history');
          cache.data = { status: observationStatus(history.at(-1), clock()), history };
        } else if (isMonthly) {
          const start = kind === 'historyRange' ? Date.parse(`${range.startDate}T00:00:00Z`) - 12 * 60 * 60_000 : clock() - 30 * 86400_000;
          const end = kind === 'historyRange' ? Date.parse(`${range.endDate}T00:00:00Z`) + 36 * 60 * 60_000 : Infinity;
          const history = body.observations.map(raw => {
            try { return normalizeDailySummary(raw, stationId, clock()); } catch { return null; }
          }).filter(item => item && Date.parse(item.observedAt) >= start && Date.parse(item.observedAt) <= end)
            .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
          if (!history.length) throw new Error('Invalid monthly history');
          cache.data = { status: 'online', history, summary: summarizeDailyHistory(history), rangeDays: kind === 'historyRange' ? range.days : 30, rangeStart: range?.startDate, rangeEnd: range?.endDate };
        } else {
          const observation = normalizeObservation(body.observations[0], stationId, clock());
          cache.data = { status: observationStatus(observation, clock()), observation };
        }
      } catch {
        cache.data = { ...(cache.data || { observation: null, history: [] }), status: cache.data?.observation || cache.data?.history?.length ? 'stale' : 'unavailable', message: 'Não foi possível atualizar a estação. Exibindo a última leitura disponível.' };
      } finally {
        cache.nextAt = clock() + (kind === 'history' ? 300_000 : isMonthly ? 900_000 : 60_000);
        cache.inflight = null;
      }
      return cache.data;
    })();
    return cache.inflight;
  }
  function historyRange(startDate, endDate) {
    const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value);
    const start = Date.parse(`${startDate}T00:00:00Z`);
    const end = Date.parse(`${endDate}T00:00:00Z`);
    const days = Number.isFinite(start) && Number.isFinite(end) ? Math.round((end - start) / 86400_000) + 1 : 0;
    if (!validDate(startDate) || !validDate(endDate) || days < 1 || days > 31) throw new Error('Invalid history range');
    return request('historyRange', { startDate, endDate, days });
  }
  async function current() {
    const result = await request('current');
    if (!result.observation) return result;
    const historyResult = await request('history');
    const { high, low } = dailyExtrema(historyResult.history || []);
    return { ...result, observation: { ...result.observation, temperatureHigh: high, temperatureLow: low } };
  }
  return { current, history: () => request('history'), history30: () => request('history30'), historyRange };
}

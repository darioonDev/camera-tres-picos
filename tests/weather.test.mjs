import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeObservation, normalizeDailySummary, summarizeDailyHistory, observationStatus, createWeatherService } from '../server/weather.mjs';
import { overlayText } from '../infra/overlay-text.mjs';
const now = Date.parse('2026-09-08T12:00:00Z');
const raw = { stationID: 'INOVAF30', obsTimeUtc: new Date(now).toISOString(), humidity: 82, winddir: 135, metric: { temp: 18.6, precipTotal: 0, windSpeed: 0, pressure: null } };
test('metric observations retain zero, never convert missing readings to zero', () => {
  const o = normalizeObservation(raw, 'INOVAF30', now);
  assert.equal(o.temperature, 18.6); assert.equal(o.rain, 0); assert.equal(o.windSpeed, 0); assert.equal(o.pressure, null);
});
test('rejects mismatched stations, invalid dates, and future readings', () => {
  assert.throws(() => normalizeObservation({ ...raw, stationID: 'OTHER' }, 'INOVAF30', now));
  assert.throws(() => normalizeObservation({ ...raw, obsTimeUtc: 'bad' }, 'INOVAF30', now));
  assert.throws(() => normalizeObservation({ ...raw, obsTimeUtc: new Date(now + 600000).toISOString() }, 'INOVAF30', now));
});
test('age determines stale status independently of HTTP success', () => {
  const o = normalizeObservation(raw, 'INOVAF30', now);
  assert.equal(observationStatus(o, now), 'online');
  assert.equal(observationStatus(o, now + 900001), 'stale');
});
test('server deduplicates concurrent requests and uses metric API units', async () => {
  let calls = 0;
  const service = createWeatherService({ apiKey: 'test-secret', clock: () => now, fetcher: async url => {
    calls++; assert.equal(url.searchParams.get('units'), 'm'); assert.equal(url.searchParams.get('stationId'), 'INOVAF30');
    return { ok: true, json: async () => ({ observations: [raw] }) };
  } });
  const results = await Promise.all(Array.from({ length: 15 }, () => service.current()));
  assert.equal(calls, 1); assert.equal(results[0].status, 'online'); assert.ok(!JSON.stringify(results).includes('test-secret'));
});
test('upstream outage keeps last reading explicitly stale and throttles retries', async () => {
  let current = now, fail = false, calls = 0;
  const service = createWeatherService({ apiKey: 'secret', clock: () => current, fetcher: async () => { calls++; if (fail) throw Error('failure'); return { ok: true, json: async () => ({ observations: [raw] }) }; } });
  await service.current(); current += 61000; fail = true;
  const result = await service.current();
  assert.equal(result.status, 'stale'); assert.equal(result.observation.temperature, 18.6);
  await service.current(); assert.equal(calls, 2);
});
test('missing API key returns no invented weather', async () => {
  const service = createWeatherService({ publicFallback: false, fetcher: () => { throw Error('must not call'); } });
  assert.equal((await service.current()).status, 'unconfigured'); assert.equal((await service.current()).observation, null);
});
test('public dashboard fallback discovers the key only on the server', async () => {
  let calls = 0;
  const publicKey = 'public-dashboard-key-1234567890';
  const service = createWeatherService({ clock: () => now, fetcher: async url => {
    calls++;
    if (url.hostname === 'www.wunderground.com') {
      return { ok: true, text: async () => `<script>apiKey=${publicKey}</script>` };
    }
    assert.equal(url.hostname, 'api.weather.com');
    assert.equal(url.searchParams.get('apiKey'), publicKey);
    return { ok: true, json: async () => ({ observations: [raw] }) };
  } });
  const result = await service.current();
  assert.equal(result.status, 'online');
  assert.equal(result.observation.temperature, 18.6);
  assert.equal(calls, 2);
  assert.ok(!JSON.stringify(result).includes(publicKey));
});
test('history uses aggregate metric names and excludes invalid/out-of-range data', async () => {
  const service = createWeatherService({ apiKey: 'secret', clock: () => now, fetcher: async () => ({ ok: true, json: async () => ({ observations: [{ ...raw, metric: { tempAvg: 15.5, windspeedAvg: 3 }, humidityAvg: 77 }, { ...raw, obsTimeUtc: 'invalid' }, { ...raw, obsTimeUtc: new Date(now - 90000000).toISOString() }] }) }) });
  const result = await service.history(); assert.equal(result.history.length, 1); assert.equal(result.history[0].temperature, 15.5); assert.equal(result.history[0].windSpeed, 3); assert.equal(result.history[0].humidity, 77);
});
test('30-day history requests the daily PWS range and normalizes summary extremes', async () => {
  let requested;
  const service = createWeatherService({ apiKey: 'secret', clock: () => now, fetcher: async url => {
    requested = url;
    return { ok: true, json: async () => ({ observations: [{ ...raw, metric: { tempAvg: 18, tempHigh: 24.5, tempLow: 12, windspeedAvg: 4, windgustHigh: 19, precipTotal: 2.3, pressureMax: 1018 }, humidityAvg: 74 }] }) };
  } });
  const result = await service.history30();
  assert.equal(requested.pathname, '/v2/pws/history/daily');
  assert.equal(requested.searchParams.get('startDate'), '20260810');
  assert.equal(requested.searchParams.get('endDate'), '20260908');
  assert.equal(result.rangeDays, 30);
  assert.equal(result.history[0].temperatureHigh, 24.5);
  assert.equal(result.history[0].temperatureLow, 12);
  assert.equal(result.history[0].windGust, 19);
  assert.equal(result.history[0].rain, 2.3);
  assert.equal(normalizeDailySummary({ ...raw, metric: { tempAvg: 0 }, humidityAvg: 0 }, 'INOVAF30', now).temperature, 0);
});
test('detailed monthly history accepts a bounded date range', async () => {
  let requested;
  const service = createWeatherService({ apiKey: 'secret', clock: () => now, fetcher: async url => {
    requested = url;
    return { ok: true, json: async () => ({ observations: [{ ...raw, obsTimeUtc: '2026-08-02T02:59:00Z', metric: { tempAvg: 17.2, tempHigh: 22, tempLow: 12, heatindexAvg: 17.5, windspeedAvg: 1.8, windgustHigh: 8.4, precipTotal: 2.1 }, humidityAvg: 86 }] }) };
  } });
  const result = await service.historyRange('2026-08-01', '2026-08-31');
  assert.equal(requested.searchParams.get('startDate'), '20260801');
  assert.equal(requested.searchParams.get('endDate'), '20260831');
  assert.equal(result.rangeDays, 31);
  assert.equal(result.rangeStart, '2026-08-01');
  assert.equal(result.history[0].temperatureHigh, 22);
  assert.equal(result.summary.temperature.high, 22);
  assert.equal(result.summary.temperature.low, 12);
  assert.equal(result.summary.precipitation.high, 2.1);
  assert.throws(() => service.historyRange('2026-08-01', '2026-09-02'), /Invalid history range/);
});
test('monthly summary keeps missing averages as null and names wind direction', () => {
  const summary = summarizeDailyHistory([
    { temperature: 10, temperatureHigh: 14, temperatureLow: 7, dewPoint: 8, dewPointHigh: 10, dewPointLow: 5, humidity: 80, humidityHigh: 90, humidityLow: 70, windSpeed: 2, windSpeedHigh: 5, windSpeedLow: 0, windGust: 7, windGustHigh: 7, windGustLow: 0, windGustAverage: 3, windDirection: 270, pressureHigh: 1020, pressureLow: 1008, rain: 2 },
    { temperature: 20, temperatureHigh: 25, temperatureLow: 15, dewPoint: 12, dewPointHigh: 14, dewPointLow: 9, humidity: 60, humidityHigh: 75, humidityLow: 50, windSpeed: 4, windSpeedHigh: 8, windSpeedLow: 1, windGust: 9, windGustHigh: 9, windGustLow: 1, windGustAverage: 5, windDirection: 280, pressureHigh: 1022, pressureLow: 1005, rain: 3 },
  ]);
  assert.equal(summary.temperature.average, 15);
  assert.equal(summary.precipitation.high, 5);
  assert.equal(summary.pressure.average, null);
  assert.equal(summary.windDirection.average, 'Oeste');
});
test('broadcast never presents demo, null, or stale readings as current', () => {
  const observation = normalizeObservation(raw, 'INOVAF30', now);
  assert.equal(overlayText({ status: 'demo', observation }, now).temperature, '-- °C');
  assert.match(overlayText(null, now).status, /INDISPONIVEIS/);
  assert.match(overlayText({ status: 'online', observation }, now + 900001).status, /DESATUALIZADA/);
  assert.equal(overlayText({ status: 'online', observation }, now).temperature, '18,6 °C');
});

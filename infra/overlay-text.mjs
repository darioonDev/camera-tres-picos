const value = (n, digits = 1) => typeof n === 'number' && Number.isFinite(n) ? n.toFixed(digits).replace('.', ',') : '--';
export function overlayText(data, now = Date.now()) {
  const o = data?.observation;
  const parsed = Date.parse(o?.observedAt);
  const validTime = Number.isFinite(parsed) && parsed <= now + 300000;
  const stale = !validTime || now - parsed > 900000 || data?.status !== 'online';
  // Demo values are never broadcast by the production worker.
  const usable = data?.status !== 'demo' && validTime ? o : null;
  const local = new Date(now).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return {
    temperature: `${value(usable?.temperature)} °C`,
    metrics: `VENTO  ${value(usable?.windSpeed)} km/h     UMIDADE  ${value(usable?.humidity, 0)}%     CHUVA  ${value(usable?.rain)} mm`,
    detail: `PRESSAO  ${value(usable?.pressure)} hPa     RAJADAS  ${value(usable?.windGust)} km/h`,
    clock: `${local}  |  BRASILIA`,
    status: !usable ? 'DADOS METEOROLOGICOS INDISPONIVEIS' : stale ? `ULTIMA LEITURA ${new Date(parsed).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} - DESATUALIZADA` : `INOVAF30 - LEITURA ${new Date(parsed).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}`,
  };
}

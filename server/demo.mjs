export function demoData(now = Date.now()) {
  const observation = { stationId: 'INOVAF30', observedAt: new Date(now).toISOString(), temperature: 18.6, feelsLike: 18.6, temperatureHigh: 20.5, temperatureLow: 13.9, humidity: 82, windSpeed: 6.4, windGust: 12.2, windDirection: 135, pressure: 1016.8, rain: 0.4, rainRate: 0, dewPoint: 15.5, uv: 2, solarRadiation: 184 };
  const history = Array.from({ length: 49 }, (_, index) => ({ ...observation, observedAt: new Date(now - (48 - index) * 1800_000).toISOString(), temperature: +(16.4 + Math.sin(index / 7 - 2) * 3.7 + Math.cos(index * 1.7) * .22).toFixed(1), humidity: +(80 - Math.sin(index / 7 - 2) * 11).toFixed(0), windSpeed: +(5 + Math.sin(index / 4) * 3).toFixed(1) }));
  const monthlyHistory = Array.from({ length: 30 }, (_, index) => ({ ...observation,
    observedAt: new Date(now - (29 - index) * 86400_000).toISOString(),
    temperature: +(17.1 + Math.sin(index / 4.2) * 3.8 + Math.cos(index * 1.1) * .3).toFixed(1),
    temperatureHigh: +(20.5 + Math.sin(index / 4.2) * 3.8).toFixed(1),
    temperatureLow: +(13.9 + Math.sin(index / 4.2) * 3.1).toFixed(1),
    humidity: +(76 - Math.sin(index / 4.2) * 12).toFixed(0),
    windSpeed: +(5.5 + Math.sin(index / 3) * 2.7).toFixed(1),
    windGust: +(12 + Math.abs(Math.sin(index / 2.3)) * 9).toFixed(1),
    rain: +(Math.max(0, Math.sin(index * 1.5)) * .7).toFixed(1),
  }));
  return { status: 'demo', observation, history, monthlyHistory, rangeDays: 30 };
}

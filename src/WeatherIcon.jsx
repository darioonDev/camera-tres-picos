// Separate SVG parts let each weather symbol move in a meaningful way.
export default function WeatherIcon({ type }) {
  const symbols = {
    temperature: <>
      <path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4.5 4.5 0 1 0 4 0Z" />
      <circle className="thermometer-bulb" cx="12" cy="18.5" r="1.8" fill="currentColor" stroke="none" />
      <path className="thermometer-mercury" d="M12 18V7" strokeWidth="2" />
      <path d="M16.5 6h2M16.5 9h1.5M16.5 12h2" opacity=".5" />
    </>,
    feelsLike: <>
      <path d="M9 14.5V5a2 2 0 0 0-4 0v9.5a4 4 0 1 0 4 0Z" />
      <circle className="thermometer-bulb" cx="7" cy="18" r="1.5" fill="currentColor" stroke="none" />
      <path d="M7 17V9" />
      <path className="thermal-wave thermal-wave-one" d="M14 18c3-3-3-5 0-8" />
      <path className="thermal-wave thermal-wave-two" d="M19 15c3-3-3-5 0-8" />
    </>,
    humidity: <>
      <path className="humidity-drop humidity-drop-main" d="M14.5 3.5S9 10 9 13.5a5.5 5.5 0 0 0 11 0c0-3.5-5.5-10-5.5-10Z" />
      <path className="humidity-drop humidity-drop-small" d="M5.5 9S2 13.3 2 15.5a3.5 3.5 0 0 0 5 3.16" />
      <path className="humidity-glint" d="M16.8 13a2.5 2.5 0 0 1-1.3 3.1" opacity=".55" />
    </>,
    wind: <>
      <path className="wind-stream wind-stream-top" pathLength="32" d="M3 7h11a2.5 2.5 0 1 0-2.5-2.5" />
      <path className="wind-stream wind-stream-middle" pathLength="32" d="M2 12h17a3 3 0 1 0-2.1-5.1" />
      <path className="wind-stream wind-stream-bottom" pathLength="32" d="M5 17h8a2.5 2.5 0 1 1-2.5 2.5" />
    </>,
    windGust: <>
      <path d="M5 3v19M2 22h6" />
      <g className="gust-windsock">
        <path d="M5 5c5-2 10 4 16 2v6c-6 2-11-4-16-2Z" />
        <path d="M10 5.4v6M16 7v6" opacity=".6" />
      </g>
      <path className="gust-trail" d="M11 17h8M14 20h7" opacity=".6" />
    </>,
    rain: <>
      <path className="rain-cloud" d="M6 15H5a4 4 0 0 1-.6-7.95A6 6 0 0 1 16 6a4.5 4.5 0 1 1 3.5 9H18" />
      <g className="rain-drops">
        <path className="rain-drop rain-drop-one" d="m8 14-1 4" />
        <path className="rain-drop rain-drop-two" d="m12 16-1 4" />
        <path className="rain-drop rain-drop-three" d="m16 14-1 4" />
      </g>
    </>,
    pressure: <>
      <path d="M4.2 19a9 9 0 1 1 15.6 0" />
      <path d="m6 8 1.2 1.2M12 5v1.7M18 8l-1.2 1.2M3 14h1.7M19.3 14H21" opacity=".6" />
      <path className="pressure-needle" d="m12 15 4-5" strokeWidth="1.9" />
      <circle cx="12" cy="15" r="1.3" fill="currentColor" stroke="none" />
      <path d="M8 21h8" />
    </>,
    uv: <>
      <circle className="sun-core" cx="12" cy="12" r="4" />
      <g className="sun-rays"><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></g>
    </>,
  };
  return <svg className={`weather-symbol weather-symbol-${type}`} width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{symbols[type]}</svg>;
}

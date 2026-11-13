import axios from 'axios';

const safeWebUrl = (value) => {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
};

export const mapHackerNewsArticles = (hits) =>
  hits
    .filter((hit) => hit && typeof hit.title === 'string' && hit.title.trim())
    .map((hit) => {
      const url =
        safeWebUrl(hit.url) ||
        (hit.objectID ? `https://news.ycombinator.com/item?id=${encodeURIComponent(hit.objectID)}` : null);
      if (!url) return null;
      return {
        title: hit.title.trim(),
        url,
        source: 'Hacker News',
        publishedAt: hit.created_at,
      };
    })
    .filter(Boolean);

export const mapNewsApiArticles = (articles) =>
  articles
    .filter((article) => article && typeof article.title === 'string' && article.title.trim())
    .map((article) => {
      const url = safeWebUrl(article.url);
      if (!url) return null;
      return {
        title: article.title.trim(),
        description: article.description,
        url,
        source: article.source?.name,
        publishedAt: article.publishedAt,
      };
    })
    .filter(Boolean);

export const registerThirdPartyDataRoutes = ({ app, api, handleAsync, sendError, cleanString }) => {
  app.get(
    `${api}/news`,
    handleAsync(async (req, res) => {
      if (process.env.NEWS_API_KEY) {
        const response = await axios.get('https://newsapi.org/v2/everything', {
          params: {
            q: 'startup OR entrepreneurship OR business innovation',
            language: 'en',
            sortBy: 'publishedAt',
            pageSize: 8,
            apiKey: process.env.NEWS_API_KEY,
          },
          timeout: 15000,
        });
        if (!Array.isArray(response.data?.articles)) {
          return sendError(res, 502, 'The news service returned an invalid response.');
        }
        return res.json({
          configured: true,
          provider: 'NewsAPI',
          articles: mapNewsApiArticles(response.data.articles),
        });
      }

      const response = await axios.get('https://hn.algolia.com/api/v1/search', {
        params: { query: 'startup OR entrepreneurship', tags: 'story', hitsPerPage: 8 },
        timeout: 15000,
      });
      if (!Array.isArray(response.data?.hits)) {
        return sendError(res, 502, 'The startup news service returned an invalid response.');
      }
      res.json({
        configured: true,
        provider: 'Hacker News',
        articles: mapHackerNewsArticles(response.data.hits),
      });
    })
  );

  app.get(
    `${api}/currency`,
    handleAsync(async (req, res) => {
      const base = cleanString(req.query.base, 3).toUpperCase() || 'USD';
      if (!/^[A-Z]{3}$/.test(base)) return sendError(res, 400, 'Currency code must contain three letters.');
      const targets = ['GBP', 'EUR', 'USD'].filter((currency) => currency !== base);
      const params = new URLSearchParams({ from: base, to: targets.join(',') });
      const response = await axios.get(`https://api.frankfurter.app/latest?${params.toString()}`, {
        timeout: 15000,
      });
      if (!response.data?.rates || typeof response.data.base !== 'string') {
        return sendError(res, 502, 'The currency service returned an invalid response.');
      }
      res.json(response.data);
    })
  );

  app.get(
    `${api}/weather`,
    handleAsync(async (req, res) => {
      const response = await axios.get('https://api.open-meteo.com/v1/forecast', {
        params: {
          latitude: 51.5072,
          longitude: -0.1276,
          current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
          timezone: 'Europe/London',
        },
        timeout: 15000,
      });
      const current = response.data?.current;
      if (
        !current ||
        !Number.isFinite(current.temperature_2m) ||
        !Number.isFinite(current.apparent_temperature) ||
        !Number.isFinite(current.relative_humidity_2m) ||
        !Number.isFinite(current.weather_code) ||
        !Number.isFinite(current.wind_speed_10m)
      ) {
        return sendError(res, 502, 'The weather service returned incomplete current conditions.');
      }
      const descriptions = {
        0: 'Clear sky',
        1: 'Mainly clear',
        2: 'Partly cloudy',
        3: 'Overcast',
        45: 'Fog',
        48: 'Depositing rime fog',
        51: 'Light drizzle',
        53: 'Moderate drizzle',
        55: 'Dense drizzle',
        56: 'Light freezing drizzle',
        57: 'Dense freezing drizzle',
        61: 'Slight rain',
        63: 'Moderate rain',
        65: 'Heavy rain',
        66: 'Light freezing rain',
        67: 'Heavy freezing rain',
        71: 'Slight snow fall',
        73: 'Moderate snow fall',
        75: 'Heavy snow fall',
        77: 'Snow grains',
        80: 'Slight rain showers',
        81: 'Moderate rain showers',
        82: 'Violent rain showers',
        85: 'Slight snow showers',
        86: 'Heavy snow showers',
        95: 'Thunderstorm',
        96: 'Thunderstorm with slight hail',
        99: 'Thunderstorm with heavy hail',
      };
      res.json({
        location: 'London',
        time: current.time,
        summary: descriptions[current.weather_code] || 'Current conditions',
        temperature: current.temperature_2m,
        temperatureUnit: response.data.current_units?.temperature_2m || '°C',
        feelsLike: current.apparent_temperature,
        humidity: current.relative_humidity_2m,
        windSpeed: current.wind_speed_10m,
        windSpeedUnit: response.data.current_units?.wind_speed_10m || 'km/h',
      });
    })
  );
};

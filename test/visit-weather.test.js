const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(path.resolve(__dirname, '..'), 'js', 'visit-report.js'),
  'utf8'
);

function loadWeatherHelpers() {
  const start = source.indexOf('  function weatherCodeMeta');
  const end = source.indexOf('  function weatherMetric', start);
  assert.ok(start > 0 && end > start, 'weather helper block should be present');

  const context = {};
  vm.createContext(context);
  vm.runInContext(
    source.slice(start, end) +
      '\nthis.weatherCodeMeta = weatherCodeMeta;' +
      '\nthis.visitWeatherIcon = visitWeatherIcon;' +
      '\nthis.closestVisitWeatherHour = closestVisitWeatherHour;',
    context
  );
  return context;
}

test('maps hourly WMO conditions to forecast-style day and night icons', () => {
  const helpers = loadWeatherHelpers();

  assert.deepEqual(
    JSON.parse(JSON.stringify(helpers.weatherCodeMeta(2, 1))),
    { label: 'Partly cloudy', icon: 'partly-day', tone: 'cloud' }
  );
  assert.equal(helpers.weatherCodeMeta(0, 0).icon, 'clear-night');
  assert.equal(helpers.weatherCodeMeta(61, 1).icon, 'rain');
  assert.equal(helpers.weatherCodeMeta(95, 1).label, 'Thunderstorm');

  const icon = helpers.visitWeatherIcon('partly-day');
  assert.match(icon, /visit-weather-icon__sun/);
  assert.match(icon, /visit-weather-icon__cloud/);
});

test('selects the weather hour nearest to the recorded visit time', () => {
  const helpers = loadWeatherHelpers();
  const payload = {
    hourly: {
      time: ['2026-07-19T13:00', '2026-07-19T14:00', '2026-07-19T15:00'],
      weather_code: [3, 2, 2],
      temperature_2m: [20.3, 21.1, 21.4],
      precipitation: [0, 0, 0],
      is_day: [1, 1, 1]
    }
  };

  const snapshot = helpers.closestVisitWeatherHour(payload, '2026-07-19', '14:15');
  assert.equal(snapshot.time, '2026-07-19T14:00');
  assert.equal(snapshot.visitTime, '14:15');
  assert.equal(snapshot.code, 2);
  assert.equal(snapshot.temperature, 21.1);
  assert.equal(snapshot.rainfall, 0);
});

test('uses hourly Open-Meteo conditions without wind data', () => {
  assert.match(source, /archive-api\.open-meteo\.com\/v1\/archive/);
  assert.match(source, /hourly=weather_code,temperature_2m,precipitation,is_day/);
  assert.match(source, /<strong>Weather during visit<\/strong>/);
  assert.doesNotMatch(source, /Weather at visit/);
  assert.doesNotMatch(source, /NASA POWER|WS10M|Average wind/);
});

const DummyWeatherProvider = require('./dummyWeatherProvider');

/**
 * Weather Service
 * Berfungsi sebagai gerbang utama pengambilan data cuaca.
 * Jika nantinya ingin diubah ke BMKG Provider, cukup import BMKGProvider
 * dan ubah pemanggilan fungsi di dalam fetchLatestWeather.
 */
async function fetchLatestWeather(lat, lon) {
  // Gunakan DummyWeatherProvider untuk saat ini
  return await DummyWeatherProvider.getCuacaRealtime(lat, lon);
}

module.exports = {
  fetchLatestWeather
};

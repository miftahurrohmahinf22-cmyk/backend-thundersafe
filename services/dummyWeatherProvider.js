const axios = require('axios');

/**
 * Dummy Weather Provider
 * Mengambil data cuaca real-time dari API publik (OpenWeatherMap)
 * atau mengembalikan data cuaca tiruan jika jaringan/koneksi bermasalah.
 */
async function getCuacaRealtime(lat, lon) {
  try {
    const apiKey = "b1b15e88fa797225412429c1c50c122a1"; // API Key publik untuk demo
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
    const response = await axios.get(url);
    const dataApi = response.data;
    
    return {
      suhu: Math.round(dataApi.main.temp),
      kelembapan: dataApi.main.humidity,
      kecepatan_angin: Math.round(dataApi.wind.speed * 3.6), // Konversi m/s ke km/jam
      curah_hujan: dataApi.rain ? (dataApi.rain['1h'] || dataApi.rain['3h'] || 0) : 0,
      tekanan_udara: dataApi.main.pressure,
      lokasi: dataApi.name,
      kondisi: dataApi.weather[0].main
    };
  } catch (error) {
    console.warn("DummyWeatherProvider: Gagal memanggil API luar, menggunakan data simulasi. Error:", error.message);
    return {
      suhu: 30,
      kelembapan: 82,
      kecepatan_angin: 14,
      curah_hujan: 4.8,
      tekanan_udara: 1008,
      lokasi: "Sleman, DI Yogyakarta",
      kondisi: "Clouds"
    };
  }
}

module.exports = {
  getCuacaRealtime
};

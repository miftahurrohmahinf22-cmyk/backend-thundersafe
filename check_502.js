const axios = require('axios');

async function testRenderGateway() {
  try {
    const res = await axios.get('https://backend-thundersafe.onrender.com/');
    console.log('RENDER LIVE IS ONLINE! Status:', res.status);
    console.log('Response body:', res.data);
  } catch (err) {
    console.error('RENDER LIVE STATUS:', err.response?.status || err.message);
    if (err.response?.data) console.error('Data:', err.response.data);
  }
  process.exit(0);
}

testRenderGateway();

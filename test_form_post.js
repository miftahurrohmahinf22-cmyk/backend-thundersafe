const axios = require('axios');
const jwt = require('jsonwebtoken');
const { pool, connectDB } = require('./config/db');
const { JWT_SECRET } = require('./middleware/authMiddleware');

async function testFormPost() {
  await connectDB();

  const adminRes = await pool.query('SELECT * FROM "User" WHERE role = \'admin\' LIMIT 1');
  const admin = adminRes.rows[0];

  const token = jwt.sign(
    { id: admin.id, email: admin.email, nama: admin.nama, role: admin.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  console.log('--- TEST 1: user_id = "all" ---');
  try {
    const res1 = await axios.post(
      'http://localhost:5000/api/admin/notifications',
      { user_id: 'all', judul: '[TEST ALL] Title', pesan: 'Message body' },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log('Test 1 SUCCESS:', res1.status, res1.data);
  } catch (err) {
    console.error('Test 1 FAILED:', err.response?.status, err.response?.data);
  }

  console.log('\n--- TEST 2: user_id = single user UUID ---');
  try {
    const res2 = await axios.post(
      'http://localhost:5000/api/admin/notifications',
      { user_id: admin.id, judul: '[TEST SINGLE] Title', pesan: 'Message body' },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log('Test 2 SUCCESS:', res2.status, res2.data);
  } catch (err) {
    console.error('Test 2 FAILED:', err.response?.status, err.response?.data);
  }

  process.exit(0);
}

testFormPost();

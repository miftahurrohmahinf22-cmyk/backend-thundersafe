const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');
const { seedDatabase } = require('./dbSeeder');

const DEFAULT_DB_URL = "postgresql://postgres.dbhhugrwuewbberthbxt:Miftahur123@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres";
const dbUrl = process.env.DATABASE_URL || DEFAULT_DB_URL;

const pool = new Pool({
  connectionString: dbUrl,
  ssl: {
    rejectUnauthorized: false
  }
});

const connectDB = async () => {
  try {
    await pool.query('SELECT NOW()');
    console.log('Koneksi database berhasil.');
    
    // Jalankan database seeder hanya jika di-enable via RUN_SEEDER=true
    if (process.env.RUN_SEEDER === 'true') {
      await seedDatabase(pool);
    }
  } catch (error) {
    console.error('Koneksi database gagal:', error.message);
  }
};

module.exports = {
  pool,
  connectDB
};
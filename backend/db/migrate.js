const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
  : {
      user: process.env.POSTGRES_USER || 'swarmshare',
      host: process.env.POSTGRES_HOST || 'localhost',
      database: process.env.POSTGRES_DB || 'swarmshare',
      password: process.env.POSTGRES_PASSWORD || 'password',
      port: process.env.POSTGRES_PORT || 5434,
    };

const pool = new Pool(poolConfig);

async function runMigration() {
  try {
    console.log('Connecting to database...');
    const sqlPath = path.join(__dirname, 'init.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('Executing init.sql...');
    await pool.query(sql);
    
    console.log('Database tables created successfully!');
  } catch (err) {
    console.error('Error running migration:', err);
  } finally {
    await pool.end();
  }
}

runMigration();

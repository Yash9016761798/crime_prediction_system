const { Pool } = require('pg');
const p = new Pool({ host: '127.0.0.1', port: 5432, user: 'postgres', database: 'postgres' });

(async () => {
  try {
    // Create crime_intel database if not exists
    const check = await p.query("SELECT 1 FROM pg_database WHERE datname='crime_intel'");
    if (check.rows.length === 0) {
      await p.query('CREATE DATABASE crime_intel');
      console.log('Created database: crime_intel');
    } else {
      console.log('Database crime_intel already exists');
    }
  } catch (e) {
    console.log('ERR:', e.message);
  } finally {
    await p.end();
  }
})();

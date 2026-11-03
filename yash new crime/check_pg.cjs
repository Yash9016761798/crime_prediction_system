const { Pool } = require('pg');
const p = new Pool({ host: '127.0.0.1', port: 5432, user: 'postgres', database: 'postgres' });

(async () => {
  try {
    const dbs = await p.query("SELECT datname FROM pg_database WHERE datistemplate = false");
    console.log('Databases:', dbs.rows.map(r => r.datname).join(', '));
    const ver = await p.query('SELECT version()');
    console.log('Version:', ver.rows[0].version.split(' ')[0]);
    const cur = await p.query('SELECT current_user, current_database()');
    console.log('User/DB:', cur.rows[0].current_user, '/', cur.rows[0].current_database);

    // Check if crime_intel database exists
    const ci = dbs.rows.find(r => r.datname === 'crime_intel');
    if (ci) {
      const p2 = new Pool({ host: '127.0.0.1', port: 5432, user: 'postgres', database: 'crime_intel' });
      const tables = await p2.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
      console.log('crime_intel tables:', tables.rows.map(r => r.tablename).join(', '));
      const count = await p2.query("SELECT COUNT(*)::int AS n FROM crime_records");
      console.log('crime_records count:', count.rows[0].n);
      await p2.end();
    }
  } catch (e) {
    console.log('ERR:', e.message);
  } finally {
    await p.end();
  }
})();

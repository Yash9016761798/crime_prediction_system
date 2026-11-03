#!/usr/bin/env node
const db = require('../lib/db.cjs');
const { loadCsvRecords } = require('../lib/crime-data.cjs');

const command = process.argv[2] || 'status';

async function main() {
  switch (command) {
    case 'migrate': {
      await db.migrate();
      console.log('[db] schema applied');
      break;
    }
    case 'import-csv': {
      await db.migrate();
      const records = loadCsvRecords();
      console.log(`[db] importing ${records.length} rows from the NCRB CSV...`);
      const started = Date.now();
      await db.importCrimeRecords(records);
      console.log(`[db] imported in ${Date.now() - started}ms`);
      break;
    }
    case 'status': {
      await db.migrate();
      const seeded = await db.getMeta('seeded_v1');
      const crimeRecords = await db.crimeRecordsCount();
      const tables = ['users', 'officers', 'firs', 'cases', 'crime_reports', 'sos_alerts', 'notifications', 'audit_logs', 'reports', 'settings'];
      const counts = {};
      for (const table of tables) {
        const row = await db.one(`SELECT COUNT(*)::int AS n FROM ${table}`);
        counts[table] = row.n;
      }
      console.log(JSON.stringify({ seeded: Boolean(seeded), crimeRecords, ...counts }, null, 2));
      break;
    }
    case 'reset': {
      if (process.argv[3] !== '--yes') {
        console.error('This deletes every row. Re-run with: npm run db:reset -- --yes');
        process.exit(1);
      }
      await db.migrate();
      for (const table of ['audit_logs', 'notifications', 'sos_alerts', 'crime_reports', 'cases', 'firs', 'officers', 'reports', 'settings', 'users', 'crime_records']) {
        await db.query(`TRUNCATE ${table}`);
      }
      await db.query('DELETE FROM app_meta');
      console.log('[db] all tables truncated');
      break;
    }
    default:
      console.error(`Unknown command "${command}". Use: migrate | import-csv | status | reset`);
      process.exit(1);
  }
  await db.close();
}

main().catch(error => {
  console.error('[db] failed:', error);
  process.exit(1);
});

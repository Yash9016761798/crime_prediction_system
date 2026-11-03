const fs = require('fs');
const path = require('path');

const CRIME_COLUMNS = [
  'MURDER', 'ATTEMPT TO MURDER', 'CULPABLE HOMICIDE NOT AMOUNTING TO MURDER',
  'RAPE', 'CUSTODIAL RAPE', 'OTHER RAPE',
  'KIDNAPPING & ABDUCTION', 'KIDNAPPING AND ABDUCTION OF WOMEN AND GIRLS', 'KIDNAPPING AND ABDUCTION OF OTHERS',
  'DACOITY', 'PREPARATION AND ASSEMBLY FOR DACOITY',
  'ROBBERY', 'BURGLARY', 'THEFT', 'AUTO THEFT', 'OTHER THEFT',
  'RIOTS', 'CRIMINAL BREACH OF TRUST', 'CHEATING', 'COUNTERFIETING', 'ARSON',
  'HURT/GREVIOUS HURT', 'DOWRY DEATHS',
  'ASSAULT ON WOMEN WITH INTENT TO OUTRAGE HER MODESTY', 'INSULT TO MODESTY OF WOMEN',
  'CRUELTY BY HUSBAND OR HIS RELATIVES', 'IMPORTATION OF GIRLS FROM FOREIGN COUNTRIES',
  'CAUSING DEATH BY NEGLIGENCE', 'OTHER IPC CRIMES', 'TOTAL IPC CRIMES',
];

// Columns that are roll-ups of other columns in the same CSV row. Summing them
// alongside their children double (or triple) counts incidents, so they must be
// excluded from any grand total or mutually exclusive breakdown.
const AGGREGATE_CRIME_COLUMNS = ['RAPE', 'KIDNAPPING & ABDUCTION', 'THEFT'];
const TOTAL_CRIME_COLUMN = 'TOTAL IPC CRIMES';
const NON_ADDITIVE_CRIME_COLUMNS = [TOTAL_CRIME_COLUMN, ...AGGREGATE_CRIME_COLUMNS];
const NON_ADDITIVE_CRIME_SET = new Set(NON_ADDITIVE_CRIME_COLUMNS);

/** True when a crime type may be summed without double counting. */
function isAdditiveCrimeType(crimeType) {
  return !NON_ADDITIVE_CRIME_SET.has(crimeType);
}

/** Row (or filtered) total using only additive crime types. */
function sumCounts(records) {
  return records.reduce((sum, r) => (isAdditiveCrimeType(r.crimeType) ? sum + r.count : sum), 0);
}

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Un-pivots the district-level NCRB CSV into
 * { state, district, year, crimeType, count } rows.
 */
function loadCsvRecords(csvPath) {
  const resolved = csvPath || path.join(__dirname, '..', 'dstrIPC_1 (1).csv');
  if (!fs.existsSync(resolved)) {
    console.warn(`WARNING: ${resolved} not found. Historical data will be empty.`);
    return [];
  }
  const content = fs.readFileSync(resolved, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  const headers = parseCSVLine(lines[0]);
  const stateIdx = headers.indexOf('STATE/UT');
  const districtIdx = headers.indexOf('DISTRICT');
  const yearIdx = headers.indexOf('YEAR');
  const crimeIndices = CRIME_COLUMNS.map(c => ({ name: c, idx: headers.indexOf(c) })).filter(c => c.idx !== -1);

  const records = [];
  const totals = new Map();
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    if (fields.length < 5) continue;
    const state = fields[stateIdx] || 'Unknown';
    const district = fields[districtIdx] || 'Unknown';
    const year = parseInt(fields[yearIdx], 10);
    if (Number.isNaN(year) || year < 1990 || year > 2024) continue;
    for (const crime of crimeIndices) {
      const count = parseInt(fields[crime.idx], 10);
      if (Number.isNaN(count) || count < 0) continue;
      const key = `${state}\u0000${district}\u0000${year}\u0000${crime.name}`;
      totals.set(key, (totals.get(key) || 0) + count);
    }
  }
  for (const [key, count] of totals) {
    const [state, district, year, crimeType] = key.split('\u0000');
    records.push({ state, district, year: Number(year), crimeType, count });
  }
  return records;
}

module.exports = {
  CRIME_COLUMNS,
  AGGREGATE_CRIME_COLUMNS,
  TOTAL_CRIME_COLUMN,
  NON_ADDITIVE_CRIME_COLUMNS,
  NON_ADDITIVE_CRIME_SET,
  isAdditiveCrimeType,
  sumCounts,
  parseCSVLine,
  loadCsvRecords,
};

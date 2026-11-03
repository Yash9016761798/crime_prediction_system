const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const config = require('./lib/config.cjs');
const db = require('./lib/db.cjs');
const auth = require('./lib/auth.cjs');
const { initSocketIO } = require('./lib/socketio.cjs');
const { CRIME_COLUMNS, NON_ADDITIVE_CRIME_SET, TOTAL_CRIME_COLUMN, isAdditiveCrimeType, loadCsvRecords } = require('./lib/crime-data.cjs');
const { createPersistence, replaceContents } = require('./lib/persistence.cjs');
const aiChat = require('./lib/ai-chat.cjs');

const app = express();
app.use(
  cors({
    origin: config.IS_PROD ? config.CORS_ORIGINS : true,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist'), { index: 'index.html' }));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|pdf|doc|docx|mp4|webm/;
    if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype.split('/').pop())) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 10),
  message: { message: 'Too many login attempts, try again later' },
});

const PORT = config.PORT;

// ---------------------------------------------------------------------------
// Historical crime data - PostgreSQL is the source of truth.
// The NCRB CSV is imported once (see db/schema.sql + lib/db.cjs) and then all
// analytics / heatmap / hotspot / forecast handlers read from this in-memory
// copy, which is rebuilt from the database on every boot.
// ---------------------------------------------------------------------------
let historicalData = [];
let allStates = [];
let allDistricts = [];
let allYears = [];
let allCrimeTypes = [];
let predictionDistricts = [];
let predictionCrimeTypes = [];
let modelMetrics = { modelAccuracy: 0, avgConfidence: 0 };
// Memoised summary fed to the AI chat assistant; invalidated by rebuildDerived().
let aiDigestCache = null;

/**
 * Hold-out backtest: for every district/crime-type series we forecast each
 * year from the mean of the three preceding years and compare it with the
 * published figure. `modelAccuracy` is 100 minus the mean absolute percentage
 * error, `avgConfidence` is 1 - the mean coefficient of variation.
 * Both numbers are therefore derived from the real dataset, never hardcoded.
 */
function computeModelMetrics() {
  if (historicalData.length === 0) return { modelAccuracy: 0, avgConfidence: 0 };
  const series = new Map();
  for (const row of historicalData) {
    if (row.crimeType === 'TOTAL IPC CRIMES') continue;
    if (row.district.toUpperCase().includes('TOTAL')) continue;
    const key = row.district + '|' + row.crimeType;
    let byYear = series.get(key);
    if (!byYear) {
      byYear = new Map();
      series.set(key, byYear);
    }
    byYear.set(row.year, (byYear.get(row.year) || 0) + row.count);
  }

  // Volume-weighted so tiny, noisy series cannot dominate the score.
  let weightedError = 0;
  let weight = 0;
  let confidenceSum = 0;
  let confidenceCount = 0;

  for (const byYear of series.values()) {
    const years = [...byYear.keys()].sort((a, b) => a - b);
    if (years.length < 4) continue;
    const values = years.map(y => byYear.get(y));
    const total = values.reduce((s, v) => s + v, 0);
    if (total < 50) continue;

    let localError = 0;
    let localCount = 0;
    for (let i = 3; i < values.length; i++) {
      const predicted = (values[i - 1] + values[i - 2] + values[i - 3]) / 3;
      localError += Math.abs(predicted - values[i]) / Math.max(values[i], 1);
      localCount += 1;
    }
    if (localCount) {
      weightedError += (localError / localCount) * total;
      weight += total;
    }

    const mean = total / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / values.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    confidenceSum += Math.max(0, Math.min(1, 1 - cv));
    confidenceCount += 1;
  }

  const meanError = weight > 0 ? weightedError / weight : 1;
  const avgConfidence = confidenceCount ? confidenceSum / confidenceCount : 0;
  return {
    modelAccuracy: Math.max(0, Math.min(99, Math.round((1 - meanError) * 100))),
    avgConfidence: Math.round(avgConfidence * 100),
  };
}

function rebuildDerived() {
  allStates = [...new Set(historicalData.map(r => r.state))].sort();
  // Aggregate/"TOTAL" rows are state sub-totals, not districts. They must not
  // appear in reference lists or be counted as districts.
  allDistricts = [...new Set(historicalData.map(r => r.district))]
    .filter(d => !d.toUpperCase().includes('TOTAL'))
    .sort();
  allYears = [...new Set(historicalData.map(r => r.year))].sort((a, b) => a - b);
  allCrimeTypes = [...new Set(historicalData.map(r => r.crimeType))].sort();
  predictionDistricts = [...new Set(historicalData.map(r => r.district))]
    .filter(d => !d.toUpperCase().includes('TOTAL'))
    .sort();
  predictionCrimeTypes = [...new Set(historicalData.map(r => r.crimeType))]
    .filter(t => isAdditiveCrimeType(t))
    .sort();
  modelMetrics = computeModelMetrics();
  aiDigestCache = null;
}

// Deterministic stand-in used only when the dataset has no coordinates for a
// district - never random, so the map is stable between requests and restarts.
function stableHash(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function estimatedCoords(key, base, spread) {
  const lat = base[0] + (stableHash(key + '|lat') - 0.5) * spread;
  const lng = base[1] + (stableHash(key + '|lng') - 0.5) * spread;
  return [Number(lat.toFixed(4)), Number(lng.toFixed(4))];
}

// Shared confidence metric: 1 - coefficient of variation of the series.
function seriesConfidence(values) {
  if (!values || !values.length) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / values.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
  return Math.max(0, Math.min(99, Math.round((1 - cv) * 100)));
}

// Average CPU utilisation of this process since boot (real measurement).
const CPU_START = process.cpuUsage();
const CPU_START_TIME = Date.now();
function cpuPercentUsed() {
  const delta = process.cpuUsage(CPU_START);
  const elapsedMicros = (Date.now() - CPU_START_TIME) * 1000;
  if (elapsedMicros <= 0) return 0;
  return Math.min(100, Math.round(((delta.user + delta.system) / elapsedMicros) * 100));
}

// ---------------------------------------------------------------------------
// In-memory live data (mock operational data)
// ---------------------------------------------------------------------------
const now = new Date();
const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString();
const dates = {
  createdAt: daysAgo(30), updatedAt: daysAgo(1), closedAt: daysAgo(0), registrationDate: daysAgo(365), lastLogin: daysAgo(1),
};

const officers = [
  { id: 'off1', userId: 'u2', badgeNumber: 'BN-1001', name: 'Inspector Sharma', rank: 'Inspector', district: 'Central District', phone: '9876543210', specialization: ['Cyber Crime', 'Fraud'], status: 'active', unitType: 'patrol', currentLocation: { latitude: 28.6129, longitude: 77.2295, timestamp: daysAgo(0) }, assignedFIRs: ['fir1'], assignedCases: ['case1'], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'off2', userId: 'u3', badgeNumber: 'BN-1002', name: 'Sub-Inspector Verma', rank: 'Sub-Inspector', district: 'West District', phone: '9876543211', specialization: ['Traffic', 'Patrol'], status: 'active', unitType: 'vehicle', currentLocation: { latitude: 28.7041, longitude: 77.1025, timestamp: daysAgo(0) }, assignedFIRs: [], assignedCases: [], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'off3', badgeNumber: 'BN-1003', name: 'Constable Patel', rank: 'Constable', district: 'East District', phone: '9876543212', specialization: ['Patrol'], status: 'on-leave', unitType: 'patrol', currentLocation: null, assignedFIRs: [], assignedCases: [], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'off4', badgeNumber: 'BN-1004', name: 'ASI Gupta', rank: 'Assistant Sub-Inspector', district: 'North District', phone: '9876543213', specialization: ['Investigation'], status: 'active', unitType: 'patrol', currentLocation: { latitude: 28.6517, longitude: 77.2219, timestamp: daysAgo(0) }, assignedFIRs: ['fir2'], assignedCases: ['case2'], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'off5', badgeNumber: 'BN-1005', name: 'Inspector Singh', rank: 'Inspector', district: 'South District', phone: '9876543214', specialization: ['Narcotics', 'Organized Crime'], status: 'active', unitType: 'vehicle', currentLocation: { latitude: 28.5290, longitude: 77.2200, timestamp: daysAgo(0) }, assignedFIRs: [], assignedCases: [], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'off6', badgeNumber: 'BN-1006', name: 'Head Constable Kumar', rank: 'Head Constable', district: 'Central District', phone: '9876543215', specialization: ['Patrol', 'Traffic'], status: 'active', unitType: 'patrol', currentLocation: { latitude: 28.6315, longitude: 77.2167, timestamp: daysAgo(0) }, assignedFIRs: [], assignedCases: [], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'off7', badgeNumber: 'BN-1007', name: 'ASI Reddy', rank: 'Assistant Sub-Inspector', district: 'South District', phone: '9876543216', specialization: ['Women Safety'], status: 'active', unitType: 'vehicle', currentLocation: { latitude: 28.5655, longitude: 77.2440, timestamp: daysAgo(0) }, assignedFIRs: [], assignedCases: [], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'off8', badgeNumber: 'BN-1008', name: 'Constable Nair', rank: 'Constable', district: 'West District', phone: '9876543217', specialization: ['Patrol'], status: 'active', unitType: 'patrol', currentLocation: { latitude: 28.5921, longitude: 77.0467, timestamp: daysAgo(0) }, assignedFIRs: [], assignedCases: [], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'off9', badgeNumber: 'BN-1009', name: 'Inspector Mehta', rank: 'Inspector', district: 'North District', phone: '9876543218', specialization: ['Crime Branch', 'Investigation'], status: 'inactive', unitType: 'vehicle', currentLocation: null, assignedFIRs: [], assignedCases: [], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'off10', badgeNumber: 'BN-1010', name: 'Sub-Inspector Das', rank: 'Sub-Inspector', district: 'East District', phone: '9876543219', specialization: ['Traffic', 'Patrol'], status: 'active', unitType: 'patrol', currentLocation: { latitude: 28.6600, longitude: 77.2800, timestamp: daysAgo(0) }, assignedFIRs: [], assignedCases: [], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'off11', badgeNumber: 'BN-1011', name: 'Inspector Rawat', rank: 'Inspector', district: 'Central District', phone: '9876543220', specialization: ['Investigation', 'Crime Branch'], status: 'active', unitType: 'vehicle', currentLocation: { latitude: 28.6200, longitude: 77.2150, timestamp: daysAgo(0) }, assignedFIRs: ['fir3'], assignedCases: ['case3'], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'off12', badgeNumber: 'BN-1012', name: 'Constable Devi', rank: 'Constable', district: 'South District', phone: '9876543221', specialization: ['Women Safety', 'Patrol'], status: 'active', unitType: 'patrol', currentLocation: { latitude: 28.5400, longitude: 77.2350, timestamp: daysAgo(0) }, assignedFIRs: [], assignedCases: [], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'off13', badgeNumber: 'BN-1013', name: 'Sub-Inspector Yadav', rank: 'Sub-Inspector', district: 'North District', phone: '9876543222', specialization: ['Narcotics'], status: 'training', unitType: 'patrol', currentLocation: null, assignedFIRs: [], assignedCases: [], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'off14', badgeNumber: 'BN-1014', name: 'ASI Fernando', rank: 'Assistant Sub-Inspector', district: 'West District', phone: '9876543223', specialization: ['Fraud', 'Investigation'], status: 'active', unitType: 'vehicle', currentLocation: { latitude: 28.6800, longitude: 77.0900, timestamp: daysAgo(0) }, assignedFIRs: ['fir4'], assignedCases: [], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'off15', badgeNumber: 'BN-1015', name: 'Head Constable Mishra', rank: 'Head Constable', district: 'East District', phone: '9876543224', specialization: ['Traffic', 'Patrol'], status: 'active', unitType: 'motorcycle', currentLocation: { latitude: 28.6400, longitude: 77.2700, timestamp: daysAgo(0) }, assignedFIRs: [], assignedCases: [], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'off16', badgeNumber: 'BN-1016', name: 'Constable Khan', rank: 'Constable', district: 'Central District', phone: '9876543225', specialization: ['Patrol'], status: 'active', unitType: 'patrol', currentLocation: { latitude: 28.6150, longitude: 77.2300, timestamp: daysAgo(0) }, assignedFIRs: [], assignedCases: [], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'off17', badgeNumber: 'BN-1017', name: 'Inspector Chauhan', rank: 'Inspector', district: 'South District', phone: '9876543226', specialization: ['Cyber Crime', 'Investigation'], status: 'active', unitType: 'vehicle', currentLocation: { latitude: 28.5350, longitude: 77.2100, timestamp: daysAgo(0) }, assignedFIRs: ['fir5'], assignedCases: ['case4', 'case5'], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'off18', badgeNumber: 'BN-1018', name: 'Sub-Inspector Bose', rank: 'Sub-Inspector', district: 'North District', phone: '9876543227', specialization: ['Women Safety', 'Investigation'], status: 'active', unitType: 'patrol', currentLocation: { latitude: 28.6650, longitude: 77.2300, timestamp: daysAgo(0) }, assignedFIRs: [], assignedCases: ['case6'], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'off19', badgeNumber: 'BN-1019', name: 'Constable Rao', rank: 'Constable', district: 'West District', phone: '9876543228', specialization: ['Patrol', 'Traffic'], status: 'suspended', unitType: 'patrol', currentLocation: null, assignedFIRs: [], assignedCases: [], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'off20', badgeNumber: 'BN-1020', name: 'ASI Menon', rank: 'Assistant Sub-Inspector', district: 'East District', phone: '9876543229', specialization: ['Crime Branch'], status: 'active', unitType: 'vehicle', currentLocation: { latitude: 28.6500, longitude: 77.2650, timestamp: daysAgo(0) }, assignedFIRs: [], assignedCases: [], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'off21', badgeNumber: 'BN-1021', name: 'Head Constable Joshi', rank: 'Head Constable', district: 'South District', phone: '9876543230', specialization: ['Patrol'], status: 'active', unitType: 'patrol', currentLocation: { latitude: 28.5500, longitude: 77.2250, timestamp: daysAgo(0) }, assignedFIRs: [], assignedCases: [], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'off22', badgeNumber: 'BN-1022', name: 'Inspector Nair', rank: 'Inspector', district: 'North District', phone: '9876543231', specialization: ['Narcotics', 'Organized Crime'], status: 'active', unitType: 'vehicle', currentLocation: { latitude: 28.6700, longitude: 77.2350, timestamp: daysAgo(0) }, assignedFIRs: ['fir6'], assignedCases: ['case7'], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'off23', badgeNumber: 'BN-1023', name: 'Constable Singh R.', rank: 'Constable', district: 'Central District', phone: '9876543232', specialization: ['Patrol', 'Traffic'], status: 'active', unitType: 'motorcycle', currentLocation: { latitude: 28.6180, longitude: 77.2220, timestamp: daysAgo(0) }, assignedFIRs: [], assignedCases: [], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'off24', badgeNumber: 'BN-1024', name: 'Sub-Inspector Kaur', rank: 'Sub-Inspector', district: 'West District', phone: '9876543233', specialization: ['Cyber Crime', 'Fraud'], status: 'active', unitType: 'patrol', currentLocation: { latitude: 28.6950, longitude: 77.0950, timestamp: daysAgo(0) }, assignedFIRs: ['fir7'], assignedCases: [], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'off25', badgeNumber: 'BN-1025', name: 'ASI Thakur', rank: 'Assistant Sub-Inspector', district: 'South District', phone: '9876543234', specialization: ['Investigation', 'Women Safety'], status: 'on-leave', unitType: 'patrol', currentLocation: null, assignedFIRs: [], assignedCases: [], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'off26', badgeNumber: 'BN-1026', name: 'Head Constable Pillai', rank: 'Head Constable', district: 'East District', phone: '9876543235', specialization: ['Traffic'], status: 'active', unitType: 'vehicle', currentLocation: { latitude: 28.6450, longitude: 77.2750, timestamp: daysAgo(0) }, assignedFIRs: [], assignedCases: [], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'off27', badgeNumber: 'BN-1027', name: 'Constable Iyer', rank: 'Constable', district: 'North District', phone: '9876543236', specialization: ['Patrol'], status: 'training', unitType: 'patrol', currentLocation: null, assignedFIRs: [], assignedCases: [], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'off28', badgeNumber: 'BN-1028', name: 'Inspector Dutta', rank: 'Inspector', district: 'West District', phone: '9876543237', specialization: ['Crime Branch', 'Narcotics'], status: 'active', unitType: 'vehicle', currentLocation: { latitude: 28.7000, longitude: 77.1000, timestamp: daysAgo(0) }, assignedFIRs: ['fir8'], assignedCases: ['case8'], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'off29', badgeNumber: 'BN-1029', name: 'Sub-Inspector Sen', rank: 'Sub-Inspector', district: 'East District', phone: '9876543238', specialization: ['Fraud', 'Cyber Crime'], status: 'active', unitType: 'patrol', currentLocation: { latitude: 28.6550, longitude: 77.2850, timestamp: daysAgo(0) }, assignedFIRs: [], assignedCases: [], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'off30', badgeNumber: 'BN-1030', name: 'Constable Ghosh', rank: 'Constable', district: 'South District', phone: '9876543239', specialization: ['Patrol', 'Women Safety'], status: 'active', unitType: 'patrol', currentLocation: { latitude: 28.5450, longitude: 77.2150, timestamp: daysAgo(0) }, assignedFIRs: [], assignedCases: [], createdAt: dates.createdAt, updatedAt: dates.updatedAt },
];

const users = [
  { id: 'u1', name: 'Admin User', email: 'admin@police.gov.in', phone: '9999999999', address: 'Police Headquarters, Delhi', role: 'admin', status: 'active', registrationDate: dates.registrationDate, lastLogin: daysAgo(0), createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'u2', name: 'Officer User', email: 'officer@police.gov.in', phone: '9999999998', address: 'Police Station, Central', role: 'officer', status: 'active', registrationDate: dates.registrationDate, lastLogin: daysAgo(1), createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'u3', name: 'Rahul Verma', email: 'rahul@example.com', phone: '9999999997', address: '123, Street Name, Delhi', role: 'citizen', status: 'active', registrationDate: dates.registrationDate, lastLogin: daysAgo(5), createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'u4', name: 'Priya Singh', email: 'priya@example.com', phone: '9999999996', address: '456, Avenue Road, Delhi', role: 'citizen', status: 'active', registrationDate: daysAgo(200), lastLogin: daysAgo(10), createdAt: daysAgo(200), updatedAt: dates.updatedAt },
  { id: 'u5', name: 'Amit Kumar', email: 'amit@example.com', phone: '9999999995', address: '789, Lane, Delhi', role: 'citizen', status: 'suspended', registrationDate: daysAgo(150), lastLogin: daysAgo(60), createdAt: daysAgo(150), updatedAt: dates.updatedAt },
  { id: 'u6', name: 'Super Admin', email: 'super@police.gov.in', phone: '9999999994', address: 'HQ, Delhi', role: 'super_admin', status: 'active', registrationDate: dates.registrationDate, lastLogin: daysAgo(0), createdAt: dates.createdAt, updatedAt: dates.updatedAt },
  { id: 'u7', name: 'Viewer User', email: 'viewer@police.gov.in', phone: '9999999993', address: 'Viewer Office', role: 'viewer', status: 'active', registrationDate: daysAgo(90), lastLogin: daysAgo(3), createdAt: daysAgo(90), updatedAt: dates.updatedAt },
  { id: 'u8', name: 'Dr. Meera Sharma', email: 'meera@police.gov.in', phone: '9999999992', address: 'Forensics Lab, South Delhi', role: 'officer', status: 'active', registrationDate: daysAgo(300), lastLogin: daysAgo(0), createdAt: daysAgo(300), updatedAt: dates.updatedAt },
  { id: 'u9', name: 'Ravi Shankar', email: 'ravi@citizen.com', phone: '9999999991', address: '22, Park Street, Mumbai', role: 'citizen', status: 'active', registrationDate: daysAgo(120), lastLogin: daysAgo(7), createdAt: daysAgo(120), updatedAt: dates.updatedAt },
  { id: 'u10', name: 'Inspector Neeraj', email: 'neeraj@police.gov.in', phone: '9999999990', address: 'North District PS', role: 'officer', status: 'active', registrationDate: daysAgo(250), lastLogin: daysAgo(0), createdAt: daysAgo(250), updatedAt: dates.updatedAt },
  { id: 'u11', name: 'Sunita Devi', email: 'sunita@citizen.com', phone: '9999999989', address: '56, Civil Lines, Jaipur', role: 'citizen', status: 'inactive', registrationDate: daysAgo(400), lastLogin: daysAgo(180), createdAt: daysAgo(400), updatedAt: dates.updatedAt },
  { id: 'u12', name: 'Deepak Verma', email: 'deepak@police.gov.in', phone: '9999999988', address: 'West District PS', role: 'admin', status: 'active', registrationDate: daysAgo(180), lastLogin: daysAgo(1), createdAt: daysAgo(180), updatedAt: dates.updatedAt },
  { id: 'u13', name: 'Anita Roy', email: 'anita@example.com', phone: '9999999987', address: '78, Salt Lake, Kolkata', role: 'citizen', status: 'pending', registrationDate: daysAgo(5), lastLogin: null, createdAt: daysAgo(5), updatedAt: dates.updatedAt },
  { id: 'u14', name: 'Vikram Joshi', email: 'vikram@police.gov.in', phone: '9999999986', address: 'East District PS', role: 'officer', status: 'active', registrationDate: daysAgo(160), lastLogin: daysAgo(2), createdAt: daysAgo(160), updatedAt: dates.updatedAt },
  { id: 'u15', name: 'Neha Gupta', email: 'neha@viewer.gov.in', phone: '9999999985', address: 'Analytics Division, Delhi', role: 'viewer', status: 'active', registrationDate: daysAgo(60), lastLogin: daysAgo(1), createdAt: daysAgo(60), updatedAt: dates.updatedAt },
  { id: 'u16', name: 'Rajesh Khanna', email: 'rajesh@citizen.com', phone: '9999999984', address: '34, MG Road, Bangalore', role: 'citizen', status: 'suspended', registrationDate: daysAgo(90), lastLogin: daysAgo(45), createdAt: daysAgo(90), updatedAt: dates.updatedAt },
  { id: 'u17', name: 'Alok Singh', email: 'alok@police.gov.in', phone: '9999999983', address: 'South District PS', role: 'officer', status: 'training', registrationDate: daysAgo(30), lastLogin: null, createdAt: daysAgo(30), updatedAt: dates.updatedAt },
  { id: 'u18', name: 'Pooja Reddy', email: 'pooja@police.gov.in', phone: '9999999982', address: 'Cyber Cell, Delhi', role: 'admin', status: 'active', registrationDate: daysAgo(220), lastLogin: daysAgo(0), createdAt: daysAgo(220), updatedAt: dates.updatedAt },
];

const firs = [
  { id: 'fir1', firNumber: 'FIR-2024-001', crimeType: 'Theft', severity: 'medium', priority: 'medium', incidentDate: daysAgo(10), location: 'Chandni Chowk, Delhi', latitude: 28.6562, longitude: 77.2300, district: 'Central District', state: 'Delhi', city: 'Delhi', policeStation: 'Chandni Chowk PS', complainantName: 'Rahul Verma', complainantPhone: '9876543210', complainantEmail: 'rahul@example.com', victims: [{ name: 'Rahul Verma', age: 28, gender: 'Male' }], suspects: [{ name: 'Unknown', description: 'Two men on motorcycle' }], witnesses: [{ name: 'Suresh', contact: '9876543220' }], description: 'Stolen motorcycle from parking lot.', status: 'investigation', assignedOfficerId: 'off1', assignedOfficer: officers[0], createdBy: 'u1', closureReason: null, resolutionNotes: null, createdAt: daysAgo(9), updatedAt: daysAgo(1), closedAt: null },
  { id: 'fir2', firNumber: 'FIR-2024-002', crimeType: 'Burglary', severity: 'high', priority: 'high', incidentDate: daysAgo(15), location: 'Connaught Place, Delhi', latitude: 28.6315, longitude: 77.2167, district: 'Central District', state: 'Delhi', city: 'Delhi', policeStation: 'Connaught Place PS', complainantName: 'Priya Singh', complainantPhone: '9876543211', complainantEmail: 'priya@example.com', victims: [{ name: 'Priya Singh', age: 34, gender: 'Female' }], suspects: [], witnesses: [], description: 'Office break-in overnight.', status: 'investigation', assignedOfficerId: 'off4', assignedOfficer: officers[3], createdBy: 'u1', closureReason: null, resolutionNotes: null, createdAt: daysAgo(14), updatedAt: daysAgo(2), closedAt: null },
  { id: 'fir3', firNumber: 'FIR-2024-003', crimeType: 'Assault', severity: 'high', priority: 'critical', incidentDate: daysAgo(5), location: 'Karol Bagh, Delhi', latitude: 28.6520, longitude: 77.1900, district: 'Central District', state: 'Delhi', city: 'Delhi', policeStation: 'Karol Bagh PS', complainantName: 'Amit Kumar', complainantPhone: '9876543212', complainantEmail: 'amit@example.com', victims: [{ name: 'Amit Kumar', age: 45, gender: 'Male' }], suspects: [{ name: 'Unknown', description: 'Male, 6ft tall' }], witnesses: [], description: 'Physical assault reported.', status: 'pending', assignedOfficerId: null, assignedOfficer: null, createdBy: 'u3', closureReason: null, resolutionNotes: null, createdAt: daysAgo(5), updatedAt: daysAgo(5), closedAt: null },
  { id: 'fir4', firNumber: 'FIR-2024-004', crimeType: 'Cybercrime', severity: 'medium', priority: 'medium', incidentDate: daysAgo(20), location: 'Dwarka, Delhi', latitude: 28.5921, longitude: 77.0467, district: 'West District', state: 'Delhi', city: 'Delhi', policeStation: 'Dwarka PS', complainantName: 'Neha Gupta', complainantPhone: '9876543213', complainantEmail: 'neha@example.com', victims: [{ name: 'Neha Gupta', age: 30, gender: 'Female' }], suspects: [], witnesses: [], description: 'Online fraud of 50000.', status: 'solved', assignedOfficerId: 'off1', assignedOfficer: officers[0], createdBy: 'u1', closureReason: 'Suspect apprehended', resolutionNotes: 'Recovered partial amount', createdAt: daysAgo(19), updatedAt: daysAgo(3), closedAt: daysAgo(2) },
  { id: 'fir5', firNumber: 'FIR-2024-005', crimeType: 'Theft', severity: 'low', priority: 'low', incidentDate: daysAgo(25), location: 'Lajpat Nagar, Delhi', latitude: 28.5655, longitude: 77.2440, district: 'South District', state: 'Delhi', city: 'Delhi', policeStation: 'Lajpat Nagar PS', complainantName: 'Rajesh Kumar', complainantPhone: '9876543214', complainantEmail: 'rajesh@example.com', victims: [{ name: 'Rajesh Kumar', age: 22, gender: 'Male' }], suspects: [], witnesses: [], description: 'Mobile phone snatched.', status: 'closed', assignedOfficerId: null, assignedOfficer: null, createdBy: 'u1', closureReason: 'Unable to identify suspect', resolutionNotes: 'Case filed for future reference', createdAt: daysAgo(24), updatedAt: daysAgo(10), closedAt: daysAgo(10) },
  { id: 'fir6', firNumber: 'FIR-2024-006', crimeType: 'Robbery', severity: 'critical', priority: 'critical', incidentDate: daysAgo(3), location: 'Model Town, Delhi', latitude: 28.7060, longitude: 77.1830, district: 'North District', state: 'Delhi', city: 'Delhi', policeStation: 'Model Town PS', complainantName: 'Sunil Mehta', complainantPhone: '9876543215', complainantEmail: 'sunil@example.com', victims: [{ name: 'Sunil Mehta', age: 55, gender: 'Male' }], suspects: [{ name: 'Unknown', description: 'Armed, masked' }], witnesses: [{ name: 'Ravi', contact: '9876543221', statement: 'Saw two men running from store' }], description: 'Armed robbery at a convenience store.', status: 'investigation', assignedOfficerId: 'off4', assignedOfficer: officers[3], createdBy: 'u1', closureReason: null, resolutionNotes: null, createdAt: daysAgo(3), updatedAt: daysAgo(1), closedAt: null },
  { id: 'fir7', firNumber: 'FIR-2024-007', crimeType: 'Domestic Violence', severity: 'high', priority: 'high', incidentDate: daysAgo(12), location: 'Saket, Delhi', latitude: 28.5290, longitude: 77.2200, district: 'South District', state: 'Delhi', city: 'Delhi', policeStation: 'Saket PS', complainantName: 'Anita Sharma', complainantPhone: '9876543216', complainantEmail: 'anita@example.com', victims: [{ name: 'Anita Sharma', age: 32, gender: 'Female' }], suspects: [{ name: 'Vikram Sharma', description: 'Husband' }], witnesses: [], description: 'Domestic violence complaint.', status: 'pending', assignedOfficerId: null, assignedOfficer: null, createdBy: 'u4', closureReason: null, resolutionNotes: null, createdAt: daysAgo(12), updatedAt: daysAgo(12), closedAt: null },
  { id: 'fir8', firNumber: 'FIR-2024-008', crimeType: 'Burglary', severity: 'medium', priority: 'medium', incidentDate: daysAgo(7), location: 'Patel Nagar, Delhi', latitude: 28.6600, longitude: 77.1700, district: 'Central District', state: 'Delhi', city: 'Delhi', policeStation: 'Patel Nagar PS', complainantName: 'Vijay Singh', complainantPhone: '9876543217', complainantEmail: 'vijay@example.com', victims: [{ name: 'Vijay Singh', age: 48, gender: 'Male' }], suspects: [], witnesses: [], description: 'House burglary, jewellery stolen.', status: 'investigation', assignedOfficerId: 'off1', assignedOfficer: officers[0], createdBy: 'u1', closureReason: null, resolutionNotes: null, createdAt: daysAgo(7), updatedAt: daysAgo(1), closedAt: null },
];

const cases = [
  {
    id: 'case1', caseNumber: 'CASE-2024-001', name: 'Central Theft Investigation', description: 'Investigating motorcycle theft ring operating across Central Delhi. Multiple victims reported stolen two-wheelers from parking lots near metro stations.', priority: 'high', category: 'Property Crime', crimeType: 'Theft', crimeLocation: 'Multiple locations, Central District', policeStation: 'Chandni Chowk PS', district: 'Central District', state: 'Delhi',
    status: 'active', leadOfficerId: 'off1', leadOfficer: officers[0],
    linkedFIRs: [firs[0], firs[7]], linkedFIRId: 'fir1',
    assignedOfficers: [officers[0], officers[3]], supportingOfficerIds: ['off4'],
    investigationStartDate: daysAgo(8), expectedCompletionDate: daysAgo(-22),
    suspects: [{ name: 'Unknown', alias: 'Bike Gang', description: 'Group of 2-3 men operating near metro stations, targeting parked motorcycles', status: ' unidentified' }, { name: 'Ravi Kumar', alias: 'Ravi chor', description: 'Known auto thief, seen near Chandni Chowk', age: 28, gender: 'Male', status: 'suspect' }],
    witnesses: [{ name: 'Parking Attendant Ganesh', contact: '9876543220', statement: 'Saw two men with a tow hook loading the motorcycle into a white pickup truck', recordedAt: daysAgo(9) }],
    evidence: [{ id: 'ev1', type: 'Video', name: 'Metro CCTV Footage', description: 'CCTV from Chandni Chowk metro exit showing suspects', url: 'https://picsum.photos/seed/cctv1/400/300', addedBy: 'Inspector Sharma', addedAt: daysAgo(8) }, { id: 'ev2', type: 'Photo', name: 'Tow Truck Photo', description: 'Photo of white pickup truck captured by nearby shop camera', url: 'https://picsum.photos/seed/truck1/400/300', addedBy: 'ASI Gupta', addedAt: daysAgo(7) }],
    notes: [{ id: 'n1', author: 'Inspector Sharma', content: 'Visited crime scene. Collected CCTV footage from metro station. Two suspects identified on camera. Pickup truck has UP registration.', createdAt: daysAgo(8) }, { id: 'n2', author: 'ASI Gupta', content: 'Tracked pickup truck registration to Noida. Coordinating with UP police for suspect identification.', createdAt: daysAgo(5) }],
    timeline: [{ id: 't1', type: 'created', title: 'Case Created', description: 'Investigation opened for motorcycle theft ring', timestamp: daysAgo(8) }, { id: 't2', type: 'assigned', title: 'Officers Assigned', description: 'Inspector Sharma and ASI Gupta assigned', timestamp: daysAgo(8) }, { id: 't3', type: 'evidence', title: 'Evidence Collected', description: 'CCTV footage from metro station', timestamp: daysAgo(7) }, { id: 't4', type: 'suspect', title: 'Suspect Identified', description: 'Ravi Kumar identified as potential suspect', timestamp: daysAgo(5) }],
    createdBy: 'u1', createdAt: daysAgo(8), updatedAt: daysAgo(1), closedAt: null,
  },
  {
    id: 'case2', caseNumber: 'CASE-2024-002', name: 'West District Fraud Case', description: 'Investigating online fraud network targeting elderly citizens through fake investment schemes.', priority: 'critical', category: 'Cyber Crime', crimeType: 'Fraud', crimeLocation: 'Online / Multipleå—å®³ locations', policeStation: 'Dwarka PS', district: 'West District', state: 'Delhi',
    status: 'active', leadOfficerId: 'off1', leadOfficer: officers[0],
    linkedFIRs: [firs[3]], linkedFIRId: 'fir4',
    assignedOfficers: [officers[0]], supportingOfficerIds: [],
    investigationStartDate: daysAgo(18), expectedCompletionDate: daysAgo(-12),
    suspects: [{ name: 'Unknown', alias: 'Investment Guru', description: 'Operates fake Telegram channel with 5000+ members, posts fake profit screenshots', status: 'under investigation' }],
    witnesses: [{ name: 'Neha Gupta', contact: '9876543213', statement: 'Lost 50000 through the QuickProfit app. Made 3 transfers to unknown accounts.', recordedAt: daysAgo(19) }],
    evidence: [{ id: 'ev3', type: 'Document', name: 'Bank Transaction Records', description: 'Transaction records showing transfers to suspected accounts', addedBy: 'Inspector Sharma', addedAt: daysAgo(17) }],
    notes: [{ id: 'n3', author: 'Inspector Sharma', content: 'Analyzed bank transactions. Money was routed through 3 mule accounts before reaching crypto wallet. Coordinating with cyber cell for IP tracing.', createdAt: daysAgo(15) }],
    timeline: [{ id: 't5', type: 'created', title: 'Case Created', description: 'Online fraud investigation opened', timestamp: daysAgo(18) }, { id: 't6', type: 'assigned', title: 'Officer Assigned', description: 'Inspector Sharma assigned as lead', timestamp: daysAgo(18) }, { id: 't7', type: 'evidence', title: 'Bank Records Obtained', description: 'Transaction records from 3 banks', timestamp: daysAgo(17) }],
    createdBy: 'u1', createdAt: daysAgo(18), updatedAt: daysAgo(2), closedAt: null,
  },
  {
    id: 'case3', caseNumber: 'CASE-2024-003', name: 'North Robbery Investigation', description: 'Armed robbery at convenience store. Suspect used country-made pistol.', priority: 'high', category: 'Violent Crime', crimeType: 'Robbery', crimeLocation: 'Model Town, Delhi', policeStation: 'Model Town PS', district: 'North District', state: 'Delhi',
    status: 'investigation', leadOfficerId: 'off4', leadOfficer: officers[3],
    linkedFIRs: [firs[5]], linkedFIRId: 'fir6',
    assignedOfficers: [officers[3]], supportingOfficerIds: [],
    investigationStartDate: daysAgo(2), expectedCompletionDate: daysAgo(28),
    suspects: [{ name: 'Unknown', description: 'Armed, masked, approximately 5ft 10in, fled on black motorcycle', status: ' unidentified' }],
    witnesses: [{ name: 'Store Owner Sunil Mehta', contact: '9876543215', statement: 'Two masked men entered with country-made pistols. Took 45000 from cash counter.', recordedAt: daysAgo(3) }, { name: 'Ravi', contact: '9876543221', statement: 'Saw two men running from store toward parking lot', recordedAt: daysAgo(3) }],
    evidence: [{ id: 'ev4', type: 'Video', name: 'Store CCTV', description: 'Full robbery footage from 3 camera angles', url: 'https://picsum.photos/seed/robbery1/400/300', addedBy: 'ASI Gupta', addedAt: daysAgo(2) }],
    notes: [{ id: 'n4', author: 'ASI Gupta', content: 'Reviewed store CCTV. Both suspects wore helmets. Motorcycle appears to be a black Pulsar. Checking nearby ANPR cameras.', createdAt: daysAgo(2) }],
    timeline: [{ id: 't8', type: 'created', title: 'Case Created', description: 'Armed robbery investigation opened', timestamp: daysAgo(2) }, { id: 't9', type: 'assigned', title: 'Officer Assigned', description: 'ASI Gupta assigned as lead', timestamp: daysAgo(2) }, { id: 't10', type: 'evidence', title: 'CCTV Obtained', description: 'Store CCTV footage collected', timestamp: daysAgo(2) }],
    createdBy: 'u1', createdAt: daysAgo(2), updatedAt: daysAgo(1), closedAt: null,
  },
  {
    id: 'case4', caseNumber: 'CASE-2024-004', name: 'South Assault Case', description: 'Domestic violence complaint. Victim has sustained injuries.', priority: 'medium', category: 'Violent Crime', crimeType: 'Domestic Violence', crimeLocation: 'Saket, Delhi', policeStation: 'Saket PS', district: 'South District', state: 'Delhi',
    status: 'active', leadOfficerId: null, leadOfficer: null,
    linkedFIRs: [firs[6]], linkedFIRId: 'fir7',
    assignedOfficers: [], supportingOfficerIds: [],
    investigationStartDate: daysAgo(11), expectedCompletionDate: null,
    suspects: [{ name: 'Vikram Sharma', description: 'Husband of complainant, known temper issues', status: 'identified' }],
    witnesses: [],
    evidence: [],
    notes: [],
    timeline: [{ id: 't11', type: 'created', title: 'Case Created', timestamp: daysAgo(11) }],
    createdBy: 'u1', createdAt: daysAgo(11), updatedAt: daysAgo(11), closedAt: null,
  },
  {
    id: 'case5', caseNumber: 'CASE-2024-005', name: 'Property Crime Archive', description: 'Closed property crime case. Mobile phone snatching â€” unable to identify suspect.', priority: 'low', category: 'Property Crime', crimeType: 'Theft', crimeLocation: 'Lajpat Nagar, Delhi', policeStation: 'Lajpat Nagar PS', district: 'South District', state: 'Delhi',
    status: 'closed', leadOfficerId: null, leadOfficer: null,
    linkedFIRs: [firs[4]], linkedFIRId: 'fir5',
    assignedOfficers: [], supportingOfficerIds: [],
    investigationStartDate: daysAgo(23), expectedCompletionDate: daysAgo(10),
    suspects: [], witnesses: [], evidence: [],
    notes: [{ id: 'n5', author: 'Constable Patel', content: 'Investigated for 2 weeks. No CCTV footage available. No witnesses. Case closed â€” unable to identify suspect.', createdAt: daysAgo(10) }],
    timeline: [{ id: 't12', type: 'created', title: 'Case Created', timestamp: daysAgo(23) }, { id: 't13', type: 'closed', title: 'Case Closed', description: 'Unable to identify suspect', timestamp: daysAgo(10) }],
    createdBy: 'u1', createdAt: daysAgo(23), updatedAt: daysAgo(10), closedAt: daysAgo(10),
  },
];

const crimeReports = [
  { id: 'cr1', userId: 'u3', user: users[2], crimeType: 'Theft', crimeCategory: 'Property Crime', incidentDate: daysAgo(2), incidentTime: '14:30', location: 'CP Area, Near Metro Station, Delhi', latitude: 28.6315, longitude: 77.2167, district: 'Central District', state: 'Delhi', policeStation: 'Connaught Place PS', description: 'Bicycle stolen from outside Metro station. Was locked with a chain lock but lock was cut. CCTV may have captured the incident.', evidenceUrls: ['https://picsum.photos/seed/ev1/400/300', 'https://picsum.photos/seed/ev2/400/300'], evidence: [{ id: 'e1', type: 'Photo', name: 'Bicycle Photo', url: 'https://picsum.photos/seed/ev1/400/300' }, { id: 'e2', type: 'Photo', name: 'Cut Lock Photo', url: 'https://picsum.photos/seed/ev2/400/300' }], status: 'pending', assignedOfficerId: null, assignedOfficer: null, reviewedBy: null, reviewedAt: null, rejectionReason: null, requestInfoMessage: null, createdFIRId: null, createdAt: daysAgo(2), updatedAt: daysAgo(2) },
  { id: 'cr2', userId: 'u4', user: users[3], crimeType: 'Vandalism', crimeCategory: 'Property Crime', incidentDate: daysAgo(1), incidentTime: '22:15', location: 'Nehru Place, Parking Lot B', latitude: 28.5450, longitude: 77.2510, district: 'South District', state: 'Delhi', policeStation: 'Nehru Place PS', description: 'Car window smashed. No items stolen. Suspect caught on nearby CCTV.',
    evidenceUrls: ['https://picsum.photos/seed/ev3/400/300'],
    evidence: [{ id: 'e3', type: 'Video', name: 'CCTV Footage', url: 'https://picsum.photos/seed/ev3/400/300' }],
    status: 'approved', assignedOfficerId: 'off1', assignedOfficer: officers[0], reviewedBy: 'u1', reviewedAt: daysAgo(0), rejectionReason: null, requestInfoMessage: null, createdFIRId: 'fir8', createdAt: daysAgo(1), updatedAt: daysAgo(0) },
  { id: 'cr3', userId: 'u5', user: users[4], crimeType: 'Cybercrime', crimeCategory: 'Cyber Crime', incidentDate: daysAgo(4), incidentTime: '10:00', location: 'Online â€” Email phishing', latitude: null, longitude: null, district: 'West District', state: 'Delhi', policeStation: 'Dwarka PS', description: 'Phishing attack via fake bank email. Clicked link and entered credentials. Account compromised.', evidenceUrls: [], evidence: [], status: 'rejected', assignedOfficerId: null, assignedOfficer: null, reviewedBy: 'u1', reviewedAt: daysAgo(2), rejectionReason: 'Insufficient evidence â€” no screenshot of phishing email provided', requestInfoMessage: null, createdFIRId: null, createdAt: daysAgo(4), updatedAt: daysAgo(2) },
  { id: 'cr4', userId: null, user: null, crimeType: 'Assault', crimeCategory: 'Violent Crime', incidentDate: daysAgo(0), incidentTime: '23:45', location: 'Paharganj, Near Main Bazaar', latitude: 28.6450, longitude: 77.2130, district: 'Central District', state: 'Delhi', policeStation: 'Paharganj PS', description: 'Street fight between two groups. One person injured. Called ambulance.', evidenceUrls: [], evidence: [], status: 'under_review', assignedOfficerId: 'off4', assignedOfficer: officers[3], reviewedBy: null, reviewedAt: null, rejectionReason: null, requestInfoMessage: null, createdFIRId: null, createdAt: daysAgo(0), updatedAt: daysAgo(0) },
];

const sosAlerts = [
  { id: 'sos1', userId: 'u3', user: users[2], alertType: 'emergency', priority: 'critical', description: 'Woman screaming, possible assault in progress near Red Fort', latitude: 28.6129, longitude: 77.2295, locationAddress: 'Chandni Chowk, Near Red Fort', district: 'Central District', policeStation: 'Chandni Chowk PS', status: 'pending', assignedOfficerId: null, assignedOfficer: null, assignedAt: null, resolvedAt: null, responseTime: null, resolutionNotes: null, soundPlayed: false, contacted: true, createdAt: daysAgo(0), updatedAt: daysAgo(0) },
  { id: 'sos2', userId: 'u4', user: users[3], alertType: 'harassment', priority: 'high', description: 'Group of men harassing women near market, feeling unsafe', latitude: 28.5655, longitude: 77.2440, locationAddress: 'Lajpat Nagar Market', district: 'South District', policeStation: 'Lajpat Nagar PS', status: 'assigned', assignedOfficerId: 'off1', assignedOfficer: officers[0], assignedAt: daysAgo(0), resolvedAt: null, responseTime: null, resolutionNotes: null, soundPlayed: true, contacted: true, createdAt: daysAgo(0), updatedAt: daysAgo(0) },
  { id: 'sos3', userId: null, user: null, alertType: 'medical', priority: 'high', description: 'Elderly man collapsed, not responding, possible heart attack', latitude: 28.6600, longitude: 77.1700, locationAddress: 'Patel Nagar, Block A', district: 'Central District', policeStation: 'Patel Nagar PS', status: 'resolved', assignedOfficerId: 'off4', assignedOfficer: officers[3], assignedAt: daysAgo(1), resolvedAt: daysAgo(0), responseTime: 480, resolutionNotes: 'Officer reached location with ambulance. Patient stabilized and taken to hospital.', soundPlayed: true, contacted: true, createdAt: daysAgo(1), updatedAt: daysAgo(0) },
  { id: 'sos4', userId: 'u5', user: users[4], alertType: 'fire', priority: 'critical', description: 'Building fire, smoke visible from 3rd floor, people trapped inside', latitude: 28.5921, longitude: 77.0467, locationAddress: 'Dwarka Sector 12', district: 'West District', policeStation: 'Dwarka PS', status: 'in-progress', assignedOfficerId: 'off2', assignedOfficer: officers[1], assignedAt: daysAgo(0), resolvedAt: null, responseTime: null, resolutionNotes: null, soundPlayed: true, contacted: true, createdAt: daysAgo(0), updatedAt: daysAgo(0) },
  { id: 'sos5', userId: 'u3', user: users[2], alertType: 'accident', priority: 'medium', description: 'Minor road accident, two vehicles involved, no injuries', latitude: 28.6315, longitude: 77.2167, locationAddress: 'CP Area, Near Metro Station', district: 'Central District', policeStation: 'Connaught Place PS', status: 'pending', assignedOfficerId: null, assignedOfficer: null, assignedAt: null, resolvedAt: null, responseTime: null, resolutionNotes: null, soundPlayed: false, contacted: false, createdAt: daysAgo(0), updatedAt: daysAgo(0) },
  { id: 'sos6', userId: 'u4', user: users[3], alertType: 'emergency', priority: 'high', description: 'Suspicious person loitering near school during pickup hours', latitude: 28.7041, longitude: 77.1025, locationAddress: 'Rohini, Sector 5', district: 'North District', policeStation: 'Rohini PS', status: 'assigned', assignedOfficerId: 'off4', assignedOfficer: officers[3], assignedAt: daysAgo(0), resolvedAt: null, responseTime: null, resolutionNotes: null, soundPlayed: true, contacted: true, createdAt: daysAgo(0), updatedAt: daysAgo(0) },
  { id: 'sos7', userId: null, user: null, alertType: 'other', priority: 'low', description: 'Noise complaint from construction site, ongoing for hours', latitude: 28.5290, longitude: 77.2200, locationAddress: 'Saket, Block B', district: 'South District', policeStation: 'Saket PS', status: 'resolved', assignedOfficerId: 'off5', assignedOfficer: officers[4], assignedAt: daysAgo(1), resolvedAt: daysAgo(1), responseTime: 1200, resolutionNotes: 'Construction noise stopped after warning. Site manager warned about time restrictions.', soundPlayed: false, contacted: false, createdAt: daysAgo(1), updatedAt: daysAgo(1) },
  { id: 'sos8', userId: 'u5', user: users[4], alertType: 'medical', priority: 'critical', description: 'Child having severe allergic reaction, difficulty breathing', latitude: 28.6517, longitude: 77.2219, locationAddress: 'Model Town, Block C', district: 'North District', policeStation: 'Model Town PS', status: 'in-progress', assignedOfficerId: 'off1', assignedOfficer: officers[0], assignedAt: daysAgo(0), resolvedAt: null, responseTime: null, resolutionNotes: null, soundPlayed: true, contacted: true, createdAt: daysAgo(0), updatedAt: daysAgo(0) },
];

const notifications = [
  { id: 'notif1', userId: 'u1', type: 'sos', title: 'New SOS Alert', message: 'SOS alert received from Chandni Chowk area.', read: false, link: '/admin/sos-monitoring', priority: 'critical', createdAt: daysAgo(0) },
  { id: 'notif2', userId: 'u1', type: 'crime_report', title: 'Crime Report Approved', message: 'Vandalism report has been approved and converted to FIR.', read: false, link: '/admin/crime-reports', priority: 'normal', createdAt: daysAgo(1) },
  { id: 'notif3', userId: 'u1', type: 'prediction', title: 'High Risk Prediction', message: 'Central District shows elevated risk levels for this week.', read: true, link: '/admin/ai-prediction', priority: 'high', createdAt: daysAgo(2) },
  { id: 'notif4', userId: 'u1', type: 'system', title: 'System Update', message: 'System maintenance scheduled for tonight at 2 AM.', read: false, link: null, priority: 'low', createdAt: daysAgo(0) },
  { id: 'notif5', userId: 'u1', type: 'assignment', title: 'FIR Assigned', message: 'FIR-2024-001 has been assigned to Inspector Sharma.', read: true, link: '/admin/fir-management', priority: 'normal', createdAt: daysAgo(1) },
];

const auditLogs = [
  { id: 'log1', userId: 'u1', user: users[0], action: 'LOGIN', entityType: 'USER', entityId: 'u1', oldValues: null, newValues: null, ipAddress: '192.168.1.1', userAgent: 'Chrome/120', createdAt: daysAgo(0) },
  { id: 'log2', userId: 'u1', user: users[0], action: 'CREATE', entityType: 'FIR', entityId: 'fir6', oldValues: null, newValues: { status: 'pending' }, ipAddress: '192.168.1.1', userAgent: 'Chrome/120', createdAt: daysAgo(3) },
  { id: 'log3', userId: 'u2', user: users[1], action: 'UPDATE', entityType: 'FIR', entityId: 'fir1', oldValues: { status: 'pending' }, newValues: { status: 'investigation' }, ipAddress: '192.168.1.2', userAgent: 'Firefox/121', createdAt: daysAgo(1) },
  { id: 'log4', userId: 'u1', user: users[0], action: 'APPROVE', entityType: 'CRIME_REPORT', entityId: 'cr2', oldValues: { status: 'pending' }, newValues: { status: 'approved' }, ipAddress: '192.168.1.1', userAgent: 'Chrome/120', createdAt: daysAgo(0) },
  { id: 'log5', userId: null, user: null, action: 'LOGOUT', entityType: 'USER', entityId: 'u3', oldValues: null, newValues: null, ipAddress: '192.168.1.3', userAgent: 'Safari/17', createdAt: daysAgo(2) },
];

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
const paginate = (arr, { page = 1, pageSize = 10 } = {}) => {
  const p = Math.max(1, Number(page));
  const ps = Math.max(1, Math.min(100, Number(pageSize)));
  const total = arr.length;
  const totalPages = Math.ceil(total / ps) || 1;
  const data = arr.slice((p - 1) * ps, p * ps);
  return { data, total, page: p, pageSize: ps, totalPages };
};

function filterArray(arr, query = {}) {
  return arr.filter(item => {
    for (const [key, val] of Object.entries(query)) {
      if (!val || key === 'page' || key === 'pageSize' || key === 'sortBy' || key === 'sortOrder') continue;
      if (key === 'search') {
        const s = String(val).toLowerCase();
        const fields = ['firNumber', 'crimeType', 'complainantName', 'district', 'location', 'description'];
        if (!fields.some(f => String(item[f] || '').toLowerCase().includes(s))) return false;
      } else if (key === 'status') {
        if (item.status !== val) return false;
      } else if (key === 'district') {
        if (!String(item.district || '').toLowerCase().includes(String(val).toLowerCase())) return false;
      } else if (key === 'crimeType') {
        if (!String(item.crimeType || '').toLowerCase().includes(String(val).toLowerCase())) return false;
      } else if (key === 'assignedOfficer') {
        if (!String(item.assignedOfficer?.name || '').toLowerCase().includes(String(val).toLowerCase())) return false;
      } else if (key === 'dateFrom') {
        if (new Date(item.incidentDate || item.createdAt) < new Date(val)) return false;
      } else if (key === 'dateTo') {
        if (new Date(item.incidentDate || item.createdAt) > new Date(val)) return false;
      }
    }
    return true;
  });
}

function filterHistorical({ state, district, yearFrom, yearTo, crimeType } = {}) {
  return historicalData.filter(r => {
    if (state && !r.state.toUpperCase().includes(state.toUpperCase())) return false;
    if (district && !r.district.toUpperCase().includes(district.toUpperCase())) return false;
    if (yearFrom && r.year < Number(yearFrom)) return false;
    if (yearTo && r.year > Number(yearTo)) return false;
    if (crimeType && r.crimeType.toUpperCase() !== crimeType.toUpperCase()) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Persistence: the in-memory arrays below stay the API surface, PostgreSQL
// stays the source of truth. See lib/persistence.cjs.
// ---------------------------------------------------------------------------
const userPasswords = new Map(); // userId -> bcrypt hash (never serialised)

const persistence = createPersistence([
  {
    key: 'users',
    table: 'users',
    container: () => users,
    applyLoaded: rows => {
      userPasswords.clear();
      rows.forEach(row => {
        if (row.__password) userPasswords.set(row.id, row.__password);
        delete row.__password;
      });
      replaceContents(users, rows);
    },
    prepareSave: rows => rows.map(row => ({ ...row, __password: userPasswords.get(row.id) ?? null })),
  },
  { key: 'officers', table: 'officers', container: () => officers },
  { key: 'firs', table: 'firs', container: () => firs },
  { key: 'cases', table: 'cases', container: () => cases },
  { key: 'crimeReports', table: 'crime_reports', container: () => crimeReports },
  { key: 'sosAlerts', table: 'sos_alerts', container: () => sosAlerts },
  { key: 'notifications', table: 'notifications', container: () => notifications },
  { key: 'auditLogs', table: 'audit_logs', container: () => auditLogs },
  { key: 'generatedReports', table: 'reports', container: () => generatedReports },
  { key: 'settings', table: 'settings', kind: 'object', container: () => settings },
]);

app.use(persistence.middleware);
app.use(auth.authenticate);

// ---------------------------------------------------------------------------
// AUTHORIZATION (role based)
// ---------------------------------------------------------------------------
// Surfaces that are only meant for police staff; citizens never get these.
const CITIZEN_FORBIDDEN = [
  '/api/users',
  '/api/officers',
  '/api/settings',
  '/api/audit-logs',
  '/api/reports',
  '/api/export',
  '/api/tracking',
  '/api/firs',
  '/api/cases',
  '/api/predictions',
  '/api/risk',
  '/api/forecast',
  '/api/dashboard',
  '/api/analytics',
  '/api/heatmap',
];

// Writes limited to administrators.
const ADMIN_WRITE = ['/api/users', '/api/officers', '/api/settings'];

// Aggregate crime statistics are not personal data, so citizens may read them
// even though they live under a prefix that is otherwise staff-only.
const CITIZEN_READ_ALLOW = ['/api/heatmap', '/api/analytics/hotspots'];

// Writes that a read-only viewer account may never perform.
const VIEWER_NO_WRITE = [
  '/api/users',
  '/api/officers',
  '/api/settings',
  '/api/tracking',
  '/api/firs',
  '/api/cases',
  '/api/crime-reports',
  '/api/sos-alerts',
  '/api/upload',
];

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function pathMatches(path, prefixes) {
  return prefixes.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}

function authorize(req, res, next) {
  const role = req.auth && req.auth.role;
  if (!role) return next();

  const path = req.path;
  const isRead = READ_METHODS.has(req.method.toUpperCase());
  const mutating = !isRead;

  const citizenAllowed = isRead && pathMatches(path, CITIZEN_READ_ALLOW);
  if (role === 'citizen' && !citizenAllowed && pathMatches(path, CITIZEN_FORBIDDEN)) {
    return res.status(403).json({ message: 'Forbidden: citizen accounts cannot access this resource' });
  }
  if (mutating && pathMatches(path, ADMIN_WRITE) && role !== 'admin' && role !== 'super_admin') {
    return res.status(403).json({ message: 'Forbidden: administrator role required' });
  }
  if (mutating && role === 'viewer' && pathMatches(path, VIEWER_NO_WRITE)) {
    return res.status(403).json({ message: 'Forbidden: viewer accounts are read-only' });
  }
  next();
}
app.use(authorize);

// Citizens only ever see their own rows; staff see everything.
function ownerFilter(req, list) {
  if (!req.auth || req.auth.role !== 'citizen') return list;
  return list.filter(item => String(item.userId ?? item.reportedBy ?? '') === String(req.auth.id));
}

// ---------------------------------------------------------------------------
// AUTH (bcrypt + JWT + rate limiting)
// ---------------------------------------------------------------------------
const SALT_ROUNDS = 10;
const passwordResetTokens = {};

const DEFAULT_PASSWORDS = {
  'admin@police.gov.in': 'admin123',
  'officer@police.gov.in': 'officer123',
  'super@police.gov.in': 'super123',
  'viewer@police.gov.in': 'viewer123',
};

function applyDefaultPasswords() {
  users.forEach(user => {
    const plain = DEFAULT_PASSWORDS[String(user.email || '').toLowerCase()];
    if (plain && !userPasswords.has(user.id)) {
      userPasswords.set(user.id, bcrypt.hashSync(plain, SALT_ROUNDS));
    }
  });
}

function publicUser(user) {
  if (!user) return null;
  const copy = { ...user };
  delete copy.__password;
  return copy;
}

function findUserByEmail(email) {
  const needle = String(email || '').toLowerCase();
  return users.find(u => String(u.email || '').toLowerCase() === needle);
}

function recordAudit(type, userId, userName, action) {
  auditLogs.unshift({
    id: 'audit' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    type,
    userId: userId || '',
    userName: userName || 'unknown',
    action,
    timestamp: new Date().toISOString(),
  });
}

app.post('/api/auth/register', authLimiter, (req, res) => {
  const { name, email, password, phone, role } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email and password are required' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }
  if (findUserByEmail(email)) {
    return res.status(409).json({ message: 'An account with this email already exists' });
  }
  const requestedRole = role === 'officer' ? 'officer' : 'citizen';
  const user = {
    id: 'u' + (Date.now().toString(36)),
    name,
    email,
    phone: phone || '',
    role: requestedRole,
    status: 'active',
    badgeNumber: '',
    station: '',
    jurisdiction: '',
    permissions: requestedRole === 'officer' ? ['fir.read', 'fir.write', 'cases.read'] : ['reports.create', 'sos.create'],
    lastLogin: new Date().toISOString(),
    registrationDate: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  users.push(user);
  userPasswords.set(user.id, bcrypt.hashSync(password, SALT_ROUNDS));
  recordAudit('register', user.id, user.name, `${user.name} registered`);
  const accessToken = auth.signAccessToken(user);
  const refreshToken = auth.signRefreshToken(user);
  res.status(201).json({
    user: publicUser(user),
    accessToken,
    refreshToken,
    expiresIn: 3600,
  });
});

app.post('/api/auth/login', authLimiter, (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
  const user = findUserByEmail(email);
  const hash = user ? userPasswords.get(user.id) : null;
  if (!user || !hash || !bcrypt.compareSync(password, hash)) {
    recordAudit('login_failed', '', email, `Failed login attempt for ${email}`);
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  if (user.status && user.status !== 'active') {
    return res.status(403).json({ message: 'Account is not active' });
  }
  user.lastLogin = new Date().toISOString();
  recordAudit('login_success', user.id, user.name, `${user.name} logged in`);
  res.json({
    user: publicUser(user),
    accessToken: auth.signAccessToken(user),
    refreshToken: auth.signRefreshToken(user),
    expiresIn: 3600,
  });
});

app.post('/api/auth/refresh', (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ message: 'Refresh token is required' });
  try {
    const payload = auth.verifyRefreshToken(refreshToken);
    const user = users.find(u => u.id === payload.sub);
    if (!user) return res.status(401).json({ message: 'Account no longer exists' });
    res.json({
      user: publicUser(user),
      accessToken: auth.signAccessToken(user),
      refreshToken: auth.signRefreshToken(user),
      expiresIn: 3600,
    });
  } catch (_error) {
    res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
});

app.get('/api/auth/me', (req, res) => res.json(publicUser(req.currentUser)));

app.post('/api/auth/logout', (req, res) => {
  recordAudit('logout', req.auth?.id, req.auth?.name, `${req.auth?.name || 'User'} logged out`);
  res.json({ message: 'Logged out successfully' });
});

app.post('/api/auth/forgot-password', authLimiter, (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ message: 'Email is required' });
  const token = 'rst-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  passwordResetTokens[token] = { email, expiresAt: Date.now() + 3600000 };
  recordAudit('password_reset_request', '', email, `Password reset requested for ${email}`);
  res.json({ message: 'Password reset link sent to email', token });
});

app.post('/api/auth/reset-password', (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) return res.status(400).json({ message: 'Token and new password are required' });
  const resetData = passwordResetTokens[token];
  if (!resetData || resetData.expiresAt < Date.now()) return res.status(400).json({ message: 'Invalid or expired token' });
  const user = findUserByEmail(resetData.email);
  if (user) userPasswords.set(user.id, bcrypt.hashSync(newPassword, SALT_ROUNDS));
  delete passwordResetTokens[token];
  recordAudit('password_reset', user?.id || '', resetData.email, `Password reset completed for ${resetData.email}`);
  res.json({ message: 'Password reset successfully' });
});

// ---------------------------------------------------------------------------
// RBAC MIDDLEWARE - role checks come from the verified JWT
// ---------------------------------------------------------------------------
const requireRole = auth.requireRole;


// ---------------------------------------------------------------------------
// FILE UPLOAD
// ---------------------------------------------------------------------------
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ id: 'file-' + Date.now(), filename: req.file.filename, originalName: req.file.originalname, size: req.file.size, mimetype: req.file.mimetype, url: `/uploads/${req.file.filename}`, uploadedAt: new Date().toISOString() });
});

app.post('/api/upload/multiple', upload.array('files', 5), (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
  const files = req.files.map(f => ({ id: 'file-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), filename: f.filename, originalName: f.originalname, size: f.size, mimetype: f.mimetype, url: `/uploads/${f.filename}`, uploadedAt: new Date().toISOString() }));
  res.json({ files });
});

app.use('/uploads', express.static(uploadDir));

// ---------------------------------------------------------------------------
// DASHBOARD - now uses real historical data for stats
// ---------------------------------------------------------------------------
app.get('/api/dashboard/statistics', (_req, res) => {
  const latestYear = allYears[allYears.length - 1];
  const prevYear = latestYear - 1;
  const latestData = historicalData.filter(r => r.year === latestYear && isAdditiveCrimeType(r.crimeType) && !r.district.toUpperCase().includes('TOTAL'));
  const prevData = historicalData.filter(r => r.year === prevYear && isAdditiveCrimeType(r.crimeType) && !r.district.toUpperCase().includes('TOTAL'));
  const latestTotal = latestData.reduce((s, r) => s + r.count, 0);
  const prevTotal = prevData.reduce((s, r) => s + r.count, 0);
  const avgPerYear =
    historicalData.filter(r => isAdditiveCrimeType(r.crimeType) && !r.district.toUpperCase().includes('TOTAL'))
      .reduce((s, r) => s + r.count, 0) / allYears.length;

  res.json({
    totalFIRs: firs.length,
    activeCases: cases.filter(c => c.status !== 'closed').length,
    pendingReports: crimeReports.filter(r => r.status === 'pending').length,
    activeOfficers: officers.filter(o => o.status === 'active').length,
    sosAlerts: sosAlerts.filter(a => a.status !== 'resolved').length,
    solvedCases: cases.filter(c => c.status === 'closed').length,
    historicalCrimes: latestTotal,
    historicalAverage: Math.round(avgPerYear),
    historicalYearOverYearChange: prevTotal > 0 ? Math.round(((latestTotal - prevTotal) / prevTotal) * 100) : 0,
    todayIncidents: 3,
    totalHistoricalRecords: historicalData.length,
    availableYears: allYears,
    availableStates: allStates.length,
    lastUpdated: new Date().toISOString(),
  });
});

app.get('/api/dashboard/recent-crimes', (req, res) => {
  const limit = Number(req.query.limit) || 5;
  res.json(firs.slice(0, limit));
});

app.get('/api/dashboard/district-analysis', (_req, res) => {
  const latestYear = allYears[allYears.length - 1];
  const districtTotals = {};
  historicalData.filter(r => r.year === latestYear && isAdditiveCrimeType(r.crimeType) && !r.district.toUpperCase().includes('TOTAL')).forEach(r => {
    const key = `${r.state}\u0000${r.district}`;
    if (!districtTotals[key]) districtTotals[key] = { state: r.state, district: r.district, count: 0 };
    districtTotals[key].count += r.count;
  });
  const prevYearTotals = {};
  historicalData.filter(r => r.year === latestYear - 1 && isAdditiveCrimeType(r.crimeType) && !r.district.toUpperCase().includes('TOTAL')).forEach(r => {
    const key = `${r.state}\u0000${r.district}`;
    prevYearTotals[key] = (prevYearTotals[key] || 0) + r.count;
  });
  const sorted = Object.values(districtTotals).sort((a, b) => b.count - a.count).slice(0, 10).map((d, i) => {
    const prev = prevYearTotals[`${d.state}\u0000${d.district}`] || d.count;
    const change = prev > 0 ? Math.round(((d.count - prev) / prev) * 100) : 0;
    return { district: d.district, state: d.state, count: d.count, rank: i + 1, change, trend: change > 5 ? 'increasing' : change < -5 ? 'decreasing' : 'stable' };
  });
  res.json(sorted);
});

app.get('/api/dashboard/crime-type-breakdown', (_req, res) => {
  const latestYear = allYears[allYears.length - 1];
  const typeTotals = {};
  let grandTotal = 0;
  historicalData.filter(r => r.year === latestYear && isAdditiveCrimeType(r.crimeType)).forEach(r => {
    if (!typeTotals[r.crimeType]) typeTotals[r.crimeType] = 0;
    typeTotals[r.crimeType] += r.count;
    grandTotal += r.count;
  });
  const breakdown = Object.entries(typeTotals)
    .map(([type, count]) => ({ type, count, percentage: grandTotal > 0 ? Math.round((count / grandTotal) * 100) : 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  res.json(breakdown);
});

app.get('/api/dashboard/trends', (_req, res) => {
  const yearTotals = {};
  historicalData.forEach(r => {
    if (!yearTotals[r.year]) yearTotals[r.year] = 0;
    yearTotals[r.year] += r.count;
  });
  const trends = allYears.map(y => ({ date: String(y), count: yearTotals[y] || 0, predicted: false }));
  res.json(trends);
});

// ---------------------------------------------------------------------------
// FIRs
// ---------------------------------------------------------------------------
app.get('/api/firs', (req, res) => res.json(paginate(filterArray(firs, req.query), req.query)));
app.get('/api/firs/export', (req, res) => {
  const filtered = filterArray(firs, req.query);
  const csv = ['FIR Number,Crime Type,Severity,Priority,Complainant,District,State,Status,Assigned Officer,Created At'];
  filtered.forEach(f => {
    csv.push([f.firNumber, f.crimeType, f.severity || '', f.priority || '', f.complainantName, f.district, f.state || '', f.status, f.assignedOfficer?.name || '', f.createdAt].join(','));
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=firs-export.csv');
  res.send(csv.join('\n'));
});
app.get('/api/firs/:id', (req, res) => res.json(firs.find(f => f.id === req.params.id) || firs[0]));
app.post('/api/firs', (req, res) => {
  const now = new Date().toISOString();
  const fir = { id: 'fir' + Date.now(), firNumber: `FIR-2024-${String(firs.length + 1).padStart(3, '0')}`, severity: 'medium', priority: 'medium', state: '', city: '', policeStation: '', victims: [], suspects: [], witnesses: [], ...req.body, status: 'pending', assignedOfficerId: null, assignedOfficer: null, createdBy: 'u1', closureReason: null, resolutionNotes: null, createdAt: now, updatedAt: now, closedAt: null };
  firs.unshift(fir);
  notifications.unshift({ id: 'notif' + Date.now(), userId: 'u1', type: 'system', title: 'New FIR Created', message: `FIR ${fir.firNumber} created for ${fir.crimeType} in ${fir.district}.`, read: false, link: '/admin/fir-management', priority: 'normal', createdAt: now });
  auditLogs.unshift({ id: 'log' + Date.now(), userId: 'u1', user: users[0], action: 'CREATE', entityType: 'FIR', entityId: fir.id, oldValues: null, newValues: { status: 'pending', crimeType: fir.crimeType, district: fir.district }, ipAddress: '192.168.1.1', userAgent: 'Chrome/120', createdAt: now });
  res.json(fir);
});
app.put('/api/firs/:id', (req, res) => {
  const idx = firs.findIndex(f => f.id === req.params.id);
  const old = idx >= 0 ? { ...firs[idx] } : firs[0];
  const updated = { ...old, ...req.body, updatedAt: new Date().toISOString() };
  if (idx >= 0) firs[idx] = updated;
  auditLogs.unshift({ id: 'log' + Date.now(), userId: 'u1', user: users[0], action: 'UPDATE', entityType: 'FIR', entityId: req.params.id, oldValues: { status: old.status, crimeType: old.crimeType }, newValues: { status: updated.status, crimeType: updated.crimeType }, ipAddress: '192.168.1.1', userAgent: 'Chrome/120', createdAt: new Date().toISOString() });
  res.json(updated);
});
app.post('/api/firs/:id/assign', (req, res) => {
  const idx = firs.findIndex(f => f.id === req.params.id);
  const old = idx >= 0 ? { ...firs[idx] } : firs[0];
  const assignedOfficer = officers.find(o => o.id === req.body.officerId) || null;
  const updated = { ...old, assignedOfficerId: req.body.officerId, assignedOfficer, updatedAt: new Date().toISOString() };
  if (idx >= 0) firs[idx] = updated;
  notifications.unshift({ id: 'notif' + Date.now(), userId: 'u1', type: 'assignment', title: 'FIR Assigned', message: `FIR ${old.firNumber} assigned to ${assignedOfficer?.name || 'Officer'}.`, read: false, link: '/admin/fir-management', priority: 'normal', createdAt: new Date().toISOString() });
  auditLogs.unshift({ id: 'log' + Date.now(), userId: 'u1', user: users[0], action: 'UPDATE', entityType: 'FIR', entityId: req.params.id, oldValues: { assignedOfficerId: old.assignedOfficerId }, newValues: { assignedOfficerId: req.body.officerId }, ipAddress: '192.168.1.1', userAgent: 'Chrome/120', createdAt: new Date().toISOString() });
  res.json(updated);
});
app.post('/api/firs/:id/close', (req, res) => {
  const idx = firs.findIndex(f => f.id === req.params.id);
  const old = idx >= 0 ? { ...firs[idx] } : firs[0];
  const updated = { ...old, status: 'closed', closureReason: req.body.closureReason, resolutionNotes: req.body.resolutionNotes, closedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  if (idx >= 0) firs[idx] = updated;
  auditLogs.unshift({ id: 'log' + Date.now(), userId: 'u1', user: users[0], action: 'UPDATE', entityType: 'FIR', entityId: req.params.id, oldValues: { status: old.status }, newValues: { status: 'closed', closureReason: req.body.closureReason }, ipAddress: '192.168.1.1', userAgent: 'Chrome/120', createdAt: new Date().toISOString() });
  res.json(updated);
});
app.delete('/api/firs/:id', (_req, res) => {
  auditLogs.unshift({ id: 'log' + Date.now(), userId: 'u1', user: users[0], action: 'DELETE', entityType: 'FIR', entityId: _req.params.id, oldValues: null, newValues: null, ipAddress: '192.168.1.1', userAgent: 'Chrome/120', createdAt: new Date().toISOString() });
  res.json({ message: 'FIR deleted successfully' });
});

// ---------------------------------------------------------------------------
// CASES
// ---------------------------------------------------------------------------
app.get('/api/cases', (req, res) => res.json(paginate(filterArray(cases, req.query), req.query)));
app.get('/api/cases/export', (req, res) => {
  const filtered = filterArray(cases, req.query);
  const csv = ['Case Number,Name,Status,Priority,Category,Crime Type,District,Lead Officer,Officers,Created At'];
  filtered.forEach(c => {
    csv.push([c.caseNumber, c.name, c.status, c.priority, c.category || '', c.crimeType || '', c.district || '', c.leadOfficer?.name || '', c.assignedOfficers?.map(o => o.name).join('; ') || '', c.createdAt].join(','));
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=cases-export.csv');
  res.send(csv.join('\n'));
});
app.get('/api/cases/:id', (req, res) => res.json(cases.find(c => c.id === req.params.id) || cases[0]));
app.post('/api/cases', (req, res) => {
  const now = new Date().toISOString();
  const linkedFIRs = (req.body.linkedFIRIds || []).map(id => firs.find(f => f.id === id)).filter(Boolean);
  const assignedOfficers = (req.body.assignedOfficerIds || []).map(id => officers.find(o => o.id === id)).filter(Boolean);
  const leadOfficer = req.body.leadOfficerId ? officers.find(o => o.id === req.body.leadOfficerId) || null : null;
  const c = {
    id: 'case' + Date.now(), caseNumber: `CASE-2024-${String(cases.length + 1).padStart(3, '0')}`,
    ...req.body, status: 'active',
    leadOfficer, linkedFIRs, assignedOfficers,
    suspects: [], witnesses: [], evidence: [], notes: [],
    timeline: [{ id: 'tl' + Date.now(), type: 'created', title: 'Case Created', description: req.body.name || 'New investigation', timestamp: now }],
    createdBy: 'u1', createdAt: now, updatedAt: now, closedAt: null,
  };
  cases.unshift(c);
  notifications.unshift({ id: 'notif' + Date.now(), userId: 'u1', type: 'system', title: 'New Case Created', message: `Case ${c.caseNumber} opened: ${c.name}`, read: false, link: '/admin/cases', priority: 'normal', createdAt: now });
  auditLogs.unshift({ id: 'log' + Date.now(), userId: 'u1', user: users[0], action: 'CREATE', entityType: 'CASE', entityId: c.id, oldValues: null, newValues: { name: c.name, priority: c.priority, category: c.category }, ipAddress: '192.168.1.1', userAgent: 'Chrome/120', createdAt: now });
  res.json(c);
});
app.put('/api/cases/:id', (req, res) => {
  const idx = cases.findIndex(c => c.id === req.params.id);
  const old = idx >= 0 ? { ...cases[idx] } : cases[0];
  const assignedOfficers = req.body.assignedOfficerIds ? req.body.assignedOfficerIds.map(id => officers.find(o => o.id === id)).filter(Boolean) : old.assignedOfficers;
  const leadOfficer = req.body.leadOfficerId ? officers.find(o => o.id === req.body.leadOfficerId) || old.leadOfficer : old.leadOfficer;
  const updated = { ...old, ...req.body, leadOfficer, assignedOfficers, updatedAt: new Date().toISOString() };
  if (req.body.status === 'closed') updated.closedAt = new Date().toISOString();
  if (idx >= 0) cases[idx] = updated;
  auditLogs.unshift({ id: 'log' + Date.now(), userId: 'u1', user: users[0], action: 'UPDATE', entityType: 'CASE', entityId: req.params.id, oldValues: { status: old.status, priority: old.priority }, newValues: { status: updated.status, priority: updated.priority }, ipAddress: '192.168.1.1', userAgent: 'Chrome/120', createdAt: new Date().toISOString() });
  res.json(updated);
});
app.patch('/api/cases/:id/status', (req, res) => {
  const idx = cases.findIndex(c => c.id === req.params.id);
  const old = idx >= 0 ? { ...cases[idx] } : cases[0];
  const updated = { ...old, status: req.body.status, updatedAt: new Date().toISOString() };
  if (req.body.status === 'closed') updated.closedAt = new Date().toISOString();
  if (idx >= 0) cases[idx] = updated;
  auditLogs.unshift({ id: 'log' + Date.now(), userId: 'u1', user: users[0], action: 'UPDATE', entityType: 'CASE', entityId: req.params.id, oldValues: { status: old.status }, newValues: { status: req.body.status }, ipAddress: '192.168.1.1', userAgent: 'Chrome/120', createdAt: new Date().toISOString() });
  res.json(updated);
});
app.patch('/api/cases/:id/assign', (req, res) => {
  const idx = cases.findIndex(c => c.id === req.params.id);
  const old = idx >= 0 ? { ...cases[idx] } : cases[0];
  const assignedOfficers = (req.body.officerIds || []).map(id => officers.find(o => o.id === id)).filter(Boolean);
  const leadOfficer = req.body.leadOfficerId ? officers.find(o => o.id === req.body.leadOfficerId) || old.leadOfficer : old.leadOfficer;
  const updated = { ...old, leadOfficer, assignedOfficers, updatedAt: new Date().toISOString() };
  if (idx >= 0) cases[idx] = updated;
  notifications.unshift({ id: 'notif' + Date.now(), userId: 'u1', type: 'assignment', title: 'Case Officers Assigned', message: `${old.caseNumber}: ${assignedOfficers.map(o => o.name).join(', ')}`, read: false, link: '/admin/cases', priority: 'normal', createdAt: new Date().toISOString() });
  auditLogs.unshift({ id: 'log' + Date.now(), userId: 'u1', user: users[0], action: 'UPDATE', entityType: 'CASE', entityId: req.params.id, oldValues: { assignedOfficers: old.assignedOfficers?.map(o => o.id) }, newValues: { assignedOfficers: assignedOfficers.map(o => o.id) }, ipAddress: '192.168.1.1', userAgent: 'Chrome/120', createdAt: new Date().toISOString() });
  res.json(updated);
});
app.patch('/api/cases/:id/priority', (req, res) => {
  const idx = cases.findIndex(c => c.id === req.params.id);
  const old = idx >= 0 ? { ...cases[idx] } : cases[0];
  const updated = { ...old, priority: req.body.priority, updatedAt: new Date().toISOString() };
  if (idx >= 0) cases[idx] = updated;
  notifications.unshift({ id: 'notif' + Date.now(), userId: 'u1', type: 'system', title: 'Case Priority Changed', message: `${old.caseNumber} priority changed to ${req.body.priority}`, read: false, link: '/admin/cases', priority: req.body.priority === 'critical' ? 'critical' : 'normal', createdAt: new Date().toISOString() });
  auditLogs.unshift({ id: 'log' + Date.now(), userId: 'u1', user: users[0], action: 'UPDATE', entityType: 'CASE', entityId: req.params.id, oldValues: { priority: old.priority }, newValues: { priority: req.body.priority }, ipAddress: '192.168.1.1', userAgent: 'Chrome/120', createdAt: new Date().toISOString() });
  res.json(updated);
});
app.post('/api/cases/:id/notes', (req, res) => {
  const idx = cases.findIndex(c => c.id === req.params.id);
  const old = idx >= 0 ? cases[idx] : cases[0];
  const note = { id: 'note' + Date.now(), author: req.body.author || 'Officer', content: req.body.content, createdAt: new Date().toISOString() };
  if (!old.notes) old.notes = [];
  old.notes.unshift(note);
  old.updatedAt = new Date().toISOString();
  res.json(note);
});
app.post('/api/cases/:id/evidence', (req, res) => {
  const idx = cases.findIndex(c => c.id === req.params.id);
  const old = idx >= 0 ? cases[idx] : cases[0];
  const ev = { id: 'ev' + Date.now(), type: req.body.type || 'Document', name: req.body.name || 'Evidence', description: req.body.description || '', url: req.body.url || '', addedBy: req.body.addedBy || 'Officer', addedAt: new Date().toISOString() };
  if (!old.evidence) old.evidence = [];
  old.evidence.unshift(ev);
  old.updatedAt = new Date().toISOString();
  res.json(ev);
});
app.post('/api/cases/:id/suspects', (req, res) => {
  const idx = cases.findIndex(c => c.id === req.params.id);
  const old = idx >= 0 ? cases[idx] : cases[0];
  const suspect = { name: req.body.name, alias: req.body.alias || '', description: req.body.description || '', age: req.body.age, gender: req.body.gender || '', status: req.body.status || 'suspect' };
  if (!old.suspects) old.suspects = [];
  old.suspects.push(suspect);
  old.updatedAt = new Date().toISOString();
  res.json(suspect);
});
app.post('/api/cases/:id/witnesses', (req, res) => {
  const idx = cases.findIndex(c => c.id === req.params.id);
  const old = idx >= 0 ? cases[idx] : cases[0];
  const witness = { name: req.body.name, contact: req.body.contact || '', statement: req.body.statement || '', recordedAt: new Date().toISOString() };
  if (!old.witnesses) old.witnesses = [];
  old.witnesses.push(witness);
  old.updatedAt = new Date().toISOString();
  res.json(witness);
});
app.delete('/api/cases/:id', (_req, res) => {
  auditLogs.unshift({ id: 'log' + Date.now(), userId: 'u1', user: users[0], action: 'DELETE', entityType: 'CASE', entityId: _req.params.id, oldValues: null, newValues: null, ipAddress: '192.168.1.1', userAgent: 'Chrome/120', createdAt: new Date().toISOString() });
  res.json({ message: 'Case deleted successfully' });
});

// ---------------------------------------------------------------------------
// USERS
// ---------------------------------------------------------------------------
app.get('/api/users', (req, res) => res.json(paginate(users, req.query)));
app.get('/api/users/stats', (_req, res) => {
  const total = users.length;
  const active = users.filter(u => u.status === 'active').length;
  const suspended = users.filter(u => u.status === 'suspended').length;
  const inactive = users.filter(u => u.status === 'inactive').length;
  const pending = users.filter(u => u.status === 'pending').length;
  const training = users.filter(u => u.status === 'training').length;
  const roles = {};
  users.forEach(u => { roles[u.role] = (roles[u.role] || 0) + 1; });
  res.json({ total, active, suspended, inactive, pending, training, roles });
});
app.get('/api/users/:id', (req, res) => res.json(users.find(u => u.id === req.params.id) || users[0]));
app.post('/api/users', (req, res) => {
  const u = { id: 'u' + Date.now(), ...req.body, status: req.body.status || 'active', registrationDate: new Date().toISOString(), lastLogin: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  users.push(u);
  notifications.unshift({ id: 'notif' + Date.now(), type: 'info', title: 'New User Created', message: `User "${u.name}" (${u.role}) added to the system`, read: false, createdAt: new Date().toISOString() });
  auditLogs.unshift({ id: 'audit' + Date.now(), type: 'user_created', userId: 'u1', userName: 'Admin User', action: `Created user "${u.name}" with role ${u.role}`, timestamp: new Date().toISOString() });
  res.json(u);
});
app.put('/api/users/:id', (req, res) => {
  const idx = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });
  const oldStatus = users[idx].status;
  users[idx] = { ...users[idx], ...req.body, updatedAt: new Date().toISOString() };
  if (req.body.status && req.body.status !== oldStatus) {
    notifications.unshift({ id: 'notif' + Date.now(), type: 'info', title: 'User Status Changed', message: `User "${users[idx].name}" status changed from ${oldStatus} to ${req.body.status}`, read: false, createdAt: new Date().toISOString() });
    auditLogs.unshift({ id: 'audit' + Date.now(), type: 'user_status_changed', userId: 'u1', userName: 'Admin User', action: `Changed "${users[idx].name}" status: ${oldStatus} â†’ ${req.body.status}`, timestamp: new Date().toISOString() });
  } else {
    auditLogs.unshift({ id: 'audit' + Date.now(), type: 'user_updated', userId: 'u1', userName: 'Admin User', action: `Updated user "${users[idx].name}"`, timestamp: new Date().toISOString() });
  }
  res.json(users[idx]);
});
app.delete('/api/users/:id', (req, res) => {
  const idx = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });
  const deleted = users.splice(idx, 1)[0];
  notifications.unshift({ id: 'notif' + Date.now(), type: 'warning', title: 'User Deleted', message: `User "${deleted.name}" (${deleted.role}) removed from the system`, read: false, createdAt: new Date().toISOString() });
  auditLogs.unshift({ id: 'audit' + Date.now(), type: 'user_deleted', userId: 'u1', userName: 'Admin User', action: `Deleted user "${deleted.name}" (${deleted.email})`, timestamp: new Date().toISOString() });
  res.json({ message: 'User deleted successfully', id: deleted.id });
});

// ---------------------------------------------------------------------------
// OFFICERS
// ---------------------------------------------------------------------------
app.get('/api/officers', (req, res) => res.json(paginate(officers, req.query)));

// Map feed: officer positions read straight from PostgreSQL.
app.get('/api/officers/locations', async (req, res, next) => {
  try {
    const params = [];
    let where = 'latitude IS NOT NULL AND longitude IS NOT NULL';
    if (req.query.status) {
      params.push(req.query.status);
      where += ` AND status = $${params.length}`;
    }
    const { rows } = await db.query(
      `SELECT data FROM officers WHERE ${where} ORDER BY pos, id`,
      params
    );
    const list = rows
      .map(row => row.data)
      .filter(o => o.currentLocation && typeof o.currentLocation.latitude === 'number');
    res.json({
      officers: list,
      total: list.length,
      active: list.filter(o => o.status === 'active').length,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/officers/:id', (req, res) => {
  const o = officers.find(o => o.id === req.params.id);
  if (!o) return res.status(404).json({ error: 'Officer not found' });
  res.json(o);
});
app.post('/api/officers', (req, res) => {
  const o = { id: 'off' + Date.now(), ...req.body, status: 'active', currentLocation: null, assignedFIRs: [], assignedCases: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  officers.push(o);
  res.status(201).json(o);
});
app.put('/api/officers/:id', (req, res) => {
  const idx = officers.findIndex(o => o.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Officer not found' });
  officers[idx] = { ...officers[idx], ...req.body, updatedAt: new Date().toISOString() };
  auditLogs.unshift({ id: 'log' + Date.now(), userId: 'u1', user: users[0], action: 'UPDATE', entityType: 'OFFICER', entityId: req.params.id, oldValues: null, newValues: req.body, ipAddress: '192.168.1.1', userAgent: 'Chrome/120', createdAt: new Date().toISOString() });
  res.json(officers[idx]);
});
app.delete('/api/officers/:id', (req, res) => {
  const idx = officers.findIndex(o => o.id === req.params.id);
  if (idx >= 0) officers.splice(idx, 1);
  auditLogs.unshift({ id: 'log' + Date.now(), userId: 'u1', user: users[0], action: 'DELETE', entityType: 'OFFICER', entityId: req.params.id, oldValues: null, newValues: null, ipAddress: '192.168.1.1', userAgent: 'Chrome/120', createdAt: new Date().toISOString() });
  res.json({ message: 'Officer deleted successfully' });
});

// ---------------------------------------------------------------------------
// TRACKING
// ---------------------------------------------------------------------------
app.get('/api/tracking/stats', (_req, res) => {
  const total = officers.length;
  const active = officers.filter(o => o.status === 'active').length;
  const onLeave = officers.filter(o => o.status === 'on-leave').length;
  const inactive = officers.filter(o => o.status === 'inactive').length;
  const suspended = officers.filter(o => o.status === 'suspended').length;
  const training = officers.filter(o => o.status === 'training').length;
  const withLocation = officers.filter(o => o.currentLocation).length;
  const byRank = {};
  const byDistrict = {};
  const byUnitType = {};
  officers.forEach(o => {
    byRank[o.rank] = (byRank[o.rank] || 0) + 1;
    byDistrict[o.district] = (byDistrict[o.district] || 0) + 1;
    byUnitType[o.unitType || 'patrol'] = (byUnitType[o.unitType || 'patrol'] || 0) + 1;
  });
  res.json({ total, active, onLeave, inactive, suspended, training, withLocation, byRank, byDistrict, byUnitType });
});

app.get('/api/tracking/officers', (req, res) => {
  let result = [...officers];
  if (req.query.status) {
    const statuses = req.query.status.split(',').map(s => s.trim());
    result = result.filter(o => statuses.includes(o.status));
  }
  if (req.query.district) {
    const d = req.query.district.toLowerCase();
    result = result.filter(o => o.district.toLowerCase().includes(d));
  }
  if (req.query.rank) {
    const r = req.query.rank.toLowerCase();
    result = result.filter(o => o.rank.toLowerCase().includes(r));
  }
  if (req.query.unitType) {
    result = result.filter(o => o.unitType === req.query.unitType);
  }
  if (req.query.search) {
    const s = req.query.search.toLowerCase();
    result = result.filter(o => o.name.toLowerCase().includes(s) || o.badgeNumber.toLowerCase().includes(s) || o.district.toLowerCase().includes(s));
  }
  res.json(paginate(result, req.query));
});

app.patch('/api/tracking/officers/:id/status', (req, res) => {
  const idx = officers.findIndex(o => o.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Officer not found' });
  const oldStatus = officers[idx].status;
  officers[idx] = { ...officers[idx], status: req.body.status, updatedAt: new Date().toISOString() };
  notifications.unshift({ id: 'notif' + Date.now(), userId: 'u1', type: 'assignment', title: 'Officer Status Updated', message: `${officers[idx].name} status changed from ${oldStatus} to ${req.body.status}`, read: false, link: '/admin/live-tracking', priority: 'normal', createdAt: new Date().toISOString() });
  auditLogs.unshift({ id: 'log' + Date.now(), userId: 'u1', user: users[0], action: 'UPDATE', entityType: 'OFFICER', entityId: req.params.id, oldValues: { status: oldStatus }, newValues: { status: req.body.status }, ipAddress: '192.168.1.1', userAgent: 'Chrome/120', createdAt: new Date().toISOString() });
  res.json(officers[idx]);
});

app.patch('/api/tracking/officers/:id/location', (req, res) => {
  const idx = officers.findIndex(o => o.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Officer not found' });
  officers[idx] = { ...officers[idx], currentLocation: { latitude: req.body.latitude, longitude: req.body.longitude, timestamp: new Date().toISOString() }, updatedAt: new Date().toISOString() };
  res.json(officers[idx]);
});

app.post('/api/tracking/officers/:id/assign', (req, res) => {
  const idx = officers.findIndex(o => o.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Officer not found' });
  const now = new Date().toISOString();
  const firId = req.body.firId || '';
  const caseId = req.body.caseId || '';
  const updatedFIRs = firId && !officers[idx].assignedFIRs.includes(firId) ? [...officers[idx].assignedFIRs, firId] : officers[idx].assignedFIRs;
  const updatedCases = caseId && !officers[idx].assignedCases.includes(caseId) ? [...officers[idx].assignedCases, caseId] : officers[idx].assignedCases;
  officers[idx] = { ...officers[idx], assignedFIRs: updatedFIRs, assignedCases: updatedCases, updatedAt: now };
  notifications.unshift({ id: 'notif' + Date.now(), userId: 'u1', type: 'assignment', title: 'Officer Assigned', message: `${officers[idx].name} assigned to ${firId ? 'FIR ' + firId : ''}${caseId ? 'Case ' + caseId : ''}`, read: false, link: '/admin/live-tracking', priority: 'high', createdAt: now });
  auditLogs.unshift({ id: 'log' + Date.now(), userId: 'u1', user: users[0], action: 'UPDATE', entityType: 'OFFICER', entityId: req.params.id, oldValues: { assignedFIRs: officers[idx].assignedFIRs, assignedCases: officers[idx].assignedCases }, newValues: { assignedFIRs: updatedFIRs, assignedCases: updatedCases }, ipAddress: '192.168.1.1', userAgent: 'Chrome/120', createdAt: now });
  res.json(officers[idx]);
});

app.get('/api/tracking/nearby', (req, res) => {
  const lat = parseFloat(req.query.latitude) || 28.6;
  const lng = parseFloat(req.query.longitude) || 77.2;
  const maxDistance = parseFloat(req.query.maxDistance) || 10;
  const nearby = officers
    .filter(o => o.status === 'active' && o.currentLocation)
    .map(o => {
      const R = 6371;
      const dLat = (o.currentLocation.latitude - lat) * Math.PI / 180;
      const dLng = (o.currentLocation.longitude - lng) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat * Math.PI / 180) * Math.cos(o.currentLocation.latitude * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;
      return { ...o, distance: Math.round(distance * 100) / 100 };
    })
    .filter(o => o.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance);
  res.json({ officers: nearby });
});

// ---------------------------------------------------------------------------
// CRIME REPORTS
// ---------------------------------------------------------------------------
app.get('/api/crime-reports', (req, res) => res.json(paginate(ownerFilter(req, filterArray(crimeReports, req.query)), req.query)));
app.get('/api/crime-reports/:id', (req, res) => {
  const r = crimeReports.find(r => r.id === req.params.id);
  res.json(r || null);
});
app.post('/api/crime-reports', (req, res) => {
  const now = new Date().toISOString();
  const owner = req.auth && req.auth.role === 'citizen' ? req.auth.id : (req.body.userId || null);
  const anonymous = req.body.anonymous === true || req.body.anonymous === 'true';
  const report = { id: 'cr' + Date.now(), userId: owner, anonymous, user: anonymous ? null : (owner ? users.find(u => u.id === owner) || null : null), crimeType: req.body.crimeType, crimeCategory: req.body.crimeCategory || '', incidentDate: req.body.incidentDate, incidentTime: req.body.incidentTime || '', location: req.body.location, latitude: req.body.latitude || null, longitude: req.body.longitude || null, district: req.body.district, state: req.body.state || '', policeStation: req.body.policeStation || '', description: req.body.description, evidenceUrls: req.body.evidenceUrls || [], evidence: req.body.evidence || [], status: 'pending', assignedOfficerId: null, assignedOfficer: null, reviewedBy: null, reviewedAt: null, rejectionReason: null, requestInfoMessage: null, createdFIRId: null, createdAt: now, updatedAt: now };
  crimeReports.unshift(report);
  notifications.unshift({ id: 'notif' + Date.now(), userId: 'u1', type: 'crime_report', title: 'New Crime Report', message: `New ${report.crimeType} report from ${report.district} needs review.`, read: false, link: '/admin/crime-reports', priority: 'normal', createdAt: now });
  auditLogs.unshift({ id: 'log' + Date.now(), userId: req.body.userId || 'citizen', user: req.body.userId ? users.find(u => u.id === req.body.userId) || null : null, action: 'CREATE', entityType: 'CRIME_REPORT', entityId: report.id, oldValues: null, newValues: { crimeType: report.crimeType, district: report.district }, ipAddress: req.ip || '192.168.1.1', userAgent: req.headers['user-agent'] || 'CitizenApp', createdAt: now });
  res.json(report);
});
app.patch('/api/crime-reports/:id/review', (req, res) => {
  const idx = crimeReports.findIndex(r => r.id === req.params.id);
  if (idx < 0) return res.status(404).json({ message: 'Report not found' });
  const now = new Date().toISOString();
  crimeReports[idx] = { ...crimeReports[idx], status: 'under_review', updatedAt: now };
  auditLogs.unshift({ id: 'log' + Date.now(), userId: 'u1', user: users[0], action: 'UPDATE', entityType: 'CRIME_REPORT', entityId: req.params.id, oldValues: { status: 'pending' }, newValues: { status: 'under_review' }, ipAddress: '192.168.1.1', userAgent: 'Chrome/120', createdAt: now });
  res.json(crimeReports[idx]);
});
app.patch('/api/crime-reports/:id/assign', (req, res) => {
  const idx = crimeReports.findIndex(r => r.id === req.params.id);
  if (idx < 0) return res.status(404).json({ message: 'Report not found' });
  const now = new Date().toISOString();
  const officer = officers.find(o => o.id === req.body.officerId) || null;
  crimeReports[idx] = { ...crimeReports[idx], assignedOfficerId: req.body.officerId, assignedOfficer: officer, status: 'under_review', updatedAt: now };
  notifications.unshift({ id: 'notif' + Date.now(), userId: 'u1', type: 'assignment', title: 'Report Assigned', message: `Report ${crimeReports[idx].id} assigned to ${officer?.name || 'Officer'}`, read: false, link: '/admin/crime-reports', priority: 'normal', createdAt: now });
  auditLogs.unshift({ id: 'log' + Date.now(), userId: 'u1', user: users[0], action: 'UPDATE', entityType: 'CRIME_REPORT', entityId: req.params.id, oldValues: { assignedOfficerId: crimeReports[idx].assignedOfficerId }, newValues: { assignedOfficerId: req.body.officerId }, ipAddress: '192.168.1.1', userAgent: 'Chrome/120', createdAt: now });
  res.json(crimeReports[idx]);
});
app.patch('/api/crime-reports/:id/request-info', (req, res) => {
  const idx = crimeReports.findIndex(r => r.id === req.params.id);
  if (idx < 0) return res.status(404).json({ message: 'Report not found' });
  const now = new Date().toISOString();
  crimeReports[idx] = { ...crimeReports[idx], status: 'requested_info', requestInfoMessage: req.body.message || 'Please provide more details', updatedAt: now };
  notifications.unshift({ id: 'notif' + Date.now(), userId: crimeReports[idx].userId || 'u1', type: 'crime_report', title: 'More Information Required', message: `Police requested more info for report ${crimeReports[idx].id}: ${req.body.message || 'More details needed'}`, read: false, link: '/admin/crime-reports', priority: 'normal', createdAt: now });
  auditLogs.unshift({ id: 'log' + Date.now(), userId: 'u1', user: users[0], action: 'UPDATE', entityType: 'CRIME_REPORT', entityId: req.params.id, oldValues: { status: crimeReports[idx].status }, newValues: { status: 'requested_info', requestInfoMessage: req.body.message }, ipAddress: '192.168.1.1', userAgent: 'Chrome/120', createdAt: now });
  res.json(crimeReports[idx]);
});
app.post('/api/crime-reports/:id/approve', (req, res) => {
  const idx = crimeReports.findIndex(r => r.id === req.params.id);
  if (idx < 0) return res.status(404).json({ message: 'Report not found' });
  const now = new Date().toISOString();
  const r = crimeReports[idx];
  const newFirId = 'fir' + Date.now();
  const newFir = { id: newFirId, firNumber: `FIR-2024-${String(firs.length + 1).padStart(3, '0')}`, crimeType: r.crimeType, severity: 'medium', priority: 'medium', incidentDate: r.incidentDate, location: r.location, latitude: r.latitude, longitude: r.longitude, district: r.district, state: r.state || '', city: '', policeStation: r.policeStation || '', complainantName: r.user?.name || 'Citizen', complainantPhone: r.user?.phone || '', complainantEmail: r.user?.email || '', victims: [], suspects: [], witnesses: [], description: r.description, status: 'pending', assignedOfficerId: null, assignedOfficer: null, createdBy: r.userId || 'u1', closureReason: null, resolutionNotes: null, createdAt: now, updatedAt: now, closedAt: null };
  firs.unshift(newFir);
  crimeReports[idx] = { ...r, status: 'approved', reviewedBy: 'u1', reviewedAt: now, createdFIRId: newFirId, updatedAt: now };
  notifications.unshift({ id: 'notif' + Date.now(), userId: r.userId || 'u1', type: 'crime_report', title: 'Crime Report Approved', message: `Report ${r.id} approved. FIR ${newFir.firNumber} created.`, read: false, link: '/admin/fir-management', priority: 'normal', createdAt: now });
  auditLogs.unshift({ id: 'log' + Date.now(), userId: 'u1', user: users[0], action: 'UPDATE', entityType: 'CRIME_REPORT', entityId: req.params.id, oldValues: { status: r.status }, newValues: { status: 'approved', createdFIRId: newFirId }, ipAddress: '192.168.1.1', userAgent: 'Chrome/120', createdAt: now });
  res.json(crimeReports[idx]);
});
app.post('/api/crime-reports/:id/reject', (req, res) => {
  const idx = crimeReports.findIndex(r => r.id === req.params.id);
  if (idx < 0) return res.status(404).json({ message: 'Report not found' });
  const now = new Date().toISOString();
  crimeReports[idx] = { ...crimeReports[idx], status: 'rejected', reviewedBy: 'u1', reviewedAt: now, rejectionReason: req.body.reason, updatedAt: now };
  notifications.unshift({ id: 'notif' + Date.now(), userId: crimeReports[idx].userId || 'u1', type: 'crime_report', title: 'Crime Report Rejected', message: `Report ${crimeReports[idx].id} rejected. Reason: ${req.body.reason}`, read: false, link: '/admin/crime-reports', priority: 'normal', createdAt: now });
  auditLogs.unshift({ id: 'log' + Date.now(), userId: 'u1', user: users[0], action: 'UPDATE', entityType: 'CRIME_REPORT', entityId: req.params.id, oldValues: { status: crimeReports[idx].status }, newValues: { status: 'rejected', rejectionReason: req.body.reason }, ipAddress: '192.168.1.1', userAgent: 'Chrome/120', createdAt: now });
  res.json(crimeReports[idx]);
});
app.patch('/api/crime-reports/:id/archive', (req, res) => {
  const idx = crimeReports.findIndex(r => r.id === req.params.id);
  if (idx < 0) return res.status(404).json({ message: 'Report not found' });
  const now = new Date().toISOString();
  crimeReports[idx] = { ...crimeReports[idx], status: 'archived', updatedAt: now };
  auditLogs.unshift({ id: 'log' + Date.now(), userId: 'u1', user: users[0], action: 'UPDATE', entityType: 'CRIME_REPORT', entityId: req.params.id, oldValues: { status: crimeReports[idx].status }, newValues: { status: 'archived' }, ipAddress: '192.168.1.1', userAgent: 'Chrome/120', createdAt: now });
  res.json(crimeReports[idx]);
});
app.delete('/api/crime-reports/:id', (req, res) => {
  const idx = crimeReports.findIndex(r => r.id === req.params.id);
  if (idx >= 0) crimeReports.splice(idx, 1);
  auditLogs.unshift({ id: 'log' + Date.now(), userId: 'u1', user: users[0], action: 'DELETE', entityType: 'CRIME_REPORT', entityId: req.params.id, oldValues: null, newValues: null, ipAddress: '192.168.1.1', userAgent: 'Chrome/120', createdAt: new Date().toISOString() });
  res.json({ message: 'Report deleted' });
});

// ---------------------------------------------------------------------------
// SOS ALERTS
// ---------------------------------------------------------------------------
function filterSOSAlerts(arr, query) {
  let result = [...arr];
  if (query.status) {
    const statuses = query.status.split(',').map(s => s.trim());
    result = result.filter(a => statuses.includes(a.status));
  }
  if (query.alertType) {
    const types = query.alertType.split(',').map(s => s.trim());
    result = result.filter(a => types.includes(a.alertType));
  }
  if (query.priority) {
    const priorities = query.priority.split(',').map(s => s.trim());
    result = result.filter(a => priorities.includes(a.priority));
  }
  if (query.district) {
    const d = query.district.toLowerCase();
    result = result.filter(a => a.district && a.district.toLowerCase().includes(d));
  }
  if (query.search) {
    const s = query.search.toLowerCase();
    result = result.filter(a =>
      (a.user && a.user.name && a.user.name.toLowerCase().includes(s)) ||
      (a.locationAddress && a.locationAddress.toLowerCase().includes(s)) ||
      (a.description && a.description.toLowerCase().includes(s)) ||
      (a.district && a.district.toLowerCase().includes(s))
    );
  }
  if (query.dateFrom) {
    const from = new Date(query.dateFrom).getTime();
    result = result.filter(a => new Date(a.createdAt).getTime() >= from);
  }
  if (query.dateTo) {
    const to = new Date(query.dateTo).getTime();
    result = result.filter(a => new Date(a.createdAt).getTime() <= to);
  }
  return result;
}

app.get('/api/sos-alerts/stats', (_req, res) => {
  const total = sosAlerts.length;
  const pending = sosAlerts.filter(a => a.status === 'pending').length;
  const assigned = sosAlerts.filter(a => a.status === 'assigned').length;
  const inProgress = sosAlerts.filter(a => a.status === 'in-progress').length;
  const resolved = sosAlerts.filter(a => a.status === 'resolved').length;
  const cancelled = sosAlerts.filter(a => a.status === 'cancelled').length;
  const responseTimes = sosAlerts.filter(a => a.responseTime).map(a => a.responseTime);
  const avgResponseTime = responseTimes.length > 0 ? Math.round(responseTimes.reduce((s, t) => s + t, 0) / responseTimes.length) : 0;
  const byType = {};
  const byPriority = {};
  const byDistrict = {};
  sosAlerts.forEach(a => {
    byType[a.alertType] = (byType[a.alertType] || 0) + 1;
    byPriority[a.priority] = (byPriority[a.priority] || 0) + 1;
    if (a.district) byDistrict[a.district] = (byDistrict[a.district] || 0) + 1;
  });
  res.json({ total, pending, assigned, inProgress, resolved, cancelled, avgResponseTime, byType, byPriority, byDistrict });
});

app.get('/api/sos-alerts', (req, res) => {
      const filtered = filterSOSAlerts(sosAlerts, req.query);
      res.json(paginate(ownerFilter(req, filtered), req.query));
});

// Active SOS queue (drives the live monitoring view).
app.get('/api/sos/active', async (req, res, next) => {
  try {
    const params = [];
    let where = `status IN ('active','new','acknowledged','pending')`;
    if (req.query.status) {
      params.push(req.query.status);
      where = `status = $${params.length}`;
    }
    const { rows } = await db.query(
      `SELECT data FROM sos_alerts WHERE ${where} ORDER BY created_at DESC`,
      params
    );
    const alerts = rows.map(row => row.data);
    res.json({
      alerts,
      total: alerts.length,
      critical: alerts.filter(a => a.priority === 'critical' || a.priority === 'high').length,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/sos-alerts/nearby', (req, res) => {
  const lat = parseFloat(req.query.latitude) || 28.6;
  const lng = parseFloat(req.query.longitude) || 77.2;
  const maxDistance = parseFloat(req.query.maxDistance) || 10;
  const nearby = officers
    .filter(o => o.status === 'active' && o.currentLocation)
    .map(o => {
      const R = 6371;
      const dLat = (o.currentLocation.latitude - lat) * Math.PI / 180;
      const dLng = (o.currentLocation.longitude - lng) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat * Math.PI / 180) * Math.cos(o.currentLocation.latitude * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;
      return { ...o, distance: Math.round(distance * 100) / 100 };
    })
    .filter(o => o.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance);
  res.json({ officers: nearby });
});

app.get('/api/sos-alerts/:id', (req, res) => {
  const alert = sosAlerts.find(a => a.id === req.params.id);
  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  res.json(alert);
});

app.post('/api/sos-alerts', (req, res) => {
  const ownerId = req.auth && req.auth.role === 'citizen' ? req.auth.id : (req.body.userId || 'u3');
  const newAlert = {
    id: 'sos' + (sosAlerts.length + 1) + '-' + Date.now(),
    userId: ownerId,
    user: users.find(u => u.id === ownerId) || users[2],
    alertType: req.body.alertType || 'emergency',
    priority: req.body.priority || 'high',
    description: req.body.description || '',
    latitude: req.body.latitude || 28.6,
    longitude: req.body.longitude || 77.2,
    locationAddress: req.body.locationAddress || '',
    district: req.body.district || '',
    policeStation: req.body.policeStation || '',
    status: 'pending',
    assignedOfficerId: null,
    assignedOfficer: null,
    assignedAt: null,
    resolvedAt: null,
    responseTime: null,
    resolutionNotes: null,
    soundPlayed: false,
    contacted: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  sosAlerts.unshift(newAlert);
  notifications.unshift({ id: 'notif' + Date.now(), userId: 'u1', type: 'sos', title: 'New SOS Alert', message: `New ${newAlert.priority} ${newAlert.alertType} alert from ${newAlert.locationAddress || 'unknown location'}`, read: false, link: '/admin/sos-monitoring', priority: 'critical', createdAt: new Date().toISOString() });
  auditLogs.unshift({ id: 'log' + Date.now(), userId: 'u1', user: users[0], action: 'CREATE', entityType: 'SOS_ALERT', entityId: newAlert.id, oldValues: null, newValues: { alertType: newAlert.alertType, priority: newAlert.priority, status: 'pending' }, ipAddress: '192.168.1.1', userAgent: 'Chrome/120', createdAt: new Date().toISOString() });
  res.status(201).json(newAlert);
});

app.post('/api/sos-alerts/:id/assign', (req, res) => {
  const idx = sosAlerts.findIndex(a => a.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Alert not found' });
  const officer = officers.find(o => o.id === req.body.officerId) || null;
  const now = new Date().toISOString();
  const oldStatus = sosAlerts[idx].status;
  sosAlerts[idx] = { ...sosAlerts[idx], status: 'assigned', assignedOfficerId: req.body.officerId, assignedOfficer: officer, assignedAt: now, updatedAt: now };
  notifications.unshift({ id: 'notif' + Date.now(), userId: 'u1', type: 'assignment', title: 'SOS Alert Assigned', message: `SOS alert ${req.params.id} assigned to ${officer ? officer.name : 'officer'}`, read: false, link: '/admin/sos-monitoring', priority: 'high', createdAt: now });
  auditLogs.unshift({ id: 'log' + Date.now(), userId: 'u1', user: users[0], action: 'UPDATE', entityType: 'SOS_ALERT', entityId: req.params.id, oldValues: { status: oldStatus, assignedOfficerId: null }, newValues: { status: 'assigned', assignedOfficerId: req.body.officerId }, ipAddress: '192.168.1.1', userAgent: 'Chrome/120', createdAt: now });
  res.json(sosAlerts[idx]);
});

app.post('/api/sos-alerts/:id/resolve', (req, res) => {
  const idx = sosAlerts.findIndex(a => a.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Alert not found' });
  const now = new Date().toISOString();
  const oldStatus = sosAlerts[idx].status;
  const assignedTime = sosAlerts[idx].assignedAt ? new Date(sosAlerts[idx].assignedAt).getTime() : Date.now();
  const responseTime = Math.round((Date.now() - assignedTime) / 1000);
  sosAlerts[idx] = { ...sosAlerts[idx], status: 'resolved', resolutionNotes: req.body.resolutionNotes || '', resolvedAt: now, responseTime: sosAlerts[idx].responseTime || responseTime, updatedAt: now };
  notifications.unshift({ id: 'notif' + Date.now(), userId: 'u1', type: 'sos', title: 'SOS Alert Resolved', message: `SOS alert ${req.params.id} has been resolved`, read: false, link: '/admin/sos-monitoring', priority: 'normal', createdAt: now });
  auditLogs.unshift({ id: 'log' + Date.now(), userId: 'u1', user: users[0], action: 'UPDATE', entityType: 'SOS_ALERT', entityId: req.params.id, oldValues: { status: oldStatus }, newValues: { status: 'resolved', resolutionNotes: req.body.resolutionNotes }, ipAddress: '192.168.1.1', userAgent: 'Chrome/120', createdAt: now });
  res.json(sosAlerts[idx]);
});

app.post('/api/sos-alerts/:id/cancel', (req, res) => {
  const idx = sosAlerts.findIndex(a => a.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Alert not found' });
  const now = new Date().toISOString();
  const oldStatus = sosAlerts[idx].status;
  sosAlerts[idx] = { ...sosAlerts[idx], status: 'cancelled', resolutionNotes: req.body.reason || 'Cancelled by dispatcher', updatedAt: now };
  auditLogs.unshift({ id: 'log' + Date.now(), userId: 'u1', user: users[0], action: 'UPDATE', entityType: 'SOS_ALERT', entityId: req.params.id, oldValues: { status: oldStatus }, newValues: { status: 'cancelled' }, ipAddress: '192.168.1.1', userAgent: 'Chrome/120', createdAt: now });
  res.json(sosAlerts[idx]);
});

app.post('/api/sos-alerts/:id/sound', (req, res) => {
  const idx = sosAlerts.findIndex(a => a.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Alert not found' });
  sosAlerts[idx] = { ...sosAlerts[idx], soundPlayed: true, updatedAt: new Date().toISOString() };
  res.json(sosAlerts[idx]);
});

app.post('/api/sos-alerts/:id/contact', (req, res) => {
  const idx = sosAlerts.findIndex(a => a.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Alert not found' });
  sosAlerts[idx] = { ...sosAlerts[idx], contacted: true, updatedAt: new Date().toISOString() };
  res.json(sosAlerts[idx]);
});

// ---------------------------------------------------------------------------
// NOTIFICATIONS
// ---------------------------------------------------------------------------
app.get('/api/notifications', (req, res) => res.json(paginate(ownerFilter(req, notifications), req.query)));
app.post('/api/notifications/:id/read', (req, res) => {
  const n = notifications.find(n => n.id === req.params.id);
  if (n) n.read = true;
  res.json(n || { ...notifications[0], read: true });
});
app.post('/api/notifications/read-all', (_req, res) => {
  notifications.forEach(n => n.read = true);
  res.json({ message: 'All notifications marked as read' });
});
app.get('/api/notifications/unread-count', (_req, res) => {
  res.json(notifications.filter(n => !n.read).length);
});

// ---------------------------------------------------------------------------
// ANALYTICS - now uses real historical CSV data
// ---------------------------------------------------------------------------
app.get('/api/analytics/trends', (req, res) => {
  const yearTotals = {};
  historicalData.forEach(r => {
    if (!yearTotals[r.year]) yearTotals[r.year] = 0;
    yearTotals[r.year] += r.count;
  });
  const trends = allYears.map(y => ({ date: String(y), count: yearTotals[y] || 0, predicted: false }));
  const total = trends.reduce((s, t) => s + t.count, 0);
  const avg = Math.round(total / trends.length);
  res.json({
    trends,
    summary: {
      total,
      averagePerYear: avg,
      peakYear: trends.reduce((a, b) => a.count > b.count ? a : b).date,
      lowestYear: trends.reduce((a, b) => a.count < b.count ? a : b).date,
      trend: trends[trends.length - 1].count < trends[trends.length - 2].count ? 'decreasing' : 'increasing',
    },
  });
});

app.get('/api/analytics/district-comparison', (req, res) => {
  const latestYear = allYears[allYears.length - 1];
  const prevYear = latestYear - 1;
  const filter = {};
  if (req.query.crimeType) filter.crimeType = req.query.crimeType;
  if (req.query.state) filter.state = req.query.state;

  const currTotals = {};
  const prevTotals = {};
  historicalData.forEach(r => {
    if (r.year === latestYear && (!filter.crimeType || r.crimeType === filter.crimeType) && (!filter.state || r.state === filter.state)) {
      if (!currTotals[r.district]) currTotals[r.district] = 0;
      currTotals[r.district] += r.count;
    }
    if (r.year === prevYear && (!filter.crimeType || r.crimeType === filter.crimeType) && (!filter.state || r.state === filter.state)) {
      if (!prevTotals[r.district]) prevTotals[r.district] = 0;
      prevTotals[r.district] += r.count;
    }
  });
  const districts = Object.entries(currTotals)
    .map(([district, count]) => {
      const prev = prevTotals[district] || count;
      const change = prev > 0 ? Math.round(((count - prev) / prev) * 100) : 0;
      return { district, count, change };
    })
    .sort((a, b) => b.count - a.count)
    .map((d, i) => ({ ...d, rank: i + 1 }));

  res.json({ districts });
});

app.get('/api/analytics/seasonal-patterns', (req, res) => {
  const yearTotals = {};
  historicalData.forEach(r => {
    if (!yearTotals[r.year]) yearTotals[r.year] = {};
    if (!yearTotals[r.year][r.crimeType]) yearTotals[r.year][r.crimeType] = 0;
    yearTotals[r.year][r.crimeType] += r.count;
  });
  const yearlyAgg = allYears.map(y => {
    const crimeCounts = Object.values(yearTotals[y] || {});
    const total = crimeCounts.reduce((s, c) => s + c, 0);
    return { year: y, totalCount: total, crimeBreakdown: yearTotals[y] || {} };
  });
  res.json({ yearly: yearlyAgg, availableYears: allYears, availableCrimeTypes: allCrimeTypes.filter(c => c !== 'TOTAL IPC CRIMES') });
});

app.get('/api/analytics/hotspots', (req, res) => {
  const { riskLevel, crimeType, state, district, year } = req.query;
  const latestYear = year ? Number(year) : allYears[allYears.length - 1];
  const prevYear = latestYear - 1;

  const districtCoords = {
    'MUMBAI COMMR.': [19.0760, 72.8777], 'MUMBAI': [19.0760, 72.8777], 'BANGALORE COMMR.': [12.9716, 77.5946], 'BANGALORE': [12.9716, 77.5946],
    'KOLKATA': [22.5726, 88.3639], 'AHMEDABAD COMMR.': [23.0225, 72.5714], 'AHMEDABAD': [23.0225, 72.5714],
    'DELHI UT TOTAL': [28.7041, 77.1025], 'DELHI': [28.7041, 77.1025], 'NEW DELHI': [28.6139, 77.2090],
    'CHENNAI COMMR.': [13.0827, 80.2707], 'CHENNAI': [13.0827, 80.2707],
    'PUNE COMMR.': [18.5204, 73.8567], 'PUNE': [18.5204, 73.8567], 'SURAT COMMR.': [21.1702, 72.8311],
    'SURAT': [21.1702, 72.8311], 'JAIPUR': [26.9124, 75.7873], 'LUCKNOW': [26.8467, 80.9462],
    'KANPUR': [26.4499, 80.3311], 'NAGPUR': [21.1458, 79.0882], 'INDORE': [22.7196, 75.8577],
    'BHOPAL': [23.2599, 77.4126], 'PATNA': [25.6093, 85.1376], 'THANE': [19.2183, 72.9781],
    'VASAI VIRAR': [19.3919, 72.8397], 'KALYAN DOMBIVLI': [19.2403, 73.1300], 'RANGA REDDY': [17.2543, 78.3380],
    'HYDERABAD CITY': [17.3850, 78.4867], 'GAZIABAD': [28.6692, 77.4538], 'FARIDABAD': [28.4089, 77.3178],
    'LUDHIANA': [30.9010, 75.8573], 'BHUBANESWAR': [20.2961, 85.8245], 'COIMBATORE': [11.0168, 76.9558],
    'KOCHI': [9.9312, 76.2673], 'VISAKHAPATNAM': [17.6868, 83.2185], 'VIJAYAWADA': [16.5062, 80.6480],
    'SALEM': [11.6643, 78.1460], 'MALAPPURAM': [11.0510, 76.0711], 'ERNAKULAM': [9.9312, 76.2673],
    'NAGPUR RLY.': [21.1458, 79.0882], 'MADURAI': [9.9252, 78.1198], 'TRICHY RLY.': [10.7905, 78.7047],
    'CHENNAI RLY.': [13.0827, 80.2707], 'MUMBAI COMMR. RLY.': [19.0760, 72.8777], 'KOLKATA RLY.': [22.5726, 88.3639],
    'SIKAR': [27.6094, 75.1399], 'BHARATPUR': [27.2170, 77.4895], 'ALWAR': [27.5530, 76.6346],
    'AGRA': [27.1767, 78.0081], 'MEERUT': [28.9845, 77.7066], 'VARANASI': [25.3176, 82.9739],
    'PRAYAGRAJ': [25.4358, 81.8463], 'ALLAHABAD': [25.4358, 81.8463], 'BAREILLY': [28.3670, 79.4304],
    'GORAKHPUR': [26.7606, 83.3732], 'JHANSI': [25.4484, 78.5685], 'MUZAFFARPUR': [26.1209, 85.3647],
    'GAYA': [24.7960, 84.9940], 'BHAGALPUR': [25.2425, 86.9842],
    'GWALIOR': [26.2183, 78.1828], 'JABALPUR': [23.1815, 79.9864], 'RAIPUR': [21.2514, 81.6296],
    'BILASPUR': [22.0800, 82.1500], 'BHILAI': [21.2100, 81.4300], 'DURG': [21.1900, 81.2800],
    'RAJKOT COMMR.': [22.3039, 70.8022], 'RAJKOT': [22.3039, 70.8022], 'VADODARA COMMR.': [22.3072, 73.1812],
    'VADODARA': [22.3072, 73.1812], 'BHARUCH': [21.7051, 72.9959], 'JAMNAGAR': [22.4707, 70.0577],
    'GANDHINAGAR': [23.2156, 72.6369], 'ANAND': [22.5645, 72.9289],
    'SECUNDERABAD RLY.': [17.4399, 78.4983], 'VIJAYAWADA RLY.': [16.5062, 80.6480],
    'GUNTAKAL RLY.': [15.2667, 77.6333],
    'BANGALORE RURAL': [13.2200, 75.5800], 'TUMKUR': [13.3420, 77.1020], 'MYSORE': [12.2958, 76.6394],
    'BELGAUM': [15.8497, 74.4977], 'GULBARGA': [17.3297, 76.8343], 'BIJAPUR': [16.8302, 75.7100],
    'DAKSHIN KANNADA': [12.8700, 75.2700], 'HUBLI-DHARWAD': [15.3647, 75.1240],
    'JAIPUR RLY.': [26.9124, 75.7873], 'G.R.P. AJMER': [26.4499, 74.6399], 'G.R.P.JODHPUR': [26.2389, 73.0243],
    'PATNA RLY.': [25.6093, 85.1376], 'MUZAFFARPUR RLY.': [26.1209, 85.3647], 'KATIHAR RLY.': [25.5400, 87.5800],
    'CP JALANDHAR': [31.3260, 75.5762], 'AMRITSAR RLY.': [31.6300, 74.8700],
    'BHOPAL RLY.': [23.2599, 77.4126], 'JABALPUR RLY.': [23.1815, 79.9864], 'INDORE RLY.': [22.7196, 75.8577],
    '24 PARGANAS SOUTH': [22.3000, 88.4000], '24 PARGANAS NORTH': [22.7000, 88.4500],
    'HOOGHLY': [22.9000, 88.4000], 'HOWRAH': [22.5804, 88.2636],
    'SILIGURI': [26.7271, 88.4285], 'DARJEELING': [27.0360, 88.2627],
    'NORTH 24 PARGANAS': [22.7000, 88.4500], 'SOUTH 24 PARGANAS': [22.3000, 88.4000],
    'NAGAUR': [27.2000, 73.7800], 'TONK': [26.1600, 75.7900], 'KOTA': [25.2138, 75.8648],
    'AJMER': [26.4499, 74.6399], 'UDAIPUR': [24.5854, 73.7125], 'JODHPUR': [26.2389, 73.0243],
    'BHIWANDI': [19.3000, 73.0600], 'NAVI MUMBAI': [19.0330, 73.0297],
    'PONDICHERRY': [11.9416, 79.8083],
  };

  const districtTotals = {};
  const districtPrevYear = {};
  const crimeTypeTotals = {};

  historicalData.filter(r => isAdditiveCrimeType(r.crimeType) && !r.district.toUpperCase().includes('TOTAL')).forEach(r => {
    if (r.year === latestYear) {
      if (!districtTotals[r.district]) districtTotals[r.district] = { count: 0, crimes: {}, state: r.state };
      districtTotals[r.district].count += r.count;
      districtTotals[r.district].crimes[r.crimeType] = (districtTotals[r.district].crimes[r.crimeType] || 0) + r.count;
      crimeTypeTotals[r.crimeType] = (crimeTypeTotals[r.crimeType] || 0) + r.count;
    } else if (r.year === prevYear) {
      districtPrevYear[r.district] = (districtPrevYear[r.district] || 0) + r.count;
    }
  });

  const maxCount = Math.max(...Object.values(districtTotals).map(d => d.count), 1);
  let hotspots = Object.entries(districtTotals)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 50)
    .map(([district, data], i) => {
      const dominantCrime = Object.entries(data.crimes).sort((a, b) => b[1] - a[1])[0];
      const prevCount = districtPrevYear[district] || data.count;
      const yoyChange = prevCount > 0 ? Math.round(((data.count - prevCount) / prevCount) * 100) : 0;
      const coords = districtCoords[district] || getDistrictCoords(district, data.state);
      const intensity = Math.round((data.count / maxCount) * 100);
      const riskLevel = intensity >= 75 ? 'critical' : intensity >= 50 ? 'high' : intensity >= 25 ? 'moderate' : 'low';

      const topCrimes = Object.entries(data.crimes).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([type, count]) => ({
        type, count, percentage: Math.round((count / data.count) * 100)
      }));

      const riskScore = Math.min(100, Math.round(intensity * 0.6 + Math.abs(yoyChange) * 0.3 + (topCrimes.length > 0 ? topCrimes[0].percentage * 0.1 : 0)));
      const prediction = yoyChange > 15 ? 'High crime expected' : yoyChange > 5 ? 'Moderate increase likely' : yoyChange < -10 ? 'Crime decreasing' : 'Stable levels expected';
      const recommendation = riskScore > 80 ? 'Deploy 3+ patrol units, increase CCTV monitoring' : riskScore > 60 ? 'Deploy 2 patrol units, monitor closely' : riskScore > 40 ? 'Maintain current patrol levels' : 'Standard monitoring sufficient';

      return {
        id: `hs${i + 1}`, district, state: data.state, crimeCount: data.count,
        dominantCrimeType: dominantCrime ? dominantCrime[0] : 'Unknown',
        intensity, latitude: coords[0], longitude: coords[1],
        riskLevel, yoyChange, trend: yoyChange > 5 ? 'increasing' : yoyChange < -5 ? 'decreasing' : 'stable',
        topCrimes, riskScore, prediction, recommendation,
        lastUpdated: new Date().toISOString(),
      };
    });

  if (riskLevel) hotspots = hotspots.filter(h => h.riskLevel === riskLevel);
  if (crimeType) hotspots = hotspots.filter(h => h.topCrimes.some(c => c.type === crimeType));
  if (state) hotspots = hotspots.filter(h => h.state.toUpperCase().includes(state.toUpperCase()));
  if (district) hotspots = hotspots.filter(h => h.district.toUpperCase().includes(district.toUpperCase()));

  const criticalCount = hotspots.filter(h => h.riskLevel === 'critical').length;
  const highCount = hotspots.filter(h => h.riskLevel === 'high').length;
  const moderateCount = hotspots.filter(h => h.riskLevel === 'moderate').length;
  const lowCount = hotspots.filter(h => h.riskLevel === 'low').length;

  const crimeTypeList = Object.entries(crimeTypeTotals).sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, count }));
  const stateList = [...new Set(historicalData.filter(r => r.year === latestYear && !r.district.toUpperCase().includes('TOTAL')).map(r => r.state))].sort();

  res.json({
    hotspots,
    summary: { total: hotspots.length, critical: criticalCount, high: highCount, moderate: moderateCount, low: lowCount },
    filters: { crimeTypes: crimeTypeList, states: stateList, years: allYears },
    detectedAt: new Date().toISOString(),
  });
});

app.get('/api/analytics/hotspots/:id', (req, res) => {
  const hotspot = decodeURIComponent(req.params.id);
  const latestYear = allYears[allYears.length - 1];

  const districtCoords = {
    'MUMBAI COMMR.': [19.0760, 72.8777], 'BANGALORE COMMR.': [12.9716, 77.5946], 'KOLKATA': [22.5726, 88.3639],
    'AHMEDABAD COMMR.': [23.0225, 72.5714], 'DELHI UT TOTAL': [28.7041, 77.1025], 'CHENNAI COMMR.': [13.0827, 80.2707],
    'PUNE COMMR.': [18.5204, 73.8567], 'SURAT COMMR.': [21.1702, 72.8311], 'JAIPUR': [26.9124, 75.7873],
    'LUCKNOW': [26.8467, 80.9462], 'KANPUR': [26.4499, 80.3311], 'NAGPUR': [21.1458, 79.0882],
    'INDORE': [22.7196, 75.8577], 'BHOPAL': [23.2599, 77.4126], 'PATNA': [25.6093, 85.1376],
  };

  const yearData = {};
  const crimeTypeData = {};
  let state = '';
  historicalData.filter(r => r.district.toUpperCase().includes(hotspot.toUpperCase()) && isAdditiveCrimeType(r.crimeType)).forEach(r => {
    state = r.state;
    yearData[r.year] = (yearData[r.year] || 0) + r.count;
    crimeTypeData[r.crimeType] = (crimeTypeData[r.crimeType] || 0) + r.count;
  });

  const totalCrimes = Object.values(yearData).reduce((s, v) => s + v, 0);
  const latestCount = yearData[latestYear] || 0;
  const prevCount = yearData[latestYear - 1] || latestCount;
  const yoyChange = prevCount > 0 ? Math.round(((latestCount - prevCount) / prevCount) * 100) : 0;
  const last30Days = Math.round(latestCount * 0.08);
  const last12Months = latestCount;

  const coords = districtCoords[hotspot] || [20.5937, 78.9629];
  const crimeBreakdown = Object.entries(crimeTypeData).sort((a, b) => b[1] - a[1]).map(([type, count]) => ({
    type, count, percentage: Math.round((count / totalCrimes) * 100)
  }));

  const yearTrend = Object.entries(yearData).sort((a, b) => a[0] - b[0]).map(([year, count]) => ({ year: Number(year), count }));

  const intensity = latestCount > 0 ? Math.min(100, Math.round(latestCount / 500)) : 0;
  const riskScore = Math.min(100, Math.round(intensity * 0.6 + Math.abs(yoyChange) * 0.3));

  const activeFIRs = Math.round(latestCount * 0.15);
  const pendingCases = Math.round(latestCount * 0.22);
  const solvedCases = Math.round(latestCount * 0.63);

  const districtSos = sosAlerts.filter(a => String(a.district || '').toUpperCase().includes(String(hotspot || '').toUpperCase()));
  const activeSos = districtSos.filter(a => a.status === 'active' || a.status === 'new' || a.status === 'acknowledged');
  const resolvedSos = districtSos.filter(a => a.status === 'resolved');
  const lastSosAt = districtSos
    .map(a => new Date(a.createdAt || a.timestamp || 0).getTime())
    .filter(t => t > 0)
    .sort((a, b) => b - a)[0];
  const lastSosHours = lastSosAt ? Math.max(0, Math.round((Date.now() - lastSosAt) / 3600000)) : null;
  const sosDays = districtSos.length ? Math.max(1, Math.round((Date.now() - new Date(districtSos[districtSos.length - 1].createdAt || Date.now()).getTime()) / 86400000)) : 1;
  const sosAlertsPayload = {
    active: activeSos.length,
    lastSOS: lastSosHours === null ? 'no data' : `${lastSosHours}h ago`,
    emergencyFrequency: `${(districtSos.length / sosDays).toFixed(1)}/day`,
    total: districtSos.length,
    resolved: resolvedSos.length,
  };
  res.json({
    district: hotspot, state, latitude: coords[0], longitude: coords[1],
    totalCrimes, latestYearCount: latestCount, yoyChange, last30Days, last12Months,
    crimeBreakdown, yearTrend, riskScore, intensity,
    prediction: yoyChange > 15 ? 'High crime expected' : yoyChange > 5 ? 'Moderate increase likely' : 'Stable levels expected',
    recommendation: riskScore > 80 ? 'Deploy 3+ patrol units, increase CCTV monitoring, night patrols mandatory' : riskScore > 60 ? 'Deploy 2 patrol units, increase monitoring frequency' : 'Maintain current patrol levels',
    fir: { active: activeFIRs, pending: pendingCases, solved: solvedCases, officerAssigned: 'Inspector ' + (state ? state.charAt(0) + state.slice(1).toLowerCase() : 'Zone') + ' HQ' },
    sosAlerts: sosAlertsPayload,
    areaInfo: { state, district: hotspot, policeStation: hotspot + ' PS', city: hotspot, coordinates: { lat: coords[0], lng: coords[1] } },
  });
});

app.get('/api/analytics/full', (req, res) => {
  const { year, state, crimeType, district } = req.query;
  const latestYear = year ? Number(year) : allYears[allYears.length - 1];
  const prevYear = latestYear - 1;

  // Only additive crime types may be summed when no single type is requested:
  // 'TOTAL IPC CRIMES' and the RAPE / KIDNAPPING & ABDUCTION / THEFT roll-ups
  // overlap their children and would inflate the total.
  const hasTypeFilter = Boolean(crimeType);
  const keepRow = r =>
    !r.district.toUpperCase().includes('TOTAL') &&
    (hasTypeFilter || isAdditiveCrimeType(r.crimeType));

  let filtered = historicalData.filter(keepRow);
  if (year) filtered = filtered.filter(r => r.year === Number(year));
  if (state) filtered = filtered.filter(r => r.state.toUpperCase().includes(state.toUpperCase()));
  if (crimeType) filtered = filtered.filter(r => r.crimeType === crimeType);
  if (district) filtered = filtered.filter(r => r.district.toUpperCase().includes(district.toUpperCase()));

  // KPI Cards
  const totalCrimes = filtered.reduce((s, r) => s + r.count, 0);

  // Crime growth is a like-for-like year-on-year comparison for the reference
  // year (the selected year, or the latest year in the dataset).
  const curYearTotal = historicalData
    .filter(r => keepRow(r) && r.year === latestYear &&
      (!state || r.state.toUpperCase().includes(state.toUpperCase())) &&
      (!district || r.district.toUpperCase().includes(district.toUpperCase())))
    .reduce((s, r) => s + r.count, 0);
  const prevYearTotal = historicalData
    .filter(r => keepRow(r) && r.year === prevYear &&
      (!state || r.state.toUpperCase().includes(state.toUpperCase())) &&
      (!district || r.district.toUpperCase().includes(district.toUpperCase())))
    .reduce((s, r) => s + r.count, 0);
  const crimeGrowth = prevYearTotal > 0 ? Math.round(((curYearTotal - prevYearTotal) / prevYearTotal) * 100) : 0;

  // Live operational records (never merged into the historical dataset totals)
  let liveFIRs = firs.length;
  let liveSolved = firs.filter(f => f.status === 'closed').length;
  let livePending = firs.filter(f => f.status === 'investigation').length;
  let liveActiveCases = cases.filter(c => c.status === 'active').length;
  let liveCrimeReports = crimeReports.length;

  const estimatedFIRs = Math.round(totalCrimes * 0.35) + liveFIRs;
  const solvedCases = Math.round(estimatedFIRs * 0.58) + liveSolved;
  const pendingCases = estimatedFIRs - solvedCases + livePending;

  // Monthly Trend (Jan-Dec across all years)
  const monthlyTrend = {};
  for (let m = 1; m <= 12; m++) monthlyTrend[m] = { month: m, name: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m-1], count: 0 };
  historicalData.filter(keepRow).forEach(r => {
    const monthIdx = (r.year - 2001) % 12 + 1;
    if (!year || r.year === Number(year)) monthlyTrend[monthIdx].count += r.count;
  });
  const monthlyData = Object.values(monthlyTrend);

  // Yearly Trend
  const yearlyTrend = allYears.map(y => {
    const count = historicalData.filter(r => r.year === y && keepRow(r)).reduce((s, r) => s + r.count, 0);
    return { year: y, count };
  });

  // Crime Type Breakdown
  const crimeTypeMap = {};
  filtered.forEach(r => { crimeTypeMap[r.crimeType] = (crimeTypeMap[r.crimeType] || 0) + r.count; });
  const crimeTypes = Object.entries(crimeTypeMap).sort((a, b) => b[1] - a[1]).map(([type, count]) => ({
    type, count, percentage: totalCrimes > 0 ? Math.round((count / totalCrimes) * 100) : 0
  }));

  // Top 10 Districts (keyed by state|district so same-named districts in
  // different states are never merged)
  const districtMap = {};
  filtered.forEach(r => {
    const key = `${r.state}\u0000${r.district}`;
    if (!districtMap[key]) districtMap[key] = { state: r.state, district: r.district, count: 0 };
    districtMap[key].count += r.count;
  });
  const prevDistrictMap = {};
  historicalData
    .filter(r => keepRow(r) && r.year === prevYear &&
      (!state || r.state.toUpperCase().includes(state.toUpperCase())) &&
      (!district || r.district.toUpperCase().includes(district.toUpperCase())))
    .forEach(r => {
      const key = `${r.state}\u0000${r.district}`;
      prevDistrictMap[key] = (prevDistrictMap[key] || 0) + r.count;
    });
  const districts = Object.values(districtMap).sort((a, b) => b.count - a.count).slice(0, 10).map(d => {
    const prev = prevDistrictMap[`${d.state}\u0000${d.district}`] || d.count;
    return { district: d.district, state: d.state, count: d.count, change: prev > 0 ? Math.round(((d.count - prev) / prev) * 100) : 0 };
  });

  // State Breakdown
  const stateMap = {};
  filtered.forEach(r => { stateMap[r.state] = (stateMap[r.state] || 0) + r.count; });
  const stateData = Object.entries(stateMap).sort((a, b) => b[1] - a[1]).map(([state, count]) => ({
    state, count, percentage: totalCrimes > 0 ? Math.round((count / totalCrimes) * 100) : 0
  }));

  // Crime by Time of Day (estimated: theft/burglary = night, assault = evening, etc.)
  const timeOfDay = { Morning: 0, Afternoon: 0, Evening: 0, Night: 0 };
  const timeRules = {
    'MURDER': 'Night', 'ASSAULT': 'Evening', 'ROBBERY': 'Night', 'BURGLARY': 'Night',
    'THEFT': 'Afternoon', 'AUTO THEFT': 'Night', 'RIOT': 'Evening', 'CHEATING': 'Afternoon',
    'CRIMINAL BREACH OF TRUST': 'Afternoon', 'KIDNAPPING': 'Night', 'ARSON': 'Night',
    'HURT/GREVIOUS HURT': 'Evening', 'DOWRY DEATH': 'Night', 'CRUELTY BY HUSBAND': 'Night',
    'SEXUAL ASSAULT': 'Night', 'DOMESTIC VIOLENCE': 'Night', 'POCSO': 'Afternoon',
    'TRAFFIC OFFENCES': 'Morning', 'DRUG OFFENCES': 'Night', 'FIRE ARM OFFENCES': 'Night',
    'CRIMINAL INTIMIDATION': 'Evening', 'CULPABLE HOMICIDE': 'Night', 'COUNTERFEITING': 'Afternoon',
  };
  filtered.forEach(r => {
    const t = timeRules[r.crimeType] || 'Afternoon';
    timeOfDay[t] += r.count;
  });
  const crimeByTime = Object.entries(timeOfDay).map(([time, count]) => ({
    time, count, percentage: totalCrimes > 0 ? Math.round((count / totalCrimes) * 100) : 0
  }));

  // Crime by Day of Week (estimated distribution)
  const dayOfWeek = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const dayWeights = [0.13, 0.13, 0.14, 0.14, 0.15, 0.16, 0.15];
  const crimeByDay = dayOfWeek.map((day, i) => ({
    day, count: Math.round(totalCrimes * dayWeights[i]), percentage: Math.round(dayWeights[i] * 100)
  }));

  // Crime by Age Group (estimated)
  const ageGroups = [
    { group: '0-18', percentage: 8 },
    { group: '19-30', percentage: 35 },
    { group: '31-45', percentage: 28 },
    { group: '46-60', percentage: 18 },
    { group: '60+', percentage: 11 },
  ];
  const crimeByAge = ageGroups.map(a => ({ ...a, count: Math.round(totalCrimes * a.percentage / 100) }));

  // Crime by Gender (estimated)
  const genderData = [
    { gender: 'Male', percentage: 52, count: Math.round(totalCrimes * 0.52) },
    { gender: 'Female', percentage: 38, count: Math.round(totalCrimes * 0.38) },
    { gender: 'Other', percentage: 10, count: Math.round(totalCrimes * 0.10) },
  ];

  // FIR Analytics
  const firAnalytics = {
    total: estimatedFIRs,
    pending: pendingCases,
    solved: solvedCases,
    avgInvestigationDays: 42,
    closedRate: Math.round((solvedCases / estimatedFIRs) * 100),
  };

  // Officer Performance (simulated)
  const officers = [
    { name: 'Insp. Rajesh Kumar', assigned: 142, solved: 98, responseTime: '12 min', active: 44 },
    { name: 'SI Priya Sharma', assigned: 128, solved: 89, responseTime: '15 min', active: 39 },
    { name: 'HC Amit Patel', assigned: 115, solved: 72, responseTime: '18 min', active: 43 },
    { name: 'Const. Vikram Singh', assigned: 98, solved: 61, responseTime: '20 min', active: 37 },
    { name: 'Insp. Neha Gupta', assigned: 134, solved: 95, responseTime: '11 min', active: 39 },
  ];

  // SOS Analytics
  const sosData = {
    total: Math.round(totalCrimes * 0.002),
    avgResponseTime: '8 min',
    areaDistribution: stateData.slice(0, 5).map(s => ({ area: s.state, count: Math.round(s.count * 0.002) })),
    frequency: Math.round(totalCrimes * 0.002 / 365 * 10) / 10,
  };

  // AI Predictions
  const aiPredictions = districts.slice(0, 5).map(d => ({
    district: d.district, riskScore: Math.min(100, Math.round(d.count / 10000)),
    prediction: d.change > 10 ? 'High Crime Expected' : d.change > 0 ? 'Moderate Increase' : 'Stable/Decreasing',
    confidence: modelMetrics.avgConfidence,
    recommendation: d.change > 10 ? 'Increase patrol by 50%' : d.change > 0 ? 'Maintain current patrol' : 'Standard monitoring',
  }));

  // Risk Score by District
  const riskScores = districts.slice(0, 15).map(d => ({
    district: d.district, riskScore: Math.min(100, Math.round(d.count / 800)),
    trend: d.change > 5 ? 'increasing' : d.change < -5 ? 'decreasing' : 'stable',
    change: d.change,
  }));

  // Filters available
  const filters = {
    years: allYears,
    states: allStates,
    crimeTypes: allCrimeTypes.filter(c => c !== 'TOTAL IPC CRIMES'),
    districts: allDistricts,
  };

  res.json({
    kpi: {
      totalCrimes,
      activeFIRs: estimatedFIRs,
      solvedCases,
      pendingCases,
      crimeGrowth,
      avgResponseTime: '14 min',
      liveFIRs,
      liveActiveCases,
      liveCrimeReports,
      // Every figure above except the live* fields is derived from the
      // historical NCRB dataset or a documented estimate â€” see `estimates`.
      estimates: {
        activeFIRs: 'Reported crimes x 0.35 + live FIRs',
        solvedCases: 'Estimated FIRs x 0.58 + closed live FIRs',
        pendingCases: 'Estimated FIRs - estimated solved + live pending FIRs',
        avgResponseTime: 'Static demonstration value',
        monthlyTrend: 'Years cyclically mapped to Jan-Dec (dataset has no month field)',
        crimeByTime: 'Rule-based classification of crime types',
        crimeByDay: 'Fixed day-of-week weights',
        crimeByAge: 'Fixed age-band distribution',
        crimeByGender: 'Fixed gender distribution',
        officerPerformance: 'Static demonstration roster',
        sosData: 'Derived from historical total x 0.002',
      },
    },
    monthlyTrend: monthlyData,
    yearlyTrend,
    crimeTypes,
    districts,
    states: stateData,
    crimeByTime,
    crimeByDay,
    crimeByAge,
    crimeByGender: genderData,
    firAnalytics,
    officerPerformance: officers,
    sosData,
    aiPredictions,
    riskScores,
    filters,
    summary: {
      totalCrimes,
      crimeGrowth,
      topDistrict: districts[0]?.district ?? '-',
      topCrime: crimeTypes[0]?.type ?? '-',
      totalDistricts: Object.keys(districtMap).length,
      totalStates: new Set(filtered.map(r => r.state)).size,
      referenceYear: latestYear,
      datasetRows: historicalData.length,
    },
  });
});

app.get('/api/analytics/historical', (req, res) => {
  const filtered = filterHistorical(req.query);
  // Totals only over additive crime types and real districts; the raw rows
  // (including state sub-total rows) are still returned for the table view.
  const additive = filtered.filter(r => isAdditiveCrimeType(r.crimeType) && !r.district.toUpperCase().includes('TOTAL'));
  const total = additive.reduce((s, r) => s + r.count, 0);
  const years = [...new Set(filtered.map(r => r.year))].sort();
  const yearlyAvg = years.length > 0 ? Math.round(total / years.length) : 0;
  const prevYearTotal = additive.filter(r => r.year === (allYears[allYears.length - 1] || 0) - 1).reduce((s, r) => s + r.count, 0);
  const currYearTotal = additive.filter(r => r.year === (allYears[allYears.length - 1] || 0)).reduce((s, r) => s + r.count, 0);
  const trend = currYearTotal < prevYearTotal ? 'decreasing' : 'increasing';

  res.json({
    data: filtered,
    summary: { total, yearlyAverage: yearlyAvg, trend, recordCount: filtered.length },
    filters: { states: allStates, districts: allDistricts, years: allYears, crimeTypes: allCrimeTypes },
  });
});

app.get('/api/analytics/combined', (req, res) => {
  const latestYear = allYears[allYears.length - 1];
  const histByDistrict = {};
  historicalData.filter(r => r.year === latestYear && r.crimeType === 'THEFT' && !r.district.toUpperCase().includes('TOTAL')).forEach(r => {
    if (!histByDistrict[r.district]) histByDistrict[r.district] = 0;
    histByDistrict[r.district] += r.count;
  });
  const histValues = Object.values(histByDistrict);
  const histAvg = histValues.length > 0 ? Math.round(histValues.reduce((s, v) => s + v, 0) / histValues.length) : 0;

  const liveThefts = firs.filter(f => (f.crimeType || '').toUpperCase() === 'THEFT').slice(0, 5);
  const liveTheftCount = firs.filter(f => (f.crimeType || '').toUpperCase() === 'THEFT').length;

  return res.json({
    historical: Object.entries(histByDistrict).map(([district, count]) => ({ district, year: latestYear, crimeType: 'THEFT', count })),
    live: liveThefts,
    comparison: {
      historicalAverage: histAvg,
      currentPeriod: liveTheftCount,
      change: histAvg > 0 ? Math.round(((liveTheftCount - histAvg) / histAvg) * 100) : 0,
      trend: liveTheftCount > histAvg ? 'increasing' : 'decreasing',
      note: 'Live figures are current operational FIR records and are not comparable in scale to the 2001-2012 dataset.',
    },
  });
});

// ---------------------------------------------------------------------------
// PREDICTIONS - now uses historical data
// ---------------------------------------------------------------------------

app.get('/api/predictions/stats', (_req, res) => {
  const latestYear = allYears[allYears.length - 1];
  const prevYear = allYears.length > 1 ? allYears[allYears.length - 2] : latestYear;
  const districtRiskScores = predictionDistricts.slice(0, 15).map(d => {
    const districtRows = historicalData.filter(r => r.district === d && isAdditiveCrimeType(r.crimeType));
    const curr = districtRows.filter(r => r.year === latestYear).reduce((s, r) => s + r.count, 0);
    const prev = districtRows.filter(r => r.year === prevYear).reduce((s, r) => s + r.count, 0);
    // Average over the years the district actually appears in - districts were
    // not reported in every year of the dataset.
    const yearsPresent = new Set(districtRows.map(r => r.year)).size;
    const avg = districtRows.reduce((s, r) => s + r.count, 0) / Math.max(1, yearsPresent);
    const score = Math.min(100, Math.max(10, Math.round((curr / (avg || 1)) * 50)));
    return { district: d, score, level: score >= 75 ? 'high' : score >= 40 ? 'medium' : 'low', change: prev > 0 ? Math.round(((curr - prev) / prev) * 100) : 0 };
  });
  const highRisk = districtRiskScores.filter(d => d.level === 'high').length;
  const totalPredictions = districtRiskScores.length * predictionCrimeTypes.length;
  const { avgConfidence, modelAccuracy } = modelMetrics;
  const stateDistrictPairs = new Set(
    historicalData
      .filter(r => !r.district.toUpperCase().includes('TOTAL'))
      .map(r => `${r.state}\u0000${r.district}`),
  ).size;
  res.json({
    totalPredictions,
    highRiskDistricts: highRisk,
    avgConfidence,
    modelAccuracy,
    accuracyDefinition: 'Backtest accuracy: 100 minus volume-weighted mean absolute percentage error of a 3-year moving-average forecast against published counts.',
    confidenceDefinition: 'Confidence: 100 minus mean coefficient of variation of the historical series.',
    districts: districtRiskScores,
    totalDistricts: stateDistrictPairs,
    totalDistrictNames: predictionDistricts.length,
    totalStates: allStates.length,
    totalCrimeTypes: predictionCrimeTypes.length,
  });
});

app.get('/api/predictions/forecast', (req, res) => {
  const district = req.query.district || 'MUMBAI COMMR.';
  const crimeType = req.query.crimeType || 'THEFT';
  const period = req.query.period || '30d';

  const matching = historicalData.filter(r =>
    r.district.toUpperCase().includes(district.toUpperCase()) &&
    r.crimeType.toUpperCase() === crimeType.toUpperCase()
  );
  const yearTotals = {};
  matching.forEach(r => { yearTotals[r.year] = (yearTotals[r.year] || 0) + r.count; });
  const vals = Object.values(yearTotals);
  const avg = vals.length > 0 ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
  const latest = vals[vals.length - 1] || avg;
  const prevYearVal = vals.length >= 2 ? vals[vals.length - 2] : avg;
  const trend = vals.length >= 2 ? (latest > prevYearVal ? 'increasing' : latest < prevYearVal ? 'decreasing' : 'stable') : 'stable';
  const pctChange = avg > 0 ? Math.round(((latest - avg) / avg) * 100) : 0;
  const multiplier = period === '7d' ? 0.25 : period === '90d' ? 3 : 1;
  const forecast = Math.round(avg * (1 + pctChange / 200) * multiplier);

  // Spread of the series - drives both the reported confidence and the
  // forecast bands, so neither number is made up.
  const meanVal = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  const varianceVal = vals.length ? vals.reduce((s, v) => s + (v - meanVal) * (v - meanVal), 0) / vals.length : 0;
  const cv = meanVal > 0 ? Math.sqrt(varianceVal) / meanVal : 1;
  const confidence = Math.max(0, Math.min(99, Math.round((1 - cv) * 100)));

  // Historical trend data per year
  const trendData = allYears.map(y => {
    const count = historicalData.filter(r => r.district.toUpperCase().includes(district.toUpperCase()) && r.crimeType.toUpperCase() === crimeType.toUpperCase() && r.year === y).reduce((s, r) => s + r.count, 0);
    return { year: y, count, predicted: false };
  });

  // Monthly projections (6 months ahead)
  const now = new Date();
  const monthlyBase = Math.round(latest / 12) || Math.round(avg / 12) || 1;
  const monthlyGrowth = trend === 'increasing' ? 1.04 : trend === 'decreasing' ? 0.96 : 1.0;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const projections = [];
  for (let i = 1; i <= 6; i++) {
    const projDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const mIdx = projDate.getMonth();
    const projected = Math.round(monthlyBase * Math.pow(monthlyGrowth, i));
    const band = Math.max(0.05, cv);
    projections.push({
      month: `${projDate.getFullYear()}-${String(mIdx + 1).padStart(2, '0')}`,
      label: `${monthNames[mIdx]} ${projDate.getFullYear()}`,
      predicted: projected,
      low: Math.round(projected * (1 - band)),
      high: Math.round(projected * (1 + band)),
    });
  }

  // Historical yearly breakdown for chart (uses dataset years 2001-2012)
  const histMonthly = allYears.map(yr => {
    const mCount = historicalData.filter(r =>
      r.district.toUpperCase().includes(district.toUpperCase()) &&
      r.crimeType.toUpperCase() === crimeType.toUpperCase() &&
      r.year === yr
    ).reduce((s, r) => s + r.count, 0);
    return { month: String(yr), label: String(yr), actual: mCount };
  });

  // The dataset is annual, so there is no day-of-week information to report.
  const peakDays = [];

  // Dynamic contributing factors based on actual data
  const factors = [];
  if (pctChange > 10) factors.push(`Strong upward trend: ${pctChange}% increase over historical average`);
  else if (pctChange < -10) factors.push(`Declining trend: ${Math.abs(pctChange)}% decrease over historical average`);
  else factors.push(`Stable trend with ${Math.abs(pctChange)}% variation from average`);
  factors.push(`District crime density: ${latest.toLocaleString()} cases in latest year`);
  if (vals.length >= 3) factors.push(`${vals.length}-year historical pattern analysis`);
  factors.push(`Year-to-year volatility: ${Math.round(cv * 100)}% coefficient of variation`);
  if (forecast > avg) factors.push(`Forecast exceeds historical average by ${Math.round(((forecast - avg) / (avg || 1)) * 100)}%`);

  res.json({
    district, crimeType, period,
    forecastedCount: forecast || latest || 42,
    confidence,
    trendDirection: trend,
    percentageChange: pctChange,
    peakDays,
    contributingFactors: factors,
    historicalAverage: avg,
    recentTrend: latest,
    historicalDataPoints: vals,
    trendData,
    projections,
    histMonthly,
    recommendations: {
      officerCount: Math.max(5, Math.round((forecast || latest) / 10)),
      patrolShifts: trend === 'increasing' ? ['Morning (6-14)', 'Evening (14-22)', 'Night (22-6)'] : ['Morning (6-14)', 'Evening (14-22)'],
      priorityAreas: ['Market areas', 'Residential colonies', 'Commercial zones'].slice(0, trend === 'increasing' ? 3 : 2),
      preventiveMeasures: trend === 'increasing'
        ? ['Community policing', 'CCTV surveillance', 'Night patrol increase', 'Public awareness campaigns']
        : ['Community policing', 'CCTV surveillance'],
    },
    generatedAt: new Date().toISOString(),
    modelVersion: 'v2.1.0',
  });
});

app.get('/api/predictions/all-districts', (req, res) => {
  const crimeType = (req.query.crimeType || 'THEFT').toUpperCase();
  const period = req.query.period || '30d';
  const multiplier = period === '7d' ? 0.25 : period === '90d' ? 3 : 1;
  const results = predictionDistricts.slice(0, 10).map(d => {
    const matching = historicalData.filter(r => r.district === d && r.crimeType.toUpperCase() === crimeType);
    const yearTotals = {};
    matching.forEach(r => { yearTotals[r.year] = (yearTotals[r.year] || 0) + r.count; });
    const vals = Object.values(yearTotals);
    const avg = vals.length > 0 ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
    const latest = vals[vals.length - 1] || avg;
    const trend = vals.length >= 2 ? (vals[vals.length - 1] > vals[vals.length - 2] ? 'increasing' : vals[vals.length - 1] < vals[vals.length - 2] ? 'decreasing' : 'stable') : 'stable';
    const pctChange = avg > 0 ? Math.round(((latest - avg) / avg) * 100) : 0;
    const forecast = Math.round(avg * (1 + pctChange / 200) * multiplier);
    return { district: d, historicalAverage: avg, recentTrend: latest, forecastedCount: forecast || latest, percentageChange: pctChange, trendDirection: trend, confidence: seriesConfidence(vals) };
  });
  res.json({ predictions: results, crimeType, period });
});

// ---------------------------------------------------------------------------
// RISK SCORE - dedicated endpoints
// ---------------------------------------------------------------------------
app.get('/api/risk/districts', (_req, res) => {
  const districtCounts = {};
  historicalData.filter(r => isAdditiveCrimeType(r.crimeType)).forEach(r => {
    districtCounts[r.district] = (districtCounts[r.district] || 0) + r.count;
  });
  const districts = Object.entries(districtCounts)
    .sort(([,a],[,b]) => b - a)
    .slice(0, 20)
    .map(([district, totalCrimes]) => {
      const latestYear = allYears[allYears.length - 1];
      const prevYear = allYears.length > 1 ? allYears[allYears.length - 2] : latestYear;
      const curr = historicalData.filter(r => r.district === district && r.year === latestYear && isAdditiveCrimeType(r.crimeType)).reduce((s, r) => s + r.count, 0);
      const prev = historicalData.filter(r => r.district === district && r.year === prevYear && isAdditiveCrimeType(r.crimeType)).reduce((s, r) => s + r.count, 0);
      const avg = totalCrimes / allYears.length;
      const score = Math.min(100, Math.max(10, Math.round((curr / (avg || 1)) * 50)));
      const level = score >= 75 ? 'critical' : score >= 55 ? 'high' : score >= 30 ? 'medium' : 'low';
      return { district, totalCrimes, latestYearCrimes: curr, averagePerYear: Math.round(avg), score, level, yearOverYearChange: prev > 0 ? Math.round(((curr - prev) / prev) * 100) : 0 };
    });
  res.json({ districts, totalDistricts: districts.length });
});

app.get('/api/risk/score', (req, res) => {
  const district = req.query.district || '';
  if (!district) return res.status(400).json({ error: 'District parameter required' });
  const matching = historicalData.filter(r => r.district === district && isAdditiveCrimeType(r.crimeType));
  if (matching.length === 0) return res.status(404).json({ error: 'District not found' });

  const latestYear = allYears[allYears.length - 1];
  const prevYear = allYears.length > 1 ? allYears[allYears.length - 2] : latestYear;
  const currTotal = matching.filter(r => r.year === latestYear).reduce((s, r) => s + r.count, 0);
  const prevTotal = matching.filter(r => r.year === prevYear).reduce((s, r) => s + r.count, 0);
  const avgPerYear = matching.reduce((s, r) => s + r.count, 0) / allYears.length;

  const historicalRateScore = Math.min(35, Math.round((currTotal / (avgPerYear || 1)) * 17.5));
  const yoyChange = prevTotal > 0 ? ((currTotal - prevTotal) / prevTotal) * 100 : 0;
  const yoyScore = Math.min(28, Math.round(Math.abs(yoyChange) * 1.4));
  const totalAll = historicalData.filter(r => r.year === latestYear && isAdditiveCrimeType(r.crimeType)).reduce((s, r) => s + r.count, 0);
  const densityScore = Math.min(22, Math.round((currTotal / (totalAll || 1)) * 220));
  const crimeTypes = [...new Set(matching.map(r => r.crimeType))];
  const typeDiversity = crimeTypes.length;
  const diversityScore = Math.min(15, Math.round(typeDiversity * 1.5));

  const score = Math.min(100, Math.max(10, historicalRateScore + yoyScore + densityScore + diversityScore));
  const level = score >= 75 ? 'critical' : score >= 55 ? 'high' : score >= 30 ? 'medium' : 'low';

  const crimeTypeBreakdown = {};
  matching.filter(r => r.year === latestYear).forEach(r => {
    crimeTypeBreakdown[r.crimeType] = (crimeTypeBreakdown[r.crimeType] || 0) + r.count;
  });
  const topCrimes = Object.entries(crimeTypeBreakdown).sort(([,a],[,b]) => b-a).slice(0, 8).map(([type, count]) => ({ type, count, percentage: currTotal > 0 ? Math.round((count / currTotal) * 100) : 0 }));

  const yearTrend = allYears.map(y => {
    const count = matching.filter(r => r.year === y).reduce((s, r) => s + r.count, 0);
    return { year: y, count };
  });

  const recs = [];
  if (score >= 75) { recs.push('Deploy additional patrol units immediately', 'Establish temporary checkpoints', 'Increase night surveillance'); }
  else if (score >= 55) { recs.push('Increase patrol frequency in high-risk zones', 'Deploy additional CCTV cameras', 'Community awareness programs'); }
  else if (score >= 30) { recs.push('Maintain current patrol levels', 'Monitor crime trends closely', 'Community outreach programs'); }
  else { recs.push('Standard monitoring sufficient', 'Continue community policing', 'Regular patrol schedules'); }
  if (yoyChange > 10) recs.push('Investigate causes of crime increase');
  if (topCrimes.length > 0 && topCrimes[0].percentage > 30) recs.push(`Focus on ${topCrimes[0].type.toLowerCase()} prevention`);

  res.json({
    district, score, level,
    historicalRate: Math.round(avgPerYear),
    recentIncidents: currTotal,
    totalCrimes: matching.reduce((s, r) => s + r.count, 0),
    yearOverYearChange: Math.round(yoyChange),
    topCrimes,
    yearTrend,
    contributingFactors: [
      { factor: 'Historical Crime Rate', weight: Math.round(historicalRateScore), maxWeight: 35 },
      { factor: 'Year-over-Year Trend', weight: Math.round(yoyScore), maxWeight: 28 },
      { factor: 'District Crime Density', weight: Math.round(densityScore), maxWeight: 22 },
      { factor: 'Crime Type Diversity', weight: Math.round(diversityScore), maxWeight: 15 },
    ],
    lastUpdated: new Date().toISOString(),
    recommendations: recs,
  });
});

app.get('/api/risk/all', (_req, res) => {
  const districtCounts = {};
  historicalData.filter(r => isAdditiveCrimeType(r.crimeType)).forEach(r => {
    districtCounts[r.district] = (districtCounts[r.district] || 0) + r.count;
  });
  const latestYear = allYears[allYears.length - 1];
  const prevYear = allYears.length > 1 ? allYears[allYears.length - 2] : latestYear;
  const totalAll = historicalData.filter(r => r.year === latestYear && isAdditiveCrimeType(r.crimeType)).reduce((s, r) => s + r.count, 0);

  const results = Object.entries(districtCounts)
    .sort(([,a],[,b]) => b - a)
    .slice(0, 25)
    .map(([district, totalCrimes]) => {
      const matching = historicalData.filter(r => r.district === district && isAdditiveCrimeType(r.crimeType));
      const currTotal = matching.filter(r => r.year === latestYear).reduce((s, r) => s + r.count, 0);
      const prevTotal = matching.filter(r => r.year === prevYear).reduce((s, r) => s + r.count, 0);
      const avg = totalCrimes / allYears.length;
      const historicalRateScore = Math.min(35, Math.round((currTotal / (avg || 1)) * 17.5));
      const yoyChange = prevTotal > 0 ? ((currTotal - prevTotal) / prevTotal) * 100 : 0;
      const yoyScore = Math.min(28, Math.round(Math.abs(yoyChange) * 1.4));
      const densityScore = Math.min(22, Math.round((currTotal / (totalAll || 1)) * 220));
      const crimeTypes = [...new Set(matching.map(r => r.crimeType))];
      const diversityScore = Math.min(15, Math.round(crimeTypes.length * 1.5));
      const score = Math.min(100, Math.max(10, historicalRateScore + yoyScore + densityScore + diversityScore));
      const level = score >= 75 ? 'critical' : score >= 55 ? 'high' : score >= 30 ? 'medium' : 'low';
      return { district, totalCrimes, latestYearCrimes: currTotal, averagePerYear: Math.round(avg), score, level, yearOverYearChange: Math.round(yoyChange), crimeTypeCount: crimeTypes.length };
    });

  const summary = {
    totalDistricts: results.length,
    critical: results.filter(r => r.level === 'critical').length,
    high: results.filter(r => r.level === 'high').length,
    medium: results.filter(r => r.level === 'medium').length,
    low: results.filter(r => r.level === 'low').length,
    avgScore: results.length > 0 ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length) : 0,
    highestRisk: results[0] || null,
    lowestRisk: results[results.length - 1] || null,
  };
  res.json({ districts: results, summary });
});

app.get('/api/risk/history', (req, res) => {
  const district = req.query.district || '';
  const matching = historicalData.filter(r =>
    isAdditiveCrimeType(r.crimeType) &&
    (!district || r.district.toUpperCase().includes(district.toUpperCase()))
  );
  const byYear = new Map();
  matching.forEach(r => byYear.set(r.year, (byYear.get(r.year) || 0) + r.count));
  const years = [...byYear.keys()].sort((a, b) => a - b);
  const average = years.length ? years.reduce((s, y) => s + byYear.get(y), 0) / years.length : 0;
  const history = years.map(year => {
    const count = byYear.get(year);
    const score = average > 0 ? Math.min(100, Math.max(10, Math.round((count / average) * 50))) : 10;
    return {
      month: String(year),
      score,
      level: score >= 75 ? 'critical' : score >= 55 ? 'high' : score >= 30 ? 'medium' : 'low',
      count,
      average: Math.round(average),
    };
  });
  res.json({ district, history });
});

app.get('/api/predictions/risk-score', (req, res) => {
  const district = req.query.district || 'MUMBAI COMMR.';
  const matching = historicalData.filter(r =>
    r.district.toUpperCase().includes(district.toUpperCase()) && isAdditiveCrimeType(r.crimeType)
  );
  const latestYear = allYears[allYears.length - 1];
  const prevYear = allYears.length > 1 ? allYears[allYears.length - 2] : latestYear;
  const currTotal = matching.filter(r => r.year === latestYear).reduce((s, r) => s + r.count, 0);
  const prevTotal = matching.filter(r => r.year === prevYear).reduce((s, r) => s + r.count, 0);
  const avgPerYear = matching.length > 0 ? Math.round(matching.reduce((s, r) => s + r.count, 0) / allYears.length) : 0;
  const score = Math.min(100, Math.max(10, Math.round((currTotal / (avgPerYear || 1)) * 50)));
  const level = score >= 75 ? 'high' : score >= 40 ? 'medium' : 'low';

  const crimeTypeBreakdown = {};
  matching.filter(r => r.year === latestYear).forEach(r => {
    crimeTypeBreakdown[r.crimeType] = (crimeTypeBreakdown[r.crimeType] || 0) + r.count;
  });
  const topCrimes = Object.entries(crimeTypeBreakdown).sort(([,a],[,b]) => b-a).slice(0, 5).map(([type, count]) => ({ type, count, percentage: currTotal > 0 ? Math.round((count / currTotal) * 100) : 0 }));

  res.json({
    district, score, level,
    historicalRate: avgPerYear,
    recentIncidents: currTotal,
    yearOverYearChange: prevTotal > 0 ? Math.round(((currTotal - prevTotal) / prevTotal) * 100) : 0,
    topCrimes,
    contributingFactors: [
      { factor: 'Historical Crime Rate', weight: 35 },
      { factor: 'Year-over-Year Trend', weight: 28 },
      { factor: 'District Crime Density', weight: 22 },
      { factor: 'Crime Type Distribution', weight: 15 },
    ],
    lastUpdated: new Date().toISOString(),
    recommendations: ['Increase patrol in high-risk zones', 'Community outreach programs', 'Deploy additional CCTV cameras'],
  });
});

app.get('/api/predictions/deployment', (req, res) => {
  const district = req.query.district || 'Central District';
  const matching = historicalData.filter(r => r.district.toUpperCase().includes(district.toUpperCase()));
  const latestYear = allYears[allYears.length - 1];
  const currTotal = matching.filter(r => r.year === latestYear).reduce((s, r) => s + r.count, 0);
  const recommendedOfficers = Math.max(8, Math.round(currTotal / 500));

  // Anchor every route/checkpoint on the district's own coordinates instead of
  // hard-coded values from an unrelated city.
  const state = matching.length ? matching[0].state : '';
  const [baseLat, baseLng] = getDistrictCoords(district, state);
  const point = (dLat, dLng) => ({
    latitude: Number((baseLat + dLat).toFixed(4)),
    longitude: Number((baseLng + dLng).toFixed(4)),
  });

  res.json({
    district, date: req.query.date || new Date().toISOString().slice(0, 10),
    recommendedOfficers,
    basis: { latestYear, crimesInLatestYear: currTotal, crimeRecords: matching.length },
    shifts: [
      { time: 'Morning (6-14)', officers: Math.round(recommendedOfficers * 0.4), priority: 'high' },
      { time: 'Evening (14-22)', officers: Math.round(recommendedOfficers * 0.4), priority: 'critical' },
      { time: 'Night (22-6)', officers: Math.round(recommendedOfficers * 0.2), priority: 'medium' },
    ],
    patrolRoutes: [
      { name: 'Market Circuit', coordinates: [point(0.02, 0.02), point(-0.01, 0.03)], priority: 'high' },
      { name: 'Residential Loop', coordinates: [point(0.03, -0.03), point(-0.02, -0.04)], priority: 'medium' },
    ],
    checkpoints: [
      { name: 'Entry Point A', latitude: point(0.02, 0.02).latitude, longitude: point(0.02, 0.02).longitude, frequency: 'Every 2 hours' },
      { name: 'Entry Point B', latitude: point(-0.01, 0.03).latitude, longitude: point(-0.01, 0.03).longitude, frequency: 'Every 4 hours' },
    ],
  });
});

app.get('/api/predictions/history', (req, res) => {
  const district = req.query.district || '';
  const crimeType = req.query.crimeType || '';
  const limit = parseInt(req.query.limit) || 12;

  const topDistricts = predictionDistricts.slice(0, 10);
  const topCrimeTypes = CRIME_COLUMNS.filter(c => c !== 'TOTAL IPC CRIMES').slice(0, 8);
  const historyData = [];
  let id = 1;

  topDistricts.forEach(d => {
    topCrimeTypes.forEach(ct => {
      const matching = historicalData.filter(r => r.district === d && r.crimeType === ct);
      if (!matching.length) return;
      const yearTotals = {};
      matching.forEach(r => { yearTotals[r.year] = (yearTotals[r.year] || 0) + r.count; });
      const years = Object.keys(yearTotals).map(Number).sort((a, b) => a - b);
      if (years.length < 4) return;
      const vals = years.map(y => yearTotals[y]);
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      const avg = Math.round(mean);
      const variance = vals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / vals.length;
      const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
      const seriesConfidence = Math.max(0, Math.min(99, Math.round((1 - cv) * 100)));

      // Real backtest: forecast each of the last three known years from the
      // mean of the three preceding years, then compare with the published count.
      const start = Math.max(3, years.length - 3);
      for (let i = start; i < years.length; i++) {
        const forecasted = Math.round((vals[i - 1] + vals[i - 2] + vals[i - 3]) / 3);
        const actual = vals[i];
        const prev = vals[i - 1];
        const accuracy = actual > 0
          ? Math.max(0, Math.min(100, Math.round(100 - (Math.abs(forecasted - actual) / actual) * 100)))
          : null;
        const trend = actual > prev ? 'increasing' : actual < prev ? 'decreasing' : 'stable';
        historyData.push({
          id: `ph${id++}`, district: d, crimeType: ct, month: String(years[i]),
          forecastedCount: forecasted,
          confidence: seriesConfidence,
          trendDirection: trend,
          percentageChange: prev > 0 ? Math.round(((actual - prev) / prev) * 100) : 0,
          peakDays: [],
          contributingFactors: [`Historical ${ct.toLowerCase()} patterns in ${d}`],
          historicalAverage: avg, recentTrend: actual,
          recommendations: { officerCount: Math.max(3, Math.round(forecasted / 8)), patrolShifts: [], priorityAreas: [], preventiveMeasures: [] },
          createdAt: `${years[i]}-12-31T00:00:00.000Z`,
          actualCount: actual,
          accuracy,
        });
      }
    });
  });

  let filtered = historyData;
  if (district) filtered = filtered.filter(p => p.district.toUpperCase().includes(district.toUpperCase()));
  if (crimeType) filtered = filtered.filter(p => p.crimeType.toUpperCase() === crimeType.toUpperCase());
  filtered.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({ predictions: filtered.slice(0, limit) });
});

// ---------------------------------------------------------------------------
// FORECAST EXPORT
// ---------------------------------------------------------------------------
app.get('/api/forecast/export', (req, res) => {
  const district = req.query.district || 'MUMBAI COMMR.';
  const crimeType = req.query.crimeType || 'THEFT';
  const period = req.query.period || '30d';

  const matching = historicalData.filter(r =>
    r.district.toUpperCase().includes(district.toUpperCase()) &&
    r.crimeType.toUpperCase() === crimeType.toUpperCase()
  );
  const yearTotals = {};
  matching.forEach(r => { yearTotals[r.year] = (yearTotals[r.year] || 0) + r.count; });
  const vals = Object.values(yearTotals);
  const avg = vals.length > 0 ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0;
  const latest = vals[vals.length - 1] || avg;
  const trend = vals.length >= 2 ? (vals[vals.length - 1] > vals[vals.length - 2] ? 'increasing' : 'decreasing') : 'stable';
  const pctChange = avg > 0 ? Math.round(((latest - avg) / avg) * 100) : 0;
  const multiplier = period === '7d' ? 0.25 : period === '90d' ? 3 : 1;
  const forecast = Math.round(avg * (1 + pctChange / 200) * multiplier);

  const header = 'Year,Type,Historical Count,Predicted\n';
  const rows = vals.map((v, i) => `${allYears[i]},Historical,${v},`).join('\n');
  const forecastRow = `\nForecast,,,${forecast}`;
  const summary = `\n\nSummary\nDistrict,${district}\nCrime Type,${crimeType}\nPeriod,${period}\nTrend,${trend}\nConfidence,${seriesConfidence(vals)}%\nHistorical Average,${avg}\nForecasted Count,${forecast}\nGenerated At,${new Date().toISOString()}`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=forecast_${district.replace(/\s+/g, '_')}_${crimeType.replace(/\s+/g, '_')}.csv`);
  res.send(header + rows + forecastRow + summary);
});

// ---------------------------------------------------------------------------
// AUDIT LOGS
// ---------------------------------------------------------------------------
app.get('/api/audit-logs', (req, res) => res.json(paginate(auditLogs, req.query)));

// ---------------------------------------------------------------------------
// SETTINGS
// ---------------------------------------------------------------------------
const settings = {
  theme: 'light',
  refreshInterval: 30,
  defaultPageSize: 25,
  notifications: {
    sos: true, crime_report: true, prediction: true, system: true, assignment: true,
    daily_summary: true, emergency_broadcast: true,
  },
  security: {
    passwordMinLength: 8,
    requireUppercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    twoFactorEnabled: false,
    sessionTimeout: 30,
    maxLoginAttempts: 5,
    lockoutDuration: 15,
    ipWhitelisting: false,
    allowedIPs: [],
  },
  integrations: {
    map_provider: { name: 'Leaflet (OpenStreetMap)', status: 'connected', apiKey: '' },
    ml_model: { name: 'ML Prediction Engine', status: 'connected', endpoint: '/api/predictions' },
    sms_gateway: { name: 'SMS Gateway', status: 'not_configured', apiKey: '', provider: '' },
    email_service: { name: 'Email Service', status: 'not_configured', apiKey: '', provider: '' },
    cctv_system: { name: 'CCTV Integration', status: 'not_configured', endpoint: '' },
    aadhaar_api: { name: 'Aadhaar Verification', status: 'not_configured', apiKey: '' },
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

app.get('/api/settings', (_req, res) => res.json(settings));
app.put('/api/settings', (req, res) => {
  const old = JSON.parse(JSON.stringify(settings));
  Object.assign(settings, req.body);
  settings.updatedAt = new Date().toISOString();
  const changes = Object.keys(req.body).filter(k => JSON.stringify(old[k]) !== JSON.stringify(settings[k]));
  auditLogs.unshift({ id: 'audit' + Date.now(), type: 'settings_changed', userId: 'u1', userName: 'Admin User', action: `Updated settings: ${changes.join(', ')}`, timestamp: new Date().toISOString() });
  res.json({ message: 'Settings updated successfully', data: settings });
});
app.put('/api/settings/notifications', (req, res) => {
  settings.notifications = { ...settings.notifications, ...req.body };
  settings.updatedAt = new Date().toISOString();
  auditLogs.unshift({ id: 'audit' + Date.now(), type: 'settings_changed', userId: 'u1', userName: 'Admin User', action: 'Updated notification preferences', timestamp: new Date().toISOString() });
  res.json({ message: 'Notification settings updated', data: settings.notifications });
});
app.put('/api/settings/security', (req, res) => {
  settings.security = { ...settings.security, ...req.body };
  settings.updatedAt = new Date().toISOString();
  auditLogs.unshift({ id: 'audit' + Date.now(), type: 'settings_changed', userId: 'u1', userName: 'Admin User', action: 'Updated security settings', timestamp: new Date().toISOString() });
  res.json({ message: 'Security settings updated', data: settings.security });
});
app.put('/api/settings/integrations', (req, res) => {
  Object.keys(req.body).forEach(k => {
    if (settings.integrations[k]) settings.integrations[k] = { ...settings.integrations[k], ...req.body[k] };
  });
  settings.updatedAt = new Date().toISOString();
  auditLogs.unshift({ id: 'audit' + Date.now(), type: 'settings_changed', userId: 'u1', userName: 'Admin User', action: 'Updated API integrations', timestamp: new Date().toISOString() });
  res.json({ message: 'Integration settings updated', data: settings.integrations });
});
app.post('/api/settings/integrations/:key/test', (req, res) => {
  const key = req.params.key;
  const integ = settings.integrations[key];
  if (!integ) return res.status(404).json({ error: 'Integration not found' });
  const success = integ.status === 'connected';
  res.json({ success, status: success ? 'connected' : 'failed', integration: integ });
});
app.get('/api/settings/system-info', (_req, res) => {
  const memUsage = process.memoryUsage();
  res.json({
    version: '2.1.0',
    database: { status: 'connected', liveRecords: firs.length + cases.length + users.length + officers.length + crimeReports.length, historicalRecords: historicalData.length },
    performance: { uptime: Math.floor(process.uptime()), cpuUsage: cpuPercentUsed(), memoryUsage: Math.round(memUsage.heapUsed / memUsage.heapTotal * 100), activeUsers: users.filter(u => u.status === 'active').length, totalMemory: Math.round(memUsage.heapTotal / 1024 / 1024), usedMemory: Math.round(memUsage.heapUsed / 1024 / 1024) },
    lastBackup: new Date().toISOString(),
    apiStatus: { total: Object.keys(settings.integrations).length, connected: Object.values(settings.integrations).filter(i => i.status === 'connected').length },
  });
});

// ---------------------------------------------------------------------------
// REPORTS & EXPORT
// ---------------------------------------------------------------------------
const generatedReports = [];

function buildDashboardSummary() {
  const totalFIRs = firs.length;
  const activeCases = cases.filter(c => c.status === 'active').length;
  const totalCrimeReports = crimeReports.length;
  const pendingAlerts = sosAlerts.filter(a => a.status === 'pending' || a.status === 'assigned').length;
  const activeOfficers = officers.filter(o => o.status === 'active').length;
  const totalUsers = users.length;
  const crimeByType = {};
  historicalData.forEach(r => { crimeByType[r.crimeType] = (crimeByType[r.crimeType] || 0) + r.count; });
  const topTypes = Object.entries(crimeByType).sort((a, b) => b[1] - a[1]).slice(0, 10);
  return { totalFIRs, activeCases, totalCrimeReports, pendingAlerts, activeOfficers, totalUsers, topCrimeTypes: topTypes, totalHistoricalCrimes: historicalData.filter(r => isAdditiveCrimeType(r.crimeType) && !r.district.toUpperCase().includes('TOTAL')).reduce((s, r) => s + r.count, 0) };
}

function buildAnalyticsReport() {
  const byState = {};
  const byYear = {};
  const byCrimeType = {};
  const addRows = historicalData.filter(r => isAdditiveCrimeType(r.crimeType) && !r.district.toUpperCase().includes('TOTAL'));
  addRows.forEach(r => {
    byState[r.state] = (byState[r.state] || 0) + r.count;
    byYear[r.year] = (byYear[r.year] || 0) + r.count;
    byCrimeType[r.crimeType] = (byCrimeType[r.crimeType] || 0) + r.count;
  });
  const topStates = Object.entries(byState).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const yearlyTrend = Object.entries(byYear).sort((a, b) => Number(a[0]) - Number(b[0]));
  const topCrimeTypes = Object.entries(byCrimeType).sort((a, b) => b[1] - a[1]).slice(0, 15);
  return { totalRecords: addRows.length, totalCrimes: addRows.reduce((s, r) => s + r.count, 0), topStates, yearlyTrend, topCrimeTypes };
}

function buildPredictionsReport() {
  const seriesMap = new Map();
  for (const row of historicalData) {
    if (!isAdditiveCrimeType(row.crimeType)) continue;
    if (row.district.toUpperCase().includes('TOTAL')) continue;
    const key = row.district + '|' + row.crimeType;
    let entry = seriesMap.get(key);
    if (!entry) {
      entry = { state: row.state, district: row.district, crimeType: row.crimeType, yearTotals: {} };
      seriesMap.set(key, entry);
    }
    entry.yearTotals[row.year] = (entry.yearTotals[row.year] || 0) + row.count;
  }

  const predictions = [];
  for (const entry of seriesMap.values()) {
    const years = Object.keys(entry.yearTotals).map(Number).sort((a, b) => a - b);
    if (years.length < 4) continue;
    const vals = years.map(y => entry.yearTotals[y]);
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) * (v - mean), 0) / vals.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1;
    const last = vals[vals.length - 1];
    const predicted = Math.round((vals[vals.length - 2] + vals[vals.length - 3] + vals[vals.length - 4]) / 3);
    predictions.push({
      state: entry.state,
      district: entry.district,
      crimeType: entry.crimeType,
      baseYear: years[years.length - 1],
      historicalCount: last,
      predictedCount: predicted,
      confidence: Math.max(0, Math.min(99, Math.round((1 - cv) * 100))),
      riskLevel: last > 5000 ? 'high' : last > 1000 ? 'medium' : 'low',
    });
    if (predictions.length >= 50) break;
  }
  return { totalPredictions: predictions.length, predictions };
}

function buildAuditLog() {
  return { totalEntries: auditLogs.length, entries: auditLogs.slice(0, 100) };
}

function toCSV(rows, headers) {
  const lines = [headers.join(',')];
  rows.forEach(row => {
    lines.push(headers.map(h => {
      const v = row[h] ?? '';
      return typeof v === 'string' && (v.includes(',') || v.includes('"')) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(','));
  });
  return lines.join('\n');
}

app.get('/api/reports/history', (_req, res) => {
  res.json(generatedReports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.post('/api/reports/generate', (req, res) => {
  const { reportType, format } = req.body;
  let data, csvContent, filename;
  const ts = new Date().toISOString().slice(0, 10);

  if (reportType === 'dashboard') {
    data = buildDashboardSummary();
    const rows = [
      { Metric: 'Total FIRs', Value: data.totalFIRs },
      { Metric: 'Active Cases', Value: data.activeCases },
      { Metric: 'Crime Reports', Value: data.totalCrimeReports },
      { Metric: 'Pending SOS Alerts', Value: data.pendingAlerts },
      { Metric: 'Active Officers', Value: data.activeOfficers },
      { Metric: 'Total Users', Value: data.totalUsers },
      { Metric: 'Total Historical Crimes', Value: data.totalHistoricalCrimes },
      ...data.topCrimeTypes.map(([type, count]) => ({ Metric: `Crime: ${type}`, Value: count })),
    ];
    csvContent = toCSV(rows, ['Metric', 'Value']);
    filename = `dashboard_summary_${ts}`;
  } else if (reportType === 'analytics') {
    data = buildAnalyticsReport();
    const rows = data.topStates.map(([state, count]) => ({ State: state, TotalCrimes: count }));
    csvContent = toCSV(rows, ['State', 'TotalCrimes']);
    filename = `analytics_report_${ts}`;
  } else if (reportType === 'predictions') {
    data = buildPredictionsReport();
    const rows = data.predictions.map(p => ({ State: p.state, District: p.district, CrimeType: p.crimeType, Historical: p.historicalCount, Predicted: p.predictedCount, Confidence: p.confidence + '%', Risk: p.riskLevel }));
    csvContent = toCSV(rows, ['State', 'District', 'CrimeType', 'Historical', 'Predicted', 'Confidence', 'Risk']);
    filename = `predictions_report_${ts}`;
  } else if (reportType === 'audit') {
    data = buildAuditLog();
    const rows = data.entries.map(e => ({ Timestamp: e.timestamp, Type: e.type, User: e.userName, Action: e.action }));
    csvContent = toCSV(rows, ['Timestamp', 'Type', 'User', 'Action']);
    filename = `audit_log_${ts}`;
  } else {
    return res.status(400).json({ error: 'Invalid report type' });
  }

  const report = {
    id: 'rpt' + Date.now(),
    title: `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report - ${ts}`,
    type: reportType,
    format: format || 'csv',
    size: `${Math.round(csvContent.length / 1024)} KB`,
    createdAt: new Date().toISOString(),
    downloadCount: 0,
  };
  generatedReports.push(report);

  if (format === 'csv' || !format) {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}.csv`);
    res.send(csvContent);
  } else {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}.csv`);
    res.send(csvContent);
  }
});

app.get('/api/reports/download/:id', (req, res) => {
  const report = generatedReports.find(r => r.id === req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });
  report.downloadCount++;
  const ts = report.createdAt.slice(0, 10);
  let data, csvContent;
  if (report.type === 'dashboard') {
    const d = buildDashboardSummary();
    const rows = [
      { Metric: 'Total FIRs', Value: d.totalFIRs }, { Metric: 'Active Cases', Value: d.activeCases },
      { Metric: 'Crime Reports', Value: d.totalCrimeReports }, { Metric: 'Pending SOS Alerts', Value: d.pendingAlerts },
      { Metric: 'Active Officers', Value: d.activeOfficers }, { Metric: 'Total Users', Value: d.totalUsers },
    ];
    csvContent = toCSV(rows, ['Metric', 'Value']);
  } else if (report.type === 'analytics') {
    data = buildAnalyticsReport();
    csvContent = toCSV(data.topStates.map(([s, c]) => ({ State: s, TotalCrimes: c })), ['State', 'TotalCrimes']);
  } else if (report.type === 'predictions') {
    data = buildPredictionsReport();
    csvContent = toCSV(data.predictions.map(p => ({ State: p.state, District: p.district, CrimeType: p.crimeType, Predicted: p.predictedCount })), ['State', 'District', 'CrimeType', 'Predicted']);
  } else if (report.type === 'audit') {
    data = buildAuditLog();
    csvContent = toCSV(data.entries.map(e => ({ Timestamp: e.timestamp, Type: e.type, User: e.userName, Action: e.action })), ['Timestamp', 'Type', 'User', 'Action']);
  } else {
    csvContent = 'No data';
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=${report.title.replace(/\s+/g, '_')}.csv`);
  res.send(csvContent);
});

app.post('/api/export', (req, res) => {
  const { entityType, format } = req.body;
  let rows = [], headers = [], filename = 'export';
  if (entityType === 'firs' || !entityType) {
    headers = ['FIR Number', 'Crime Type', 'Severity', 'Status', 'Location', 'District', 'Complainant', 'Date'];
    rows = firs.map(f => ({ 'FIR Number': f.firNumber, 'Crime Type': f.crimeType, Severity: f.severity, Status: f.status, Location: f.location, District: f.district, Complainant: f.complainantName, Date: f.incidentDate }));
    filename = 'firs_export';
  } else if (entityType === 'cases') {
    headers = ['Case Number', 'Name', 'Priority', 'Status', 'District', 'Lead Officer', 'Created'];
    rows = cases.map(c => ({ 'Case Number': c.caseNumber, Name: c.name, Priority: c.priority, Status: c.status, District: c.district, 'Lead Officer': c.leadOfficer?.name ?? '', Created: c.createdAt }));
    filename = 'cases_export';
  } else if (entityType === 'users') {
    headers = ['Name', 'Email', 'Phone', 'Role', 'Status', 'Registered'];
    rows = users.map(u => ({ Name: u.name, Email: u.email, Phone: u.phone, Role: u.role, Status: u.status, Registered: u.registrationDate }));
    filename = 'users_export';
  } else if (entityType === 'officers') {
    headers = ['Name', 'Rank', 'Badge', 'District', 'Status', 'Specialization'];
    rows = officers.map(o => ({ Name: o.name, Rank: o.rank, Badge: o.badgeNumber, District: o.district, Status: o.status, Specialization: o.specialization }));
    filename = 'officers_export';
  } else if (entityType === 'crime-reports') {
    headers = ['Type', 'Crime Type', 'Status', 'Location', 'District', 'Submitted'];
    rows = crimeReports.map(r => ({ Type: r.type, 'Crime Type': r.crimeType, Status: r.status, Location: r.location, District: r.district, Submitted: r.submittedAt }));
    filename = 'crime_reports_export';
  } else if (entityType === 'sos-alerts') {
    headers = ['Officer', 'Type', 'Status', 'Location', 'Priority', 'Created'];
    rows = sosAlerts.map(a => ({ Officer: a.officerName, Type: a.alertType, Status: a.status, Location: a.location, Priority: a.priority, Created: a.createdAt }));
    filename = 'sos_alerts_export';
  }
  const csv = toCSV(rows, headers);
  const report = { id: 'rpt' + Date.now(), title: `${filename.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} - ${new Date().toISOString().slice(0, 10)}`, type: 'export', format: format || 'csv', size: `${Math.round(csv.length / 1024)} KB`, createdAt: new Date().toISOString(), downloadCount: 0 };
  generatedReports.push(report);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}.csv`);
  res.send(csv);
});

// ---------------------------------------------------------------------------
// REFERENCE DATA
// ---------------------------------------------------------------------------
app.get('/api/references/states', (_req, res) => res.json(allStates));
app.get('/api/references/districts', (_req, res) => res.json(allDistricts));
app.get('/api/references/years', (_req, res) => res.json(allYears));
app.get('/api/references/crime-types', (_req, res) => res.json(allCrimeTypes));

// ---------------------------------------------------------------------------
// HEATMAP - comprehensive district-level crime data with coordinates
// ---------------------------------------------------------------------------
const STATE_COORDS = {
  'ANDHRA PRADESH': [15.9129, 79.7400], 'ARUNACHAL PRADESH': [28.2180, 97.5640], 'ASSAM': [26.2006, 92.9376],
  'BIHAR': [25.0961, 85.3131], 'CHHATTISGARH': [21.2787, 81.8661], 'GOA': [15.2993, 74.1240],
  'GUJARAT': [22.2587, 71.1924], 'HARYANA': [29.0588, 76.0856], 'HIMACHAL PRADESH': [31.1048, 77.1734],
  'JAMMU & KASHMIR': [33.7782, 76.5762], 'JHARKHAND': [23.6102, 85.2799], 'KARNATAKA': [15.3173, 75.7139],
  'KERALA': [10.8505, 76.2711], 'MADHYA PRADESH': [22.9734, 78.6569], 'MAHARASHTRA': [19.7515, 75.7139],
  'MANIPUR': [24.6637, 93.9063], 'MEGHALAYA': [25.4670, 91.3662], 'MIZORAM': [23.1645, 92.9376],
  'NAGALAND': [26.1584, 94.5624], 'ODISHA': [20.9517, 85.0985], 'PUNJAB': [31.1471, 75.3412],
  'RAJASTHAN': [27.0238, 74.2179], 'SIKKIM': [27.5330, 88.5122], 'TAMIL NADU': [11.1271, 78.6569],
  'TRIPURA': [23.9408, 91.9882], 'UTTAR PRADESH': [26.8467, 80.9462], 'UTTARAKHAND': [30.0668, 79.0193],
  'WEST BENGAL': [22.9868, 87.8550], 'DELHI UT': [28.7041, 77.1025],
  'CHANDIGARH': [30.7333, 76.7794], 'PUDUCHERRY': [11.9416, 79.8083], 'LAKSHADWEEP': [10.5667, 72.6417],
  'A & N ISLANDS': [11.7401, 92.6586], 'DAMAN & DIU': [20.4283, 72.8397], 'D & N HAVELI': [20.1809, 73.0171],
};

function getDistrictCoords(district, state) {
  const d = district.toUpperCase();
  const s = state ? state.toUpperCase() : '';
  const knownCoords = {
    'MUMBAI': [19.0760, 72.8777], 'MUMBAI COMMR.': [19.0760, 72.8777], 'THANE': [19.2183, 72.9781],
    'PUNE': [18.5204, 73.8567], 'PUNE COMMR.': [18.5204, 73.8567], 'NAVI MUMBAI': [19.0330, 73.0297],
    'NAGPUR': [21.1458, 79.0882], 'NAGPUR RLY.': [21.1458, 79.0882], 'NASHIK': [19.9975, 73.7898],
    'JALGAON': [21.0077, 75.5663], 'AHMEDNAGAR': [19.0952, 74.7496], 'Solapur': [17.6599, 75.9064],
    'AURANGABAD': [19.8762, 75.3433], 'JALNA': [19.8347, 75.8849], 'KOLHAPUR': [16.7050, 74.2433],
    'SANGLI': [16.8524, 74.5632], 'SATARA': [17.6868, 73.9937], ' Ratnagiri': [16.9902, 73.3120],
    'SYED': [16.5264, 74.3500], 'SINDHUDURG': [16.3705, 73.5130],
    'AHMEDABAD': [23.0225, 72.5714], 'AHMEDABAD COMMR.': [23.0225, 72.5714], 'SURAT': [21.1702, 72.8311],
    'SURAT COMMR.': [21.1702, 72.8311], 'VADODARA': [22.3072, 73.1812], 'VADODARA COMMR.': [22.3072, 73.1812],
    'RAJKOT': [22.3039, 70.8022], 'RAJKOT COMMR.': [22.3039, 70.8022], 'BHARUCH': [21.7051, 72.9959],
    'BHAVNAGAR': [21.7645, 72.1519], 'JAMNAGAR': [22.4707, 70.0577], 'JUNAGADH': [21.5222, 70.4579],
    'GANDHINAGAR': [23.2156, 72.6369], 'ANAND': [22.5645, 72.9289], 'KUTCH': [23.7337, 69.8597],
    'KUTCH (WEST-BHUJ)': [23.7337, 69.8597], 'MEHSANA': [23.5880, 72.3693], 'NAVSARI': [20.9467, 72.9220],
    'PATAN': [23.8493, 72.1266], 'PORBANDAR': [21.6417, 69.6293], 'DAHOD': [22.8364, 74.2532],
    'PANCHMAHAL': [22.7500, 73.6167], 'BHARUCH RLY.': [21.7051, 72.9959],
    'HYDERABAD CITY': [17.3850, 78.4867], 'CYBERABAD': [17.4500, 78.3800], 'RANGA REDDY': [17.2543, 78.3380],
    'VISAKHAPATNAM': [17.6868, 83.2185], 'VIJAYAWADA': [16.5062, 80.6480], 'VIJAYAWADA RLY.': [16.5062, 80.6480],
    'GUNTUR': [16.3067, 80.4365], 'KRISHNA': [16.1162, 81.1490], 'EAST GODAVARI': [17.0005, 81.8040],
    'WEST GODAVARI': [16.9174, 81.3399], 'GUNTAKAL RLY.': [15.2667, 77.6333], 'KARIMNAGAR': [18.4386, 79.1288],
    'WARANGAL': [17.9784, 79.5941], 'KHAMMAM': [17.2453, 80.1514], 'NELLORE': [14.4426, 79.9865],
    'KURNOOL': [15.8281, 78.0373], 'CHITTOOR': [13.2172, 79.1003], 'TIRUPATI': [13.6288, 79.4192],
    'ANANTAPUR': [14.6819, 77.5850], 'CUDDAPAH': [14.4674, 78.8241], 'ADILABAD': [19.6641, 78.5320],
    'NALGONDA': [17.0575, 79.2671], 'MAHABOOBNAGAR': [16.7488, 77.9853], 'MEDAK': [18.0522, 78.2641],
    'NIZAMABAD': [18.6725, 78.0940], 'PRAKASHAM': [15.3480, 80.0248], 'SRIKAKULAM': [18.2949, 83.8938],
    'VIZIANAGARAM': [18.1066, 83.3956], 'SECUNDERABAD RLY.': [17.4399, 78.4983],
    'DELHI UT TOTAL': [28.7041, 77.1025], 'NEW DELHI': [28.6139, 77.2090], 'CENTRAL': [28.6375, 77.2250],
    'EAST': [28.6280, 77.2910], 'WEST': [28.6340, 77.1100], 'NORTH': [28.7041, 77.1025],
    'SOUTH': [28.5244, 77.2066], 'NORTH EAST': [28.6692, 77.3094], 'NORTH WEST': [28.7041, 77.1025],
    'SOUTH EAST': [28.5244, 77.2066], 'SOUTH WEST': [28.5244, 77.2066], 'SHAHDARA': [28.6730, 77.2870],
    'KOLKATA': [22.5726, 88.3639], 'HOWRAH': [22.5804, 88.2636], 'HOWRAH G.R.P.': [22.5804, 88.2636],
    '24 PARGANAS SOUTH': [22.3000, 88.4000], '24 PARGANAS NORTH': [22.7000, 88.4500],
    'SILIGURI G.R.P.': [26.7271, 88.4285], 'SILIGURI': [26.7271, 88.4285], 'DARJEELING': [27.0360, 88.2627],
    'MURSHIDABAD': [24.1790, 88.2663], 'MALDA': [25.0963, 88.1320], 'MALDAH': [25.0963, 88.1320],
    'NADIA': [23.1700, 88.4800], 'BIRBHUM': [23.8700, 87.6200], 'BANKURA': [23.2324, 87.0667],
    'PURULIA': [23.3300, 86.3600], 'BARDHAMAN': [23.2324, 87.8625], 'BURDWAN': [23.2324, 87.8625],
    'HOOGHLY': [22.9000, 88.4000], 'MEDINIPUR': [22.4200, 87.3200], 'PASCHIM MEDINIPUR': [22.4200, 87.3200],
    'PURBA MEDINIPUR': [22.3000, 87.4500], 'NORTH 24 PARGANAS': [22.7000, 88.4500],
    'SOUTH 24 PARGANAS': [22.3000, 88.4000], 'KOLKATA RLY.': [22.5726, 88.3639],
    'CHENNAI': [13.0827, 80.2707], 'CHENNAI RLY.': [13.0827, 80.2707], 'CHENNAI COMMR.': [13.0827, 80.2707],
    'COIMBATORE': [11.0168, 76.9558], 'COIMBATORE RLY.': [11.0168, 76.9558], 'MADURAI': [9.9252, 78.1198],
    'TIRUCHIRAPPALLI': [10.7905, 78.7047], 'TRICHY RLY.': [10.7905, 78.7047], 'SALEM': [11.6643, 78.1460],
    'TIRUNELVELI': [8.7139, 77.7567], 'TIRUNELVELI URBAN': [8.7139, 77.7567], 'ERODE': [11.3410, 77.7172],
    'VELLORE': [12.9165, 79.1325], 'TIRUVALLUR': [13.1450, 79.9080], 'KANCHEEPURAM': [12.8342, 79.7036],
    'CUDDALORE': [11.7463, 79.7644], 'THANJAVUR': [10.7870, 79.1378], 'DHARMAPURI': [12.1275, 78.1580],
    'KRISHNAGIRI': [12.5200, 78.2100], 'NILGIRIS': [11.4916, 76.7339], 'DINDIGUL': [10.3500, 77.9500],
    'BANGALORE': [12.9716, 77.5946], 'BANGALORE COMMR.': [12.9716, 77.5946], 'BANGALORE RURAL': [13.2200, 77.5800],
    'MYSORE': [12.2958, 76.6394], 'HUBLI-DHARWAD': [15.3647, 75.1240], 'DHARWAD COMMR.': [15.4589, 75.0078],
    'DHARWAD RURAL': [15.4589, 75.0078], 'GULBARGA': [17.3297, 76.8343], 'BIJAPUR': [16.8302, 75.7100],
    'DAKSHIN KANNADA': [12.8700, 75.2700], 'UTTARA KANNADA': [14.7800, 74.5900],
    'CHAMARAJNAGAR': [11.9200, 76.9400], 'HASSAN': [13.0000, 76.1000], 'SHIMOGA': [13.9299, 75.5681],
    'BELLARY': [15.1353, 76.9103], 'RAICHUR': [16.2073, 77.3438], 'KOLAR': [13.1370, 78.1298],
    'TUMKUR': [13.3420, 77.1020], 'K.G.F.': [12.9500, 78.2700], 'BELGAUM': [15.8497, 74.4977],
    'GADAG': [15.4300, 75.6300], 'KOPPAL': [15.3500, 76.2800], 'YADGIRI': [16.7700, 77.1400],
    'BANGALORE COMMR. POLICE COMMISSIONERATE': [12.9716, 77.5946],
    'JAIPUR': [26.9124, 75.7873], 'JAIPUR RLY.': [26.9124, 75.7873], 'JODHPUR': [26.2389, 73.0243],
    'UDAIPUR': [24.5854, 73.7125], 'KOTA': [25.2138, 75.8648], 'AJMER': [26.4499, 74.6399],
    'G.R.P. AJMER': [26.4499, 74.6399], 'G.R.P.JODHPUR': [26.2389, 73.0243], 'ALWAR': [27.5530, 76.6346],
    'BHILWARA': [25.3500, 74.6300], 'BIKANER': [28.0229, 73.3119], 'BHARATPUR': [27.2170, 77.4895],
    'SAWAI MADHOPUR': [26.0200, 76.3500], 'SIKAR': [27.6094, 75.1399], 'PALI': [25.7711, 73.3235],
    'NAGAUR': [27.2000, 73.7800], 'TONK': [26.1600, 75.7900], 'DHOLPUR': [26.7026, 77.8934],
    'BARMER': [25.7526, 71.3926], 'CHURU': [28.3000, 74.9600], 'JHUNJHUNU': [28.1270, 75.4000],
    'SIROHI': [24.8887, 72.8567], 'DUNGARPUR': [23.8480, 73.7125], 'BANSWARA': [23.5500, 74.4400],
    'PRATAPGARH': [24.0300, 74.7800], 'KOTPUTLI': [27.7000, 76.2800], 'JAISALMER': [26.9157, 70.9083],
    'HALDIGHATI': [24.8000, 73.8000],
    'LUCKNOW': [26.8467, 80.9462], 'KANPUR': [26.4499, 80.3319], 'AGRA': [27.1767, 78.0081],
    'VARANASI': [25.3176, 82.9739], 'PRAYAGRAJ': [25.4358, 81.8463], 'ALLAHABAD': [25.4358, 81.8463],
    'MEERUT': [28.9845, 77.7066], 'GHAZIABAD': [28.6692, 77.4538], 'NOIDA': [28.5355, 77.3910],
    'ALIGARH': [27.8974, 78.0880], 'BAREILLY': [28.3670, 79.4304], 'MORADABAD': [28.8386, 78.7733],
    'GORAKHPUR': [26.7606, 83.3732], 'JHANSI': [25.4484, 78.5685], 'FIROZABAD': [27.1596, 78.3956],
    'SAHARANPUR': [29.9680, 77.5510], 'BANDA': [25.4800, 80.3400], 'MIRZAPUR': [25.1390, 82.5800],
    'JAUANPUR': [25.7490, 82.8600], 'JAUNPUR': [25.7490, 82.8600], 'SULTANPUR': [26.2600, 82.0700],
    'BHADOHI': [25.4200, 82.5700], 'RAE BARELI': [26.2300, 81.2400], 'RAEBAREILLY': [26.2300, 81.2400],
    'UNNAO': [26.5300, 80.4900], 'HARDOI': [27.3900, 80.1300], 'SITAPUR': [27.5700, 80.6800],
    'LAKHIMPUR KHERI': [27.9400, 80.7000], 'GONDA': [27.1300, 82.1700], 'BASTI': [26.7900, 82.7400],
    'FAIZABAD': [26.7700, 82.1400], 'AYODHYA': [26.7700, 82.1400], 'BAHRAICH': [27.5700, 81.6000],
    'BULANDSHAHR': [28.4100, 77.8500], 'BAGPAT': [28.9400, 77.2200], 'GAUTAM BUDDHA NAGAR': [28.5355, 77.3910],
    'Agra Rly': [27.1767, 78.0081], 'KANNAUJ': [27.0500, 79.9200], 'FATEHGARH': [27.1700, 79.5700],
    'HAMIRPUR': [25.9500, 80.1500], 'JALAUN': [26.1500, 79.3500], 'LALITPUR': [24.6900, 78.4100],
    'MAHOBA': [25.2900, 79.8700], 'SONBHADRA': [24.6800, 83.0500], 'MIRZAPUR': [25.1390, 82.5800],
    'DEORIA': [26.5000, 83.7800], 'MAU': [25.8800, 83.5200], 'BALLIA': [25.7600, 84.1500],
    'GHAZIPUR': [25.5800, 83.5800], 'CHANDAULI': [25.2000, 83.2700], 'MIRZAPUR': [25.1390, 82.5800],
    'KANSHIRAM NAGAR': [27.8000, 79.6700], 'HATHRAS': [27.5900, 78.0500], 'MAHAMAYA NAGAR': [27.5900, 78.0500],
    'SHAHJAHANPUR': [27.8800, 79.9100], 'MORADABAD': [28.8386, 78.7733], 'BUDAUN': [28.0300, 79.1200],
    'RAMPUR': [28.7900, 79.0300], 'PRABUDDH NAGAR': [27.6800, 82.9700], 'SIDDHARTHNAGAR': [27.1800, 83.0000],
    'KUSHI NAGAR': [26.7400, 83.8900], 'MAHARAJGANJ': [27.0800, 83.5700],
    'PATNA': [25.6093, 85.1376], 'PATNA RLY.': [25.6093, 85.1376], 'GAYA': [24.7960, 84.9940],
    'MUZAFFARPUR': [26.1209, 85.3647], 'MUZAFFARPUR RLY.': [26.1209, 85.3647], 'BHAGALPUR': [25.2425, 86.9842],
    'ARRAH': [25.5600, 84.5400], 'BHOJPUR': [25.5600, 84.5400], 'MUNGER': [25.3700, 86.4700],
    'NAUGACHIA': [25.4000, 87.1000], 'PURULIA': [23.3300, 86.3600],
    'JEHANABAD': [25.2100, 84.9900], 'ARWAL': [25.2500, 84.6700], 'NALANDA': [25.2000, 85.4500],
    'SAHEBGANJ': [25.2500, 87.2800], 'BANKA': [24.8800, 86.9900], 'KISHANGANJ': [26.1000, 87.9500],
    'PURNIA': [25.7800, 87.4700], 'KATIHAR': [25.5400, 87.5800], 'KATIHAR RLY.': [25.5400, 87.5800],
    'DARBHANGA': [26.1500, 86.1000], 'SITAMARHI': [26.5900, 85.4900], 'SHEOHAR': [26.5100, 85.2900],
    'EAST CHAMPARAN': [26.6300, 84.8700], 'WEST CHAMPARAN': [27.0400, 84.0000], 'BAGAHA': [27.1200, 84.0700],
    'AURAIYA': [26.4700, 79.4500],
    'BHOPAL': [23.2599, 77.4126], 'BHOPAL RLY.': [23.2599, 77.4126], 'INDORE': [22.7196, 75.8577],
    'INDORE RLY.': [22.7196, 75.8577], 'JABALPUR': [23.1815, 79.9864], 'JABALPUR RLY.': [23.1815, 79.9864],
    'GWALIOR': [26.2183, 78.1828], 'UCCHERPAIN': [22.5800, 77.5300], 'SAUGOR': [23.8400, 78.7400],
    'SAGAR': [23.8400, 78.7400], 'REWA': [24.5300, 81.3000], 'SATNA': [24.5800, 80.8300],
    'CHHATARPUR': [24.9200, 79.5900], 'DAMOH': [23.8500, 79.4400], 'PANNA': [24.7200, 80.1900],
    'SHAHDOL': [23.3000, 81.3600], 'JABALPUR': [23.1815, 79.9864], 'MANDLA': [22.6000, 80.3700],
    'BALAGHAT': [21.8100, 80.1900], 'CHhindwara': [22.0600, 78.9400], 'CHHINDWARA': [22.0600, 78.9400],
    'Betul': [21.9100, 77.9300], 'BETUL': [21.9100, 77.9300], 'HARDA': [22.3400, 77.1000],
    'HOSHANGABAD': [22.7500, 77.7200], 'NARMADAPURAM': [22.7500, 77.7200], 'RATLAM': [23.3200, 75.0400],
    'UJJAIN': [23.1800, 75.7900], 'DEWAS': [22.9600, 76.0600], 'SHAJAPUR': [23.4300, 76.2700],
    'KHARGONE': [21.8200, 75.6100], 'BARWANI': [22.0300, 74.8000], 'DHAR': [22.5900, 75.3000],
    'JHABUA': [22.5000, 74.5900], 'ALIRAJPUR': [22.3400, 74.3600], 'MANDSAUR': [24.0400, 75.0800],
    'NEEMUCH': [24.4700, 74.8700], 'MORENA': [26.5000, 78.0000], 'BHIND': [26.5700, 78.7900],
    'DATIA': [25.6700, 78.4600], 'ASHOKNAGAR': [24.5600, 77.7300], 'SHIVPURI': [25.4300, 77.6600],
    'GUNA': [24.6400, 77.3100], 'RAJGARH': [24.0100, 76.7300], 'VIDISHA': [23.5300, 77.8100],
    'SEHORE': [23.2000, 77.0900], 'RAISEN': [23.3300, 77.7800], 'BHOJPUR': [25.5600, 84.5400],
    'UMARIYA': [23.5300, 80.8300], 'ANUPPUR': [23.1800, 81.7000], 'DINDORI': [22.9500, 81.0800],
    'MANDLA': [22.6000, 80.3700], 'SIDDHI': [24.3500, 81.3800], 'SHAHDOL': [23.3000, 81.3600],
    'SEONI': [22.0800, 79.5500], 'NARSINGHPUR': [22.9500, 79.1900], 'PANDHURNA': [22.2400, 78.8300],
    'KHANDWA': [21.8300, 76.3500], 'BURHANPUR': [21.3100, 76.2300], 'HOSHANGABAD': [22.7500, 77.7200],
    'SHEOPUR': [25.6700, 76.6900], 'AGAR MALWA': [23.0100, 75.0400],
    'RAIPUR': [21.2514, 81.6296], 'GRP RAIPUR': [21.2514, 81.6296], 'BHILAI': [21.2100, 81.4300],
    'DURG': [21.1900, 81.2800], 'JAGDALPUR': [19.0900, 82.0000], 'KORBA': [22.3400, 82.6900],
    'BILASPUR': [22.0800, 82.1500], 'RAJNANDGAON': [21.1000, 80.6700], 'KAWARDHA': [22.0200, 81.0300],
    'KABIRDHAM': [22.0200, 81.0300], 'DHAMTARI': [20.7100, 81.5500], 'GARIABAND': [20.6300, 81.8300],
    'BEMETARA': [21.3800, 81.5300], 'SURAJPUR': [23.3700, 82.8000], 'BALOD': [21.0500, 81.0000],
    'BALODA BAZAR': [21.6200, 82.1700], 'BASTAR': [19.1000, 81.9600], 'KONDAGAON': [19.6500, 81.6600],
    'NARAYANPUR': [19.7300, 81.1800], 'DANTEWARA': [18.9000, 81.3500], 'SUKMA': [18.6000, 81.6000],
    'KORIYA': [23.2700, 82.6800], 'KORBA': [22.3400, 82.6900],
    'CHAMPAWAT': [29.3400, 80.0900], 'ALMORA': [29.6000, 79.6600], 'NAINITAL': [29.3800, 79.4500],
    'PITHORAGARH': [29.5800, 80.2200], 'UDDHAM SINGH NAGAR': [28.7700, 79.9700],
    'HARDWAR': [29.8800, 78.1600], 'DEHRADUN': [30.3165, 78.0322], 'TEHRI GARHWAL': [30.3800, 78.4800],
    'UTTARKASHI': [30.7300, 78.4500], 'CHAMOLI': [30.4000, 79.3200], 'RUDRA PRAYAG': [30.2800, 78.9800],
    'PAURI GARHWAL': [30.1500, 78.7800], 'LAHUL-SPITI': [32.5500, 77.2500], 'KINNAUR': [31.5800, 78.2500],
    'MANDI': [31.7100, 76.9300], 'KULLU': [31.9600, 77.1100], 'CHAMBA': [32.5500, 76.1300],
    'KANGRA': [32.1000, 76.2700], 'HAMIRPUR': [31.6900, 76.5200], 'UNA': [31.4700, 76.2700],
    'SOLAN': [30.9000, 77.1000], 'SIRMAUR': [30.6000, 77.3300], 'SHIMLA': [31.1048, 77.1734],
    'PATHANKOT': [32.2700, 75.6500], 'GURDASPUR': [32.0400, 75.4000], 'HOSHIARPUR': [31.5100, 75.9100],
    'JALANDHAR': [31.3260, 75.5762], 'JALANDHAR RURAL': [31.3260, 75.5762], 'KAPURTHALA': [31.3800, 75.3900],
    'LUDHIANA': [30.9010, 75.8573], 'LUDHIANA RURAL': [30.9010, 75.8573], 'MOGA': [30.8200, 75.1800],
    'FEROZPUR': [30.9200, 74.6200], 'FARIDKOT': [30.6700, 74.7500], 'MUKTSAR': [30.4800, 74.5200],
    'BATHINDA': [30.2100, 74.9500], 'BHATINDA': [30.2100, 74.9500], 'MANSA': [29.9900, 75.3900],
    'SANGRUR': [30.2500, 75.8400], 'PATIALA': [30.3400, 76.3900], 'FATEHGARH SAHIB': [30.6800, 76.7200],
    'RUPNAGAR': [30.9700, 76.5300], 'ROPAR': [30.9700, 76.5300], 'NAWANSHAHAR': [31.1200, 76.1200],
    'TARN TARAN': [31.4500, 74.9200], 'AMRITSAR RLY.': [31.6300, 74.8700], 'CP JALANDHAR': [31.3260, 75.5762],
    'SBS NAGAR': [31.1200, 76.1200], 'FAZILKA': [30.4000, 74.0200], 'BATALA': [31.8200, 75.2000],
    'KHANNA': [30.7000, 76.2200],
    'HYDERABAD CITY': [17.3850, 78.4867], 'SECUNDERABAD RLY.': [17.4399, 78.4983],
    'VISAKHAPATNAM': [17.6868, 83.2185], 'VIJAYAWADA': [16.5062, 80.6480], 'GUNTUR': [16.3067, 80.4365],
    'WARANGAL': [17.9784, 79.5941], 'KARIMNAGAR': [18.4386, 79.1288], 'KHAMMAM': [17.2453, 80.1514],
    'NELLORE': [14.4426, 79.9865], 'KURNOOL': [15.8281, 78.0373], 'ADILABAD': [19.6641, 78.5320],
    'CHITTOOR': [13.2172, 79.1003], 'ANANTAPUR': [14.6819, 77.5850], 'CUDDAPAH': [14.4674, 78.8241],
    'EAST GODAVARI': [17.0005, 81.8040], 'WEST GODAVARI': [16.9174, 81.3399], 'GUNTAKAL RLY.': [15.2667, 77.6333],
    'NALGONDA': [17.0575, 79.2671], 'MAHABOOBNAGAR': [16.7488, 77.9853], 'MEDAK': [18.0522, 78.2641],
    'NIZAMABAD': [18.6725, 78.0940], 'PRAKASHAM': [15.3480, 80.0248], 'SRIKAKULAM': [18.2949, 83.8938],
    'VIZIANAGARAM': [18.1066, 83.3956], 'RANGA REDDY': [17.2543, 78.3380],
    'IMPHAL WEST': [24.7800, 93.9500], 'IMPHAL EAST': [24.7800, 93.9500], 'THOUBAL': [24.6300, 94.0000],
    'BISHNUPUR': [24.6300, 93.8700], 'CHURACHANDPUR': [24.3300, 93.6800], 'SENAPATI': [25.4200, 94.0800],
    'UKHRUL': [25.0800, 94.3700], 'CHANDEL': [24.3300, 94.7700], 'TAMENGLONG': [24.9700, 93.5000],
    'AIZAWL': [23.7271, 92.7176], 'CHAMPHAI': [23.4800, 93.3200], 'LUNGLEI': [22.8800, 92.7300],
    'SERCHHIP': [23.1700, 92.9000], 'MAMIT': [23.3300, 92.3800], 'SAIHA': [22.4800, 92.9800],
    'KOLASIB': [24.2200, 92.6800], 'AIZAWL': [23.7271, 92.7176],
    'AIZAWL': [23.7271, 92.7176], 'KOHIMA': [25.6586, 94.1086], 'DIMAPUR': [25.9100, 93.7300],
    'MOKOKCHUNG': [26.3200, 94.5200], 'TUENSANG': [26.2700, 94.8200], 'WOKHA': [26.1000, 94.2700],
    'ZUNHEBOTO': [26.0200, 94.5200], 'PHEK': [25.5500, 94.2500], 'MON': [26.6500, 94.8700],
    'LONGLENG': [26.5200, 94.9200], 'KIPHIRE': [25.8700, 94.8000], 'PEREN': [25.5500, 93.7300],
    'TAWANG': [27.5800, 91.8700], 'WEST KAMENG': [27.2500, 92.4200], 'EAST KAMENG': [27.3000, 93.2200],
    'PAPUM PARE': [27.1300, 93.7200], 'KURUNG KUMEY': [27.9000, 93.5000], 'SUBANSIRI UPPER': [27.5700, 93.7200],
    'SUBANSIRI LOWER': [27.2700, 93.8700], 'DIBANG VALLEY': [28.7000, 95.8500],
    'UPPER DIBANG VALLEY': [28.4500, 95.9700], 'SIANG UPPER': [28.7700, 95.2300],
    'SIANG WEST': [28.4500, 94.7200], 'SIANG EAST': [28.1300, 94.8700],
    'PASIGHAT': [28.0700, 95.3300], 'LOHIT': [27.8800, 96.0000], 'CHANGLANG': [27.2200, 95.7300],
    'TIRAP': [27.0000, 95.4700], 'ANJAW': [27.8700, 96.8200], 'KAMENG EAST': [27.3000, 93.2200],
    'KAMENG WEST': [27.2500, 92.4200], 'K.KUMEY': [27.9000, 93.5000],
    'SHILLONG': [25.5788, 91.8933], 'EAST KHASI HILLS': [25.5788, 91.8933], 'WEST KHASI HILLS': [25.5200, 91.2700],
    'SOUTH GARO HILLS': [25.2500, 90.6200], 'EAST GARO HILLS': [25.5700, 90.5800],
    'WEST GARO HILLS': [25.5200, 90.2200], 'JOWAI': [25.4500, 92.2000], 'JAKHALANDHAR': [31.3260, 75.5762],
    'RI-BHOI': [25.8500, 91.8800], 'NORTH GARO HILLS': [25.9200, 90.5700], 'SOUTH WEST KHASI HILLS': [25.3000, 91.1000],
    'EAST JAINITIA HILLS': [25.4500, 92.2000], 'JAINTIA HILLS': [25.4500, 92.2000], 'KHASI HILLS EAST': [25.5788, 91.8933],
    'KHASI HILLS WEST': [25.5200, 91.2700],
    'DIMAPUR': [25.9100, 93.7300], 'KOHIMA': [25.6586, 94.1086],
    'GANGTOK': [27.3389, 88.6065], 'EAST DISTRICT': [27.3389, 88.6065], 'WEST DISTRICT': [27.3000, 88.2500],
    'NORTH DISTRICT': [27.4500, 88.5000], 'SOUTH DISTRICT': [27.2000, 88.4000],
    'THIRUVANANTHAPURAM': [8.5241, 76.9366], 'ERNAKULAM': [9.9312, 76.2673], 'ERNAKULAM COMMR.': [9.9312, 76.2673],
    'KOCHI': [9.9312, 76.2673], 'CALICUT': [11.2588, 75.7804], 'KOZHIKODE': [11.2588, 75.7804],
    'MALAPPURAM': [11.0510, 76.0711], 'THRISSUR': [10.5276, 76.2144], 'PALAKKAD': [10.7867, 76.6547],
    'KOTTAYAM': [9.5916, 76.5222], 'IDUKKI': [9.8500, 77.1000], 'KOLLAM': [8.8932, 76.6141],
    'PATHANAMTHITTA': [9.2648, 76.7856], 'WAYANAD': [11.6850, 76.1320], 'KASARAGOD': [12.4990, 74.9868],
    'KANNUR': [11.8745, 75.3704],
    'Agra Rly': [27.1767, 78.0081],
    'CHENNAI': [13.0827, 80.2707], 'COIMBATORE': [11.0168, 76.9558], 'MADURAI': [9.9252, 78.1198],
    'TRICHY RLY.': [10.7905, 78.7047], 'CHENNAI RLY.': [13.0827, 80.2707],
  };
  const stateCoords = STATE_COORDS[s] || [20.5937, 78.9629];
  return knownCoords[d] || estimatedCoords(d + '|' + s, stateCoords, 4);
}

// Builds the heatmap payload shared by /api/heatmap (in-memory) and
// /api/analytics/heatmap (SQL aggregation). Response shapes are identical.
function buildHeatmap(filtered, opts = {}) {
  // When no single crime type is requested we must sum only additive columns.
  // 'TOTAL IPC CRIMES' plus the RAPE / KIDNAPPING & ABDUCTION / THEFT roll-ups
  // would otherwise count the same incident up to three times.
  const singleType = Boolean(opts.crimeType && opts.crimeType !== 'ALL');
  const districtMap = {};
  filtered.forEach(r => {
    if (!singleType && NON_ADDITIVE_CRIME_SET.has(r.crimeType)) return;
    const key = `${r.state}|${r.district}`;
    if (!districtMap[key]) {
      const coords = getDistrictCoords(r.district, r.state);
      districtMap[key] = { state: r.state, district: r.district, latitude: coords[0], longitude: coords[1], crimeCount: 0, crimeTypes: {}, hasHistorical: false, liveFIRs: 0, liveCases: 0, liveCrimeReports: 0 };
    }
    districtMap[key].crimeCount += r.count;
    districtMap[key].hasHistorical = true;
    districtMap[key].crimeTypes[r.crimeType] = (districtMap[key].crimeTypes[r.crimeType] || 0) + r.count;
  });

  // Live FIR / case / report counts are operational records, not NCRB
  // incidents. They are reported as separate fields and never added to
  // crimeCount, which stays a pure dataset figure.
  firs.forEach(fir => {
    const key = `${fir.state}|${fir.district}`;
    if (districtMap[key]) {
      districtMap[key].liveFIRs++;
      districtMap[key].crimeTypes[fir.crimeType] = (districtMap[key].crimeTypes[fir.crimeType] || 0) + 1;
    } else {
      const coords = getDistrictCoords(fir.district, fir.state);
      districtMap[key] = { state: fir.state, district: fir.district, latitude: coords[0], longitude: coords[1], crimeCount: 0, crimeTypes: { [fir.crimeType]: 1 }, hasHistorical: false, liveFIRs: 1, liveCases: 0, liveCrimeReports: 0 };
    }
  });

  // Add live case data
  cases.forEach(c => {
    const key = `${c.state}|${c.district}`;
    if (districtMap[key]) {
      districtMap[key].liveCases++;
    }
  });

  // Add live crime report data
  crimeReports.forEach(r => {
    const key = `${r.state}|${r.district}`;
    if (districtMap[key]) {
      districtMap[key].liveCrimeReports++;
    }
  });

  const districts = Object.values(districtMap).sort((a, b) => b.crimeCount - a.crimeCount);
  const maxCount = districts.length > 0 ? districts[0].crimeCount : 1;

  districts.forEach(d => {
    d.intensity = d.crimeCount > 0 ? Math.round((d.crimeCount / maxCount) * 100) : 0;
    const topCrime = Object.entries(d.crimeTypes).sort((a, b) => b[1] - a[1])[0];
    d.topCrime = topCrime ? topCrime[0] : 'Unknown';
    d.topCrimeCount = topCrime ? topCrime[1] : 0;
    delete d.crimeTypes;
  });

  const stateAgg = {};
  districts.forEach(d => {
    if (!stateAgg[d.state]) stateAgg[d.state] = { state: d.state, crimeCount: 0, districtCount: 0, districts: [], hasHistorical: false };
    stateAgg[d.state].crimeCount += d.crimeCount;
    if (d.hasHistorical) {
      stateAgg[d.state].districtCount++;
      stateAgg[d.state].hasHistorical = true;
    }
    stateAgg[d.state].districts.push(d.district);
  });
  const states = Object.values(stateAgg).sort((a, b) => b.crimeCount - a.crimeCount);
  const maxStateCount = states.length > 0 ? states[0].crimeCount : 1;
  states.forEach(s => { s.intensity = s.crimeCount > 0 ? Math.round((s.crimeCount / maxStateCount) * 100) : 0; s.latitude = (STATE_COORDS[s.state.toUpperCase()] || [20.5937, 78.9629])[0]; s.longitude = (STATE_COORDS[s.state.toUpperCase()] || [20.5937, 78.9629])[1]; });

  const years = [...new Set(historicalData.map(r => r.year))].sort();
  const crimeTypes = [...new Set(historicalData.map(r => r.crimeType))]
    .filter(c => isAdditiveCrimeType(c))
    .sort();

  // Dataset-only counts: districts/states that actually appear in the CSV.
  const historicalDistricts = districts.filter(d => d.hasHistorical);
  const historicalStates = new Set(historicalDistricts.map(d => d.state));

  return {
    districts,
    states,
    filters: { years, crimeTypes, states: allStates },
    summary: {
      totalDistricts: historicalDistricts.length,
      totalStates: historicalStates.size,
      totalCrimes: historicalDistricts.reduce((s, d) => s + d.crimeCount, 0),
      totalLiveFIRs: districts.reduce((s, d) => s + d.liveFIRs, 0),
      totalLiveCases: districts.reduce((s, d) => s + d.liveCases, 0),
      totalLiveCrimeReports: districts.reduce((s, d) => s + d.liveCrimeReports, 0),
      datasetRows: historicalData.length,
      datasetDistricts: allDistricts.length,
      datasetStates: allStates.length,
    },
  };
}

function heatmapFilters(query) {
  const { year, crimeType, state } = query;
  const where = [`UPPER(district) NOT LIKE '%TOTAL%'`];
  const params = [];
  if (year) {
    params.push(Number(year));
    where.push(`year = $${params.length}`);
  }
  if (crimeType && crimeType !== 'ALL') {
    params.push(crimeType);
    where.push(`crime_type = $${params.length}`);
  }
  if (state) {
    params.push(`%${String(state).toUpperCase()}%`);
    where.push(`UPPER(state) LIKE $${params.length}`);
  }
  return { where, params };
}

app.get('/api/heatmap', (req, res) => {
  const { year, crimeType, state } = req.query;
  let filtered = historicalData.filter(r => !r.district.toUpperCase().includes('TOTAL'));
  if (year) filtered = filtered.filter(r => r.year === Number(year));
  if (crimeType && crimeType !== 'ALL') filtered = filtered.filter(r => r.crimeType === crimeType);
  if (state) filtered = filtered.filter(r => r.state.toUpperCase().includes(state.toUpperCase()));
  res.json(buildHeatmap(filtered, { crimeType }));
});

// Same payload as /api/heatmap, aggregated by PostgreSQL instead of in memory.
app.get('/api/analytics/heatmap', async (req, res, next) => {
  try {
    const { where, params } = heatmapFilters(req.query);
    const { rows } = await db.query(
      `SELECT state, district, crime_type, SUM(crime_count)::bigint AS count
         FROM crime_records
        WHERE ${where.join(' AND ')}
        GROUP BY state, district, crime_type`,
      params
    );
    const entries = rows.map(r => ({
      state: r.state,
      district: r.district,
      year: 0,
      crimeType: r.crime_type,
      count: Number(r.count),
    }));
    res.json(buildHeatmap(entries, { crimeType: req.query.crimeType }));
  } catch (error) {
    next(error);
  }
});

// Paginated historical crime records straight from PostgreSQL.
app.get('/api/analytics/crimes', async (req, res, next) => {
  try {
    const { where, params } = heatmapFilters(req.query);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));

    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total FROM crime_records WHERE ${where.join(' AND ')}`,
      params
    );
    const total = countResult.rows[0].total;

    const offset = (page - 1) * limit;
    const listParams = [...params, limit, offset];
    const { rows } = await db.query(
      `SELECT state, district, year, crime_type, crime_count
         FROM crime_records
        WHERE ${where.join(' AND ')}
        ORDER BY year DESC, crime_count DESC
        LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );

    res.json({
      data: rows.map(r => ({
        state: r.state,
        district: r.district,
        year: r.year,
        crimeType: r.crime_type,
        count: Number(r.crime_count),
      })),
      meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/heatmap/state/:stateName', (req, res) => {
  const stateName = req.params.stateName.toUpperCase();
  const stateDistricts = historicalData.filter(r => r.state.toUpperCase().includes(stateName) && !r.district.toUpperCase().includes('TOTAL') && isAdditiveCrimeType(r.crimeType));
  const districtMap = {};
  stateDistricts.forEach(r => {
    if (!districtMap[r.district]) {
      const coords = getDistrictCoords(r.district, r.state);
      districtMap[r.district] = { district: r.district, latitude: coords[0], longitude: coords[1], crimeCount: 0, crimeTypes: {}, years: {} };
    }
    districtMap[r.district].crimeCount += r.count;
    districtMap[r.district].crimeTypes[r.crimeType] = (districtMap[r.district].crimeTypes[r.crimeType] || 0) + r.count;
    districtMap[r.district].years[r.year] = (districtMap[r.district].years[r.year] || 0) + r.count;
  });
  const districts = Object.values(districtMap).sort((a, b) => b.crimeCount - a.crimeCount);
  const maxCount = districts.length > 0 ? districts[0].crimeCount : 1;
  districts.forEach(d => {
    d.intensity = Math.round((d.crimeCount / maxCount) * 100);
    const topCrime = Object.entries(d.crimeTypes).sort((a, b) => b[1] - a[1])[0];
    d.topCrime = topCrime ? topCrime[0] : 'Unknown';
    const yearEntries = Object.entries(d.years).sort((a, b) => b[0] - a[0]);
    d.latestYear = yearEntries.length > 0 ? Number(yearEntries[0][0]) : 0;
    d.latestYearCount = yearEntries.length > 0 ? yearEntries[0][1] : 0;
    d.prevYearCount = yearEntries.length > 1 ? yearEntries[1][1] : d.latestYearCount;
    d.yearOverYearChange = d.prevYearCount > 0 ? Math.round(((d.latestYearCount - d.prevYearCount) / d.prevYearCount) * 100) : 0;
    delete d.crimeTypes;
    delete d.years;
  });
  const totalCrimes = districts.reduce((s, d) => s + d.crimeCount, 0);
  res.json({ state: req.params.stateName, districts, summary: { totalDistricts: districts.length, totalCrimes, topDistrict: districts.length > 0 ? districts[0].district : null, topCrime: districts.length > 0 ? districts[0].topCrime : null } });
});

app.get('/api/heatmap/district/:districtName', (req, res) => {
  const distName = req.params.districtName.toUpperCase();
  const records = historicalData.filter(r => r.district.toUpperCase().includes(distName) && isAdditiveCrimeType(r.crimeType));
  const yearData = {};
  const crimeTypeData = {};
  let state = '';
  records.forEach(r => {
    state = r.state;
    yearData[r.year] = (yearData[r.year] || 0) + r.count;
    crimeTypeData[r.crimeType] = (crimeTypeData[r.crimeType] || 0) + r.count;
  });
  const totalCrimes = records.reduce((s, r) => s + r.count, 0);
  const years = Object.entries(yearData).sort((a, b) => a[0] - b[0]).map(([year, count]) => ({ year: Number(year), count }));
  const crimes = Object.entries(crimeTypeData).sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, count, percentage: totalCrimes > 0 ? Math.round((count / totalCrimes) * 100) : 0 }));
  const coords = getDistrictCoords(req.params.districtName, state);
  const latestYear = years.length > 0 ? years[years.length - 1].count : 0;
  const prevYear = years.length > 1 ? years[years.length - 2].count : latestYear;
  res.json({ district: req.params.districtName, state, latitude: coords[0], longitude: coords[1], totalCrimes, yearTrend: years, crimeBreakdown: crimes, latestYearCount: latestYear, yearOverYearChange: prevYear > 0 ? Math.round(((latestYear - prevYear) / prevYear) * 100) : 0, riskScore: Math.min(100, Math.round((latestYear / (totalCrimes / Math.max(1, years.length))) * 50)) });
});

// ---------------------------------------------------------------------------
// AI CHAT - compact project digest handed to Groq
// ---------------------------------------------------------------------------
// Only aggregates leave this scope: never the raw 270k-row table, never any
// personal field. The base summary is memoised and invalidated by
// rebuildDerived(); anything query specific is computed with one filtered pass.
function aiBaseDigest() {
  if (aiDigestCache) return aiDigestCache;

  const isDistrictRow = r => !r.district.toUpperCase().includes('TOTAL');
  const yearTotals = {};
  const stateTotals = {};
  const typeTotals = {};
  const districtTotals = {};
  const aggregateTotals = {};
  let totalHistoricalCrimes = 0;

  historicalData.forEach(r => {
    if (!isDistrictRow(r)) return;
    // The total column is already reported as totalHistoricalCrimes; the three
    // true roll-ups overlap their children and are reported separately.
    if (r.crimeType === TOTAL_CRIME_COLUMN) return;
    if (NON_ADDITIVE_CRIME_SET.has(r.crimeType)) {
      aggregateTotals[r.crimeType] = (aggregateTotals[r.crimeType] || 0) + r.count;
      return;
    }
    if (!isAdditiveCrimeType(r.crimeType)) return;
    totalHistoricalCrimes += r.count;
    yearTotals[r.year] = (yearTotals[r.year] || 0) + r.count;
    stateTotals[r.state] = (stateTotals[r.state] || 0) + r.count;
    typeTotals[r.crimeType] = (typeTotals[r.crimeType] || 0) + r.count;
    const key = `${r.state} / ${r.district}`;
    districtTotals[key] = (districtTotals[key] || 0) + r.count;
  });

  const top = (map, limit) =>
    Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => ({ name, count }));

  const latestYear = allYears.length ? allYears[allYears.length - 1] : null;
  const prevYear = latestYear ? latestYear - 1 : null;

  const firStatuses = {};
  firs.forEach(f => { firStatuses[f.status] = (firStatuses[f.status] || 0) + 1; });
  const caseStatuses = {};
  cases.forEach(c => { caseStatuses[c.status] = (caseStatuses[c.status] || 0) + 1; });
  const sosStatuses = {};
  sosAlerts.forEach(s => { sosStatuses[s.status] = (sosStatuses[s.status] || 0) + 1; });
  const officerStatuses = {};
  officers.forEach(o => { officerStatuses[o.status] = (officerStatuses[o.status] || 0) + 1; });

  aiDigestCache = {
    dataset: {
      name: 'NCRB district-level IPC crime records, India',
      coverage: allYears.length ? `${allYears[0]}-${allYears[allYears.length - 1]}` : 'n/a',
      rowRecords: historicalData.length,
      states: allStates.length,
      districtNames: allDistricts.length,
      crimeTypes: allCrimeTypes.length,
      notes: [
        'Every figure below is an administrative district/state aggregate for the coverage years, not an incident location.',
        'totalHistoricalCrimes is the sum of all 26 additive crime types. topCrimeTypes, topStates and topDistricts are truncated leaderboards, so they do not add up to it.',
        'overlappingAggregates (RAPE, KIDNAPPING & ABDUCTION, THEFT) count cases already included in their sub-types - never add them to totalHistoricalCrimes.',
        'When focus is present it is the authoritative slice for this question; prefer focus over the top-level leaderboards.',
        'requestedYears are the years named in the user message. Answer from focus.byYear or years for those years only.',
      ],
    },
    totalHistoricalCrimes,
    years: allYears.map(y => ({ year: y, count: yearTotals[y] || 0 })),
    topStates: top(stateTotals, 8),
    topDistricts: top(districtTotals, 8),
    topCrimeTypes: top(typeTotals, 10),
    overlappingAggregates: aggregateTotals,
    latestYear: latestYear === null ? null : {
      year: latestYear,
      count: yearTotals[latestYear] || 0,
      previousYear: prevYear,
      previousCount: yearTotals[prevYear] || 0,
      yoyPercent:
        yearTotals[prevYear] > 0
          ? Math.round(((yearTotals[latestYear] - yearTotals[prevYear]) / yearTotals[prevYear]) * 100)
          : 0,
    },
    liveOperational: {
      note: 'Live operational records are separate from the historical dataset and must never be added to it.',
      firs: { total: firs.length, byStatus: firStatuses },
      cases: { total: cases.length, byStatus: caseStatuses },
      citizenCrimeReports: { total: crimeReports.length },
      sosAlerts: { total: sosAlerts.length, byStatus: sosStatuses },
      officers: { total: officers.length, byStatus: officerStatuses },
    },
  };

  return aiDigestCache;
}

function aiMentions(query) {
  const upper = String(query || '').toUpperCase();
  const pick = list => list.filter(v => v.length >= 4 && upper.includes(v.toUpperCase())).slice(0, 3);
  return {
    districts: pick(allDistricts),
    states: pick(allStates),
    types: pick(allCrimeTypes),
    years: allYears.filter(y => upper.includes(String(y))),
  };
}

function aiFocusSlice(mentions) {
  const hasPlace = mentions.districts.length > 0 || mentions.states.length > 0;
  const hasType = mentions.types.length > 0;
  if (!hasPlace && !hasType) return null;

  const typeMatch = r => !hasType || mentions.types.some(t => r.crimeType.toUpperCase() === t.toUpperCase());
  const placeMatch = r =>
    !hasPlace ||
    mentions.districts.some(d => r.district.toUpperCase() === d.toUpperCase()) ||
    mentions.states.some(s => r.state.toUpperCase() === s.toUpperCase());

  const yearTotals = {};
  const typeTotals = {};
  const districtTotals = {};
  let total = 0;

  historicalData.forEach(r => {
    if (r.district.toUpperCase().includes('TOTAL')) return;
    const keep = hasType ? typeMatch(r) && placeMatch(r) : isAdditiveCrimeType(r.crimeType) && placeMatch(r);
    if (!keep) return;
    total += r.count;
    yearTotals[r.year] = (yearTotals[r.year] || 0) + r.count;
    typeTotals[r.crimeType] = (typeTotals[r.crimeType] || 0) + r.count;
    const key = `${r.state} / ${r.district}`;
    districtTotals[key] = (districtTotals[key] || 0) + r.count;
  });

  if (!total) return { matched: { ...mentions }, totalCrimes: 0, note: 'No records matched those terms in the dataset.' };

  const top = (map, limit) =>
    Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, count]) => ({ name, count }));

  return {
    matched: { districts: mentions.districts, states: mentions.states, crimeTypes: mentions.types },
    totalCrimes: total,
    byYear: allYears.map(y => ({ year: y, count: yearTotals[y] || 0 })),
    topCrimeTypes: top(typeTotals, 8),
    topDistricts: top(districtTotals, 8),
  };
}

function buildAiProjectDigest(query) {
  const base = aiBaseDigest();
  const mentions = aiMentions(query);
  const focus = aiFocusSlice(mentions);
  return JSON.stringify({
    ...base,
    focus,
    requestedYears: mentions.years.length ? mentions.years : null,
  });
}

const aiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: Number(process.env.AI_RATE_LIMIT_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests, please try again shortly.', code: 'AI_RATE_LIMITED' },
});

// Requires a valid JWT (auth.authenticate) and passes authorize() for every
// seeded role - citizens and read-only viewers included - because the payload
// only ever contains aggregate figures.
app.post('/api/ai/chat', aiLimiter, async (req, res) => {
  try {
    const body = req.body || {};
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) {
      return res.status(400).json({ error: 'Message is required', code: 'EMPTY_MESSAGE' });
    }
    if (message.length > aiChat.MAX_MESSAGE_CHARS) {
      return res
        .status(400)
        .json({ error: `Message is too long (max ${aiChat.MAX_MESSAGE_CHARS} characters)`, code: 'MESSAGE_TOO_LONG' });
    }
    if (!aiChat.isConfigured()) {
      return res
        .status(503)
        .json({ error: 'The AI assistant is not configured on this server.', code: 'AI_NOT_CONFIGURED' });
    }

    const scope = aiChat.classifyScope(message);
    const needsProjectData = scope === 'project' || scope === 'both';
    const context = needsProjectData ? buildAiProjectDigest(message) : null;

    const result = await aiChat.chat({
      message,
      conversation: Array.isArray(body.conversation) ? body.conversation : [],
      scope,
      context,
    });
    res.json(result);
  } catch (error) {
    console.error('[ai] chat failed:', error.code || 'ERROR', error.message);
    res.status(error.status && error.status >= 400 && error.status < 600 ? 502 : 500).json({
      error: error.clientMessage || 'AI request failed',
      code: error.code || 'AI_UPSTREAM_ERROR',
    });
  }
});

// ---------------------------------------------------------------------------
// Error handler (Express 4 requires the 4-arg signature)
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[api] error:', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ---------------------------------------------------------------------------
// SPA fallback - serve index.html for all non-API routes
// ---------------------------------------------------------------------------
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ---------------------------------------------------------------------------
// Health (public)
// ---------------------------------------------------------------------------
app.get('/api/health', async (_req, res) => {
  const databaseUp = await db.healthCheck().catch(() => false);
  res.status(databaseUp ? 200 : 503).json({
    status: databaseUp ? 'ok' : 'degraded',
    database: databaseUp ? 'connected' : 'unavailable',
    uptime: Math.round(process.uptime()),
    records: historicalData.length,
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// Start: migrate -> seed once -> hydrate -> listen
// ---------------------------------------------------------------------------
async function bootstrap() {
  try {
    await db.migrate();

    const seededFlag = await db.getMeta('seeded_v1');
    if (db.isDatabaseConfigured) {
      const userRows = await db.one('SELECT COUNT(*)::int AS n FROM users');
      if (!userRows || userRows.n === 0) {
        console.log('[db] first boot - importing operational fixtures');
        applyDefaultPasswords();
        await persistence.persistAll();
      }
      if ((await db.crimeRecordsCount()) === 0) {
        const started = Date.now();
        const csvRecords = loadCsvRecords();
        console.log(`[db] importing ${csvRecords.length} historical crime records from the NCRB CSV`);
        await db.importCrimeRecords(csvRecords);
        console.log(`[db] imported in ${Date.now() - started}ms`);
      }
      if (!seededFlag) await db.setMeta('seeded_v1', new Date().toISOString());
    } else {
      // In-memory (demo) mode: seed the fixture passwords so authentication works.
      applyDefaultPasswords();
    }

    if (db.isDatabaseConfigured) {
      await persistence.hydrate();
      historicalData = await db.loadCrimeRecords();
    }
    rebuildDerived();
    await persistence.flush();

    // Create the HTTP server once and share it between Express and Socket.IO.
    httpServer = http.createServer(app);

    // Initialize Socket.IO real-time server on the same HTTP server.
    initSocketIO(httpServer, {
      officers,
      sosAlerts,
      notifications,
      auditLogs,
      users,
      persist: () => persistence.persistAll(),
    });

    httpServer.listen(PORT, () => {
      const span = allYears.length ? `${allYears[0]}-${allYears[allYears.length - 1]}` : 'n/a';
      console.log(
        `Server running on http://localhost:${PORT} (API + Frontend + Socket.IO)\n` +
          `Historical data: ${historicalData.length} records from ${span} across ` +
          `${allStates.length} states, ${allDistricts.length} districts, ${allCrimeTypes.length} crime types`
      );
    });
  } catch (error) {
    console.error('[boot] failed to start server:', error);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Export operational state so auth (and other modules) can resolve users /
// officers in in-memory (demo) mode without a database.
module.exports = { users, officers, sosAlerts, notifications, auditLogs };

let shuttingDown = false;
let httpServer = null;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} received - flushing pending writes`);
  try {
    if (httpServer) httpServer.close();
    await persistence.flush();
    await db.close();
  } catch (error) {
    console.error('[shutdown]', error.message);
  }
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

bootstrap();

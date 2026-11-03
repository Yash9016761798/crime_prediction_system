const http = require('http');

function request(path, method = 'GET', body, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost', port: 5000, path, method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }
    };
    const req = http.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d, headers: res.headers }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  // Health
  const h = await request('/api/health');
  console.log('=== HEALTH ===');
  console.log(h.status, h.body);

  // Login admin
  const lr = await request('/api/auth/login', 'POST', { email: 'admin@police.gov.in', password: 'admin123' });
  console.log('\n=== LOGIN ADMIN ===');
  console.log(lr.status, lr.body.slice(0, 120));
  const t = JSON.parse(lr.body).accessToken;

  // Analytics full
  const an = await request('/api/analytics/full', 'GET', null, t);
  console.log('\n=== ANALYTICS FULL ===');
  console.log(an.status, an.body.slice(0, 400));

  // Heatmap
  const hm = await request('/api/heatmap', 'GET', null, t);
  console.log('\n=== HEATMAP ===');
  console.log(hm.status, hm.headers['content-type'], hm.body.slice(0, 400));

  // Dashboard statistics
  const ds = await request('/api/dashboard/statistics', 'GET', null, t);
  console.log('\n=== DASHBOARD STATS ===');
  console.log(ds.status, ds.body.slice(0, 400));

  // References
  const ref = await request('/api/references/crime-types', 'GET', null, t);
  console.log('\n=== CRIME TYPES ===');
  console.log(ref.status, ref.body.slice(0, 300));

  // States
  const st = await request('/api/references/states', 'GET', null, t);
  console.log('\n=== STATES ===');
  console.log(st.status, st.body.slice(0, 300));
}

main().catch(e => console.log('ERR:', e.message));

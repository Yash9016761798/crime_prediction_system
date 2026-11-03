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
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  // Login admin for auth
  const lr = await request('/api/auth/login', 'POST', { email: 'admin@police.gov.in', password: 'admin123' });
  const t = JSON.parse(lr.body).accessToken;

  const questions = [
    "Hello, what can you do?",
    "Explain the purpose of Crime Intel.",
    "What historical crime data is available?",
    "Which district has the highest recorded crime count?",
    "Give me the latest cybercrime news."
  ];

  for (const q of questions) {
    console.log(`\n=== Q: ${q} ===`);
    const r = await request('/api/ai/chat', 'POST', { message: q }, t);
    console.log('Status:', r.status);
    try {
      const body = JSON.parse(r.body);
      console.log('Answer:', (body.answer || body.error || '').slice(0, 300));
      console.log('Scope:', body.scope, 'Model:', body.model, 'Sources:', body.sources ? body.sources.length : 0);
    } catch {
      console.log('Raw:', r.body.slice(0, 300));
    }
  }
}

main().catch(e => console.log('ERR:', e.message));

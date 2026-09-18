import fs from 'node:fs';

const raw = fs.readFileSync('/var/www/cashledger/apps/api/.env', 'utf8');
const env = {};
for (const rawLine of raw.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const i = line.indexOf('=');
  if (i < 1) continue;
  let value = line.slice(i + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) value = value.slice(1, -1);
  env[line.slice(0, i).trim()] = value;
}

const root = 'https://demo.rithantechnologies.com/cashledger';
const api = root + '/api';

async function checked(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const summary = typeof body === 'string' ? body.slice(0, 160) : JSON.stringify(body);
    throw new Error((options.method || 'GET') + ' ' + url + ' -> ' + res.status + ' ' + summary);
  }
  return { res, body };
}

const page = await checked(root);
console.log('PUBLIC_PAGE', page.res.status, page.res.url);

const health = await checked(api + '/health');
console.log('PUBLIC_HEALTH', health.res.status, health.body?.database || health.body?.success);

const login = await checked(api + '/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: env.OWNER_EMAIL, password: env.OWNER_TEMP_PASSWORD }),
});
const token = login.body?.accessToken;
if (!token) throw new Error('Login returned no access token');
console.log('AUTH_LOGIN', login.res.status, 'token=present');

for (const route of ['/dashboard/summary', '/reports/provider-settlements', '/reports/end-of-day']) {
  const result = await checked(api + route, {
    headers: { authorization: 'Bearer ' + token },
  });
  const shape = Array.isArray(result.body)
    ? 'array:' + result.body.length
    : result.body && typeof result.body === 'object'
      ? 'object:' + Object.keys(result.body).length
      : typeof result.body;
  console.log('AUTH_GET', route, result.res.status, shape);
}

const headerResponse = await fetch(root, { redirect: 'follow' });
for (const name of [
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy',
  'x-robots-tag',
  'cache-control',
]) {
  console.log('HEADER', name, headerResponse.headers.get(name) || 'missing');
}

console.log('PUBLIC HTTPS SMOKE PASS');

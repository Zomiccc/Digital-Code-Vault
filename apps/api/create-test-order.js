const http = require('http');

function post(path, data, token) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const req = http.request({ hostname: 'localhost', port: 3000, path, method: 'POST', headers }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const req = http.request({ hostname: 'localhost', port: 3000, path, method: 'GET', headers }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const login = await post('/api/v1/auth/merchant/login', { email: 'merchant@test.com', password: 'Merchant123!@#' });
  const token = JSON.parse(login.body).access_token;
  console.log('Logged in.');

  const productsRes = await get('/api/v1/products', token);
  const products = JSON.parse(productsRes.body);
  const psn = products.find((p) => p.name === 'PSN');
  console.log('Using product:', psn.id, psn.name);

  const order = await post(
    '/api/v1/merchant/dashboard/fulfillment',
    { product_id: psn.id, amount: 50, reference_id: 'TEST-REVEAL-' + Date.now() },
    token,
  );
  console.log('Order status:', order.status);
  console.log('Order body:', order.body);
})();

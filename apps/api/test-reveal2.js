const http = require('http');

const token = '804ce2afdd84b50e8ff15aef4d47df5e43d983032db12b8f258adc6737fead39';

const req = http.request(
  { hostname: 'localhost', port: 3000, path: `/api/v1/reveal/${token}/reveal`, method: 'POST' },
  (res) => {
    let b = '';
    res.on('data', (c) => (b += c));
    res.on('end', () => {
      console.log('STATUS:', res.statusCode);
      console.log(b.substring(0, 2000));
    });
  },
);
req.on('error', (e) => console.log('REQ ERROR:', e.message));
req.end();

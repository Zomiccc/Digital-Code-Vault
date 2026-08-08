const { execSync } = require('child_process');
try {
  execSync('npx prisma generate', { 
    cwd: __dirname,
    stdio: 'inherit',
    timeout: 120000
  });
  console.log('Prisma client generated');
} catch (e) {
  console.error('Generate failed:', e.message);
}

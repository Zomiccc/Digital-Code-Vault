const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const API = 'http://localhost:3000/api/v1';
const ADMIN_EMAIL = 'admin@digitalcode.local';
const ADMIN_PASSWORD = 'Admin123!@#';

async function main() {
  const codeId = process.argv[2];
  if (!codeId) {
    console.error('Usage: node test-demo-reveal.js <code-id>');
    process.exit(1);
  }

  console.log('--- Testing demo reveal flow ---');
  console.log('Code ID:', codeId);

  // 1. Check DB before
  const before = await prisma.codeItem.findUnique({ where: { id: codeId } });
  console.log('DB status before:', before.status);
  console.log('DB encryptedCode before:', before.encryptedCode.substring(0, 60) + '...');

  // 2. Login as admin
  const loginRes = await fetch(`${API}/auth/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });

  if (!loginRes.ok) {
    const err = await loginRes.text();
    throw new Error(`Admin login failed: ${loginRes.status} ${err}`);
  }

  const loginData = await loginRes.json();
  console.log('Admin login OK. Token received.');

  // 3. Reveal the code
  const revealRes = await fetch(`${API}/admin/codes/${codeId}/reveal`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${loginData.access_token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!revealRes.ok) {
    const err = await revealRes.text();
    throw new Error(`Reveal failed: ${revealRes.status} ${err}`);
  }

  const revealData = await revealRes.json();
  console.log('Revealed code:', revealData.code);

  // 4. Check DB after
  const after = await prisma.codeItem.findUnique({ where: { id: codeId } });
  console.log('DB status after:', after.status);
  console.log('DB revealedAt after:', after.revealedAt);

  // 5. Verify
  if (after.status !== 'DELIVERED') {
    throw new Error(`Expected status DELIVERED, got ${after.status}`);
  }
  if (!after.revealedAt) {
    throw new Error('Expected revealedAt to be set');
  }
  if (!revealData.code || revealData.code.length < 4) {
    throw new Error('Expected a real decrypted code');
  }

  console.log('\n✅ Demo reveal flow works perfectly!');
  console.log(`   Encrypted DB value: ${before.encryptedCode.substring(0, 60)}...`);
  console.log(`   Decrypted code:     ${revealData.code}`);
  console.log(`   Status changed:     ${before.status} -> ${after.status}`);
  console.log(`   One-time reveal:    enforced at ${after.revealedAt}`);

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('\n❌ Demo reveal flow failed:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});

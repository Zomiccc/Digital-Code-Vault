async function main() {
  // Login as merchant
  const loginRes = await fetch('http://localhost:3000/api/v1/auth/merchant/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'merchant@test.com', password: 'Merchant123!@#' }),
  });
  const loginData = await loginRes.json();
  console.log('Login status:', loginRes.status);
  const token = loginData.accessToken || loginData.access_token;
  console.log('Token:', token ? 'YES' : 'NO');

  if (!token) {
    console.log('Login response:', JSON.stringify(loginData));
    return;
  }

  // Get fulfillment
  const fRes = await fetch('http://localhost:3000/api/v1/fulfillment/ffd47b24-f1d5-400f-8dcb-e00cfdeab38d', {
    headers: { 'Authorization': 'Bearer ' + token },
  });
  const fData = await fRes.json();
  console.log('Fulfillment status:', fData.status);
  console.log('Delivery link:', fData.delivery_link);

  if (fData.delivery_link) {
    // Test reveal page
    const revealRes = await fetch(fData.delivery_link);
    const revealHtml = await revealRes.text();
    console.log('Reveal page status:', revealRes.status);
    console.log('Has "Reveal My Code" button:', revealHtml.includes('Reveal My Code'));

    // Reveal the code
    const codeRes = await fetch(fData.delivery_link + '/reveal', { method: 'POST' });
    const codeHtml = await codeRes.text();
    console.log('Code reveal status:', codeRes.status);
    
    const codeMatch = codeHtml.match(/class="code-value"[^>]*>([^<]+)/);
    const denomMatch = codeHtml.match(/class="code-denom"[^>]*>([^<]+)/);
    if (codeMatch) console.log('Revealed code:', codeMatch[1].trim());
    if (denomMatch) console.log('Denomination:', denomMatch[1].trim());
  }
}

main().catch(e => console.error(e.message));

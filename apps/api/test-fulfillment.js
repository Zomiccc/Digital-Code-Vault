async function main() {
  const loginRes = await fetch('http://localhost:3000/api/v1/auth/merchant/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'merchant@test.com', password: 'Merchant123!@#' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.accessToken || loginData.access_token;

  const fRes = await fetch('http://localhost:3000/api/v1/fulfillment/ffd47b24-f1d5-400f-8dcb-e00cfdeab38d', {
    headers: { 'Authorization': 'Bearer ' + token },
  });
  const fText = await fRes.text();
  console.log('Fulfillment status code:', fRes.status);
  console.log('Fulfillment response:', fText);

  // Try delivery link endpoint
  const dRes = await fetch('http://localhost:3000/api/v1/fulfillment/ffd47b24-f1d5-400f-8dcb-e00cfdeab38d/delivery-link', {
    headers: { 'Authorization': 'Bearer ' + token },
  });
  const dText = await dRes.text();
  console.log('Delivery link status code:', dRes.status);
  console.log('Delivery link response:', dText);
}

main().catch(e => console.error(e.message));

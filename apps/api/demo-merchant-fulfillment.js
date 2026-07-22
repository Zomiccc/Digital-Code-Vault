const API = 'http://localhost:3000/api/v1';

async function login(email, password) {
  const res = await fetch(`${API}/merchant/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed: ${await res.text()}`);
  return res.json();
}

async function createFulfillment(token, productId, denominationId, amount) {
  const res = await fetch(`${API}/merchant/fulfillment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ productId, denominationId, amount }),
  });
  if (!res.ok) throw new Error(`Fulfillment failed: ${await res.text()}`);
  return res.json();
}

async function getDelivery(deliveryId) {
  const res = await fetch(`${API}/delivery/${deliveryId}`);
  if (!res.ok) throw new Error(`Delivery fetch failed: ${await res.text()}`);
  return res.json();
}

async function main() {
  try {
    console.log('Logging in as merchant...');
    const { accessToken } = await login('merchant@test.com', 'Merchant123!@#');
    console.log('Login OK. Token:', accessToken.slice(0, 20) + '...');

    console.log('\nCreating fulfillment request...');
    // Use first product/denomination. The API will allocate a code.
    const fulfillment = await createFulfillment(accessToken, '', '', 10);
    console.log('Fulfillment created:', fulfillment);

    if (!fulfillment.deliveryToken) {
      console.log('No deliveryToken in response.');
      return;
    }

    console.log('\nDelivery token:', fulfillment.deliveryToken);
    console.log('Customer portal link:', `http://localhost:5175/delivery/${fulfillment.deliveryToken}`);

    console.log('\nFetching delivery info...');
    const delivery = await getDelivery(fulfillment.deliveryToken);
    console.log('Delivery:', delivery);

  } catch (err) {
    console.error(err.message);
  }
}

main();

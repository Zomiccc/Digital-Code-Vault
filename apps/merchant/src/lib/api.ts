const API_BASE = import.meta.env.DEV ? 'http://localhost:3000/api/v1' : '/api/v1';

function getToken(): string | null {
  return localStorage.getItem('merchant_access_token');
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem('merchant_access_token', access);
  localStorage.setItem('merchant_refresh_token', refresh);
}

export function clearTokens() {
  localStorage.removeItem('merchant_access_token');
  localStorage.removeItem('merchant_refresh_token');
  localStorage.removeItem('merchant_user');
}

async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    const refresh = localStorage.getItem('merchant_refresh_token');
    if (refresh && !path.includes('/auth/')) {
      try {
        const refreshRes = await fetch(`${API_BASE}/auth/merchant/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refresh }),
        });
        if (refreshRes.ok) {
          const tokens = await refreshRes.json();
          setTokens(tokens.access_token, tokens.refresh_token);
          headers['Authorization'] = `Bearer ${tokens.access_token}`;
          const retryRes = await fetch(`${API_BASE}${path}`, { ...options, headers });
          if (!retryRes.ok) throw new Error(`API error: ${retryRes.status}`);
          return retryRes.json();
        }
      } catch { /* fall through */ }
    }
    clearTokens();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
    throw new Error(err.message || `API error: ${res.status}`);
  }

  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    apiFetch('/auth/merchant/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  getWallet: () => apiFetch('/wallet'),
  listOrders: (limit = 50, offset = 0) =>
    apiFetch(`/merchant/orders?limit=${limit}&offset=${offset}`),
  listProducts: () => apiFetch('/products'),
  getDenominations: (productId: string) =>
    apiFetch(`/products/${productId}/denominations`),
  listApiKeys: () => apiFetch('/merchant/api-keys'),
  createApiKey: (scopes?: string[]) =>
    apiFetch('/merchant/api-keys', { method: 'POST', body: JSON.stringify({ scopes }) }),
  revokeApiKey: (id: string) =>
    apiFetch(`/merchant/api-keys/${id}`, { method: 'DELETE' }),

  // Dashboard fulfillment (JWT-guarded, no HMAC needed)
  createDashboardFulfillment: (productId: string, amount: number, referenceId?: string) =>
    apiFetch('/merchant/dashboard/fulfillment', {
      method: 'POST',
      body: JSON.stringify({ product_id: productId, amount, reference_id: referenceId }),
    }),

  // Webhook management
  listWebhooks: () => apiFetch('/merchant/webhooks'),
  createWebhook: (url: string, skipVerification: boolean = false) =>
    apiFetch('/merchant/webhooks', { method: 'POST', body: JSON.stringify({ url, skipVerification }) }),
  deleteWebhook: (id: string) =>
    apiFetch(`/merchant/webhooks/${id}`, { method: 'DELETE' }),
};

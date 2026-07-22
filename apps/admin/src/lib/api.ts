const API_BASE = (import.meta as any).env.DEV ? 'http://localhost:3000/api/v1' : '/api/v1';

function getToken(): string | null {
  return localStorage.getItem('admin_access_token');
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem('admin_access_token', access);
  localStorage.setItem('admin_refresh_token', refresh);
}

export function clearTokens() {
  localStorage.removeItem('admin_access_token');
  localStorage.removeItem('admin_refresh_token');
}

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    const refresh = localStorage.getItem('admin_refresh_token');
    if (refresh && !path.includes('/auth/')) {
      try {
        const refreshRes = await fetch(`${API_BASE}/auth/admin/refresh`, {
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
      } catch {
        // fall through
      }
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
  // Auth
  login: (email: string, password: string) =>
    apiFetch('/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  // Dashboard
  getStats: () => apiFetch('/admin/stats'),
  getInventoryStats: () => apiFetch('/admin/inventory/stats'),

  // Merchants
  listMerchants: () => apiFetch('/admin/merchants'),
  createMerchant: (data: any) =>
    apiFetch('/admin/merchants', { method: 'POST', body: JSON.stringify(data) }),
  updateMerchantStatus: (id: string, status: string) =>
    apiFetch(`/admin/merchants/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  creditWallet: (id: string, amount: number) =>
    apiFetch(`/admin/merchants/${id}/wallet/credit`, { method: 'POST', body: JSON.stringify({ amount }) }),

  // Products
  listProducts: () => apiFetch('/admin/products'),
  createProduct: (data: any) =>
    apiFetch('/admin/products', { method: 'POST', body: JSON.stringify(data) }),
  createDenomination: (productId: string, faceValue: number, currency?: string) =>
    apiFetch(`/admin/products/${productId}/denominations`, {
      method: 'POST',
      body: JSON.stringify({ face_value: faceValue, currency }),
    }),

  // Suppliers
  listSuppliers: () => apiFetch('/admin/suppliers'),
  createSupplier: (data: any) =>
    apiFetch('/admin/suppliers', { method: 'POST', body: JSON.stringify(data) }),

  // Codes
  listCodes: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    return apiFetch(`/admin/codes${qs}`);
  },
  bulkUpload: (denominationId: string, codes: string[], supplierId?: string) =>
    apiFetch('/admin/codes/bulk-upload', {
      method: 'POST',
      body: JSON.stringify({ denomination_id: denominationId, codes, supplier_id: supplierId }),
    }),
  revealCode: (id: string) =>
    apiFetch(`/admin/codes/${id}/reveal`, { method: 'POST' }),
  voidCode: (id: string) =>
    apiFetch(`/admin/codes/${id}/void`, { method: 'POST' }),

  // Fulfillment
  listFulfillment: (limit = 50, offset = 0) =>
    apiFetch(`/admin/fulfillment?limit=${limit}&offset=${offset}`),
  reverseFulfillment: (id: string) =>
    apiFetch(`/admin/fulfillment/${id}/reverse`, { method: 'POST' }),

  // Staff
  listStaff: () => apiFetch('/admin/staff'),
  createStaff: (data: any) =>
    apiFetch('/admin/staff', { method: 'POST', body: JSON.stringify(data) }),

  // Audit
  getAuditLogs: (limit = 50, offset = 0) =>
    apiFetch(`/admin/audit-logs?limit=${limit}&offset=${offset}`),
  getApiLogs: (limit = 50, offset = 0) =>
    apiFetch(`/admin/api-logs?limit=${limit}&offset=${offset}`),
};

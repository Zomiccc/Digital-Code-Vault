const API_BASE = import.meta.env.PROD
  ? 'https://digitalvaul.onrender.com/api/v1'
  : '/api/v1';

function getToken(): string | null {
  return localStorage.getItem('vault_access_token');
}

function getRole(): 'admin' | 'merchant' | 'customer' {
  return (localStorage.getItem('vault_role') as 'admin' | 'merchant' | 'customer') || 'admin';
}

export function setTokens(access: string, refresh: string, role: 'admin' | 'merchant' | 'customer') {
  localStorage.setItem('vault_access_token', access);
  localStorage.setItem('vault_refresh_token', refresh);
  localStorage.setItem('vault_role', role);
}

export function clearTokens() {
  localStorage.removeItem('vault_access_token');
  localStorage.removeItem('vault_refresh_token');
  localStorage.removeItem('vault_role');
  localStorage.removeItem('vault_user');
}

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const role = getRole();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers, signal: controller.signal });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    throw new Error('Unable to connect to the server. Please check your connection and try again.');
  }
  clearTimeout(timeoutId);

  if (res.status === 401) {
    const isAuthEndpoint = path.includes('/auth/');
    const refresh = localStorage.getItem('vault_refresh_token');
    if (refresh && !isAuthEndpoint) {
      try {
        const refreshEndpoint = role === 'admin' ? '/auth/admin/refresh' : role === 'merchant' ? '/auth/merchant/refresh' : '/auth/customer/refresh';
        const refreshRes = await fetch(`${API_BASE}${refreshEndpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refresh }),
        });
        if (refreshRes.ok) {
          const tokens = await refreshRes.json();
          setTokens(tokens.access_token, tokens.refresh_token, role);
          headers['Authorization'] = `Bearer ${tokens.access_token}`;
          const retryRes = await fetch(`${API_BASE}${path}`, { ...options, headers });
          if (!retryRes.ok) throw new Error(`API error: ${retryRes.status}`);
          return retryRes.json();
        }
      } catch {
        // fall through
      }
    }
    if (isAuthEndpoint) {
      const err = await res.json().catch(() => ({ message: 'Invalid credentials' }));
      throw new Error(err.message || 'Invalid credentials');
    }
    clearTokens();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
    const message = err.message || err.error || `API error: ${res.status}`;
    throw new Error(message);
  }

  return res.json();
}

export const api = {
  // Auth
  adminLogin: (email: string, password: string) =>
    apiFetch('/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  merchantLogin: (email: string, password: string) =>
    apiFetch('/auth/merchant/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  merchantRegister: (name: string, email: string, password: string) =>
    apiFetch('/auth/merchant/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),
  customerLogin: (email: string, password: string) =>
    apiFetch('/auth/customer/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  customerRegister: (name: string, email: string, password: string) =>
    apiFetch('/auth/customer/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),

  // Admin endpoints
  getStats: () => apiFetch('/admin/stats'),
  getInventoryStats: () => apiFetch('/admin/inventory/stats'),
  listMerchants: () => apiFetch('/admin/merchants'),
  createMerchant: (data: any) =>
    apiFetch('/admin/merchants', { method: 'POST', body: JSON.stringify(data) }),
  updateMerchantStatus: (id: string, status: string) =>
    apiFetch(`/admin/merchants/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  creditWallet: (id: string, amount: number) =>
    apiFetch(`/admin/merchants/${id}/wallet/credit`, { method: 'POST', body: JSON.stringify({ amount }) }),
  listProducts: () => apiFetch('/admin/products'),
  createProduct: (data: any) =>
    apiFetch('/admin/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProductType: (productId: string, productType: string) =>
    apiFetch(`/admin/products/${productId}/type`, { method: 'PATCH', body: JSON.stringify({ product_type: productType }) }),
  updateProductCategory: (productId: string, categoryId: string | null) =>
    apiFetch(`/admin/products/${productId}/category`, { method: 'PATCH', body: JSON.stringify({ category_id: categoryId }) }),
  createDenomination: (productId: string, faceValue: number, currency?: string) =>
    apiFetch(`/admin/products/${productId}/denominations`, {
      method: 'POST',
      body: JSON.stringify({ face_value: faceValue, currency }),
    }),
  listSuppliers: () => apiFetch('/admin/suppliers'),
  createSupplier: (data: any) =>
    apiFetch('/admin/suppliers', { method: 'POST', body: JSON.stringify(data) }),
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
  listFulfillment: (limit = 50, offset = 0) =>
    apiFetch(`/admin/fulfillment?limit=${limit}&offset=${offset}`),
  reverseFulfillment: (id: string) =>
    apiFetch(`/admin/fulfillment/${id}/reverse`, { method: 'POST' }),
  listStaff: () => apiFetch('/admin/staff'),
  createStaff: (data: any) =>
    apiFetch('/admin/staff', { method: 'POST', body: JSON.stringify(data) }),
  getAuditLogs: (limit = 50, offset = 0) =>
    apiFetch(`/admin/audit-logs?limit=${limit}&offset=${offset}`),
  getApiLogs: (limit = 50, offset = 0) =>
    apiFetch(`/admin/api-logs?limit=${limit}&offset=${offset}`),

  // Admin wallet / finance
  getAdminWallet: () => apiFetch('/admin/wallet'),
  getAdminWalletTransactions: (limit = 50, offset = 0) =>
    apiFetch(`/admin/wallet/transactions?limit=${limit}&offset=${offset}`),
  listFundingRequests: (status?: string) =>
    apiFetch(`/admin/wallet/funding-requests${status ? `?status=${status}` : ''}`),
  approveFundingRequest: (id: string, note?: string) =>
    apiFetch(`/admin/wallet/funding-requests/${id}/approve`, { method: 'POST', body: JSON.stringify({ note }) }),
  rejectFundingRequest: (id: string, note?: string) =>
    apiFetch(`/admin/wallet/funding-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) }),
  getReconciliationReport: (limit = 100, offset = 0) =>
    apiFetch(`/admin/wallet/reconciliation?limit=${limit}&offset=${offset}`),
  getMerchantFinance: (merchantId: string) =>
    apiFetch(`/admin/merchants/${merchantId}/finance`),

  // Merchant endpoints
  getWallet: () => apiFetch('/merchant/dashboard/wallet'),
  listMyFundingRequests: () => apiFetch('/merchant/dashboard/funding-requests'),
  createFundingRequest: (data: { amount: number; note?: string; screenshot: string }) =>
    apiFetch('/merchant/dashboard/funding-requests', { method: 'POST', body: JSON.stringify(data) }),
  getPaymentDetails: () => apiFetch('/merchant/dashboard/payment-details'),
  listOrders: (limit = 50, offset = 0) =>
    apiFetch(`/merchant/dashboard/orders?limit=${limit}&offset=${offset}`),
  listMerchantProducts: () => apiFetch('/products'),
  getDenominations: (productId: string) =>
    apiFetch(`/products/${productId}/denominations`),
  listApiKeys: () => apiFetch('/merchant/dashboard/api-keys'),
  createApiKey: (scopes?: string[]) =>
    apiFetch('/merchant/dashboard/api-keys', { method: 'POST', body: JSON.stringify({ scopes }) }),
  revokeApiKey: (id: string) =>
    apiFetch(`/merchant/dashboard/api-keys/${id}`, { method: 'DELETE' }),
  createDashboardFulfillment: (productId: string, amount: number, referenceId?: string) =>
    apiFetch('/merchant/dashboard/fulfillment', {
      method: 'POST',
      body: JSON.stringify({ product_id: productId, amount, reference_id: referenceId }),
    }),
  listWebhooks: () => apiFetch('/merchant/webhooks'),
  createWebhook: (url: string, skipVerification: boolean = false) =>
    apiFetch('/merchant/webhooks', { method: 'POST', body: JSON.stringify({ url, skipVerification }) }),
  deleteWebhook: (id: string) =>
    apiFetch(`/merchant/webhooks/${id}`, { method: 'DELETE' }),

  // Incoming webhooks
  listIncomingWebhooks: () => apiFetch('/webhooks/incoming'),
  retryIncomingWebhook: (id: string) =>
    apiFetch(`/webhooks/incoming/${id}/retry`, { method: 'POST' }),

  // Connected products
  listConnectedProducts: () => apiFetch('/webhooks/connected-products'),

  // Webhook statistics
  getWebhookStatistics: () => apiFetch('/webhooks/statistics'),

  // Merchant webhook secret (for authenticating incoming webhooks from external platforms)
  getWebhookSecret: () => apiFetch('/merchant/webhook-secret'),
  regenerateWebhookSecret: () =>
    apiFetch('/merchant/webhook-secret/regenerate', { method: 'POST' }),

  // Connected product mapping update
  updateConnectedProduct: (id: string, data: { dcv_product_id?: string; dcv_denomination_id?: string | null; inventory_source?: string }) =>
    apiFetch(`/webhooks/connected-products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Revoke API key
  revokeApiKeyById: (id: string) =>
    apiFetch(`/merchant/dashboard/api-keys/${id}`, { method: 'DELETE' }),

  // Customer endpoints
  customerProducts: () => apiFetch('/customer/products'),
  customerDenominations: (productId: string) =>
    apiFetch(`/products/${productId}/denominations`),
  customerOrders: () => apiFetch('/customer/orders'),
  customerCreateOrder: (productId: string, amount: number, referenceId?: string) =>
    apiFetch('/customer/orders', {
      method: 'POST',
      body: JSON.stringify({ product_id: productId, amount, reference_id: referenceId }),
    }),
  customerProfile: () => apiFetch('/customer/profile'),
  customerBecomeMerchant: (data: { storeName: string; storeEmail: string; currency?: string }) =>
    apiFetch('/customer/become-merchant', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Admin merchant applications
  listMerchantApplications: (status?: string) =>
    apiFetch(`/admin/merchant-applications${status ? `?status=${status}` : ''}`),
  approveMerchantApplication: (id: string) =>
    apiFetch(`/admin/merchant-applications/${id}/approve`, { method: 'POST' }),
  rejectMerchantApplication: (id: string, note?: string) =>
    apiFetch(`/admin/merchant-applications/${id}/reject`, { method: 'POST', body: JSON.stringify({ note }) }),

  // Admin wallet initialization
  initializeAdminWallet: (amount: number, description?: string) =>
    apiFetch('/admin/wallet/initialize', { method: 'POST', body: JSON.stringify({ amount, description }) }),

  // Support chat
  getSupportThread: () =>
    apiFetch('/merchant/support/messages'),
  sendSupportMessage: (data: { body?: string; image?: string; fundingRequestId?: string }) =>
    apiFetch('/merchant/support/messages', { method: 'POST', body: JSON.stringify(data) }),
  listSupportThreads: () =>
    apiFetch('/admin/support/threads'),
  getSupportThreadByMerchant: (merchantId: string) =>
    apiFetch(`/admin/support/threads/${merchantId}`),
  replySupportThread: (merchantId: string, bodyText: string) =>
    apiFetch(`/admin/support/threads/${merchantId}/messages`, { method: 'POST', body: JSON.stringify({ body: bodyText }) }),

  // Catalog endpoints
  listCategories: (activeOnly = false) =>
    apiFetch(`/admin/catalog/categories${activeOnly ? '?active=true' : ''}`),
  createCategory: (data: any) =>
    apiFetch('/admin/catalog/categories', { method: 'POST', body: JSON.stringify(data) }),
  updateCategory: (id: string, data: any) =>
    apiFetch(`/admin/catalog/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCategory: (id: string) =>
    apiFetch(`/admin/catalog/categories/${id}`, { method: 'DELETE' }),

  listRegions: (activeOnly = false) =>
    apiFetch(`/admin/catalog/regions${activeOnly ? '?active=true' : ''}`),
  createRegion: (data: any) =>
    apiFetch('/admin/catalog/regions', { method: 'POST', body: JSON.stringify(data) }),
  updateRegion: (id: string, data: any) =>
    apiFetch(`/admin/catalog/regions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteRegion: (id: string) =>
    apiFetch(`/admin/catalog/regions/${id}`, { method: 'DELETE' }),

  listProductRegions: (productId?: string) =>
    apiFetch(`/admin/catalog/product-regions${productId ? `?productId=${productId}` : ''}`),
  createProductRegion: (data: any) =>
    apiFetch('/admin/catalog/product-regions', { method: 'POST', body: JSON.stringify(data) }),
  deleteProductRegion: (id: string) =>
    apiFetch(`/admin/catalog/product-regions/${id}`, { method: 'DELETE' }),

  getCatalogHierarchy: () => apiFetch('/admin/catalog/hierarchy'),
  getCatalogStats: () => apiFetch('/admin/catalog/stats'),

  // Variants & fulfillment combinations (presets)
  listVariantsByProduct: (productId: string) =>
    apiFetch(`/admin/catalog/products/${productId}/variants`),
  createVariantForProduct: (productId: string, data: { name: string; customerPrice: number; currency?: string; description?: string }) =>
    apiFetch(`/admin/catalog/products/${productId}/variants`, { method: 'POST', body: JSON.stringify(data) }),
  updateVariant: (id: string, data: any) =>
    apiFetch(`/admin/catalog/variants/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteVariant: (id: string) =>
    apiFetch(`/admin/catalog/variants/${id}`, { method: 'DELETE' }),
  listCombinations: (variantId?: string) =>
    apiFetch(`/admin/catalog/combinations${variantId ? `?variantId=${variantId}` : ''}`),
  createCombination: (data: { variantId: string; name: string; priority?: number; active?: boolean; items: { denominationId: string; quantity: number }[] }) =>
    apiFetch('/admin/catalog/combinations', { method: 'POST', body: JSON.stringify(data) }),
  updateCombination: (id: string, data: any) =>
    apiFetch(`/admin/catalog/combinations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCombination: (id: string) =>
    apiFetch(`/admin/catalog/combinations/${id}`, { method: 'DELETE' }),
  getCombinationAvailability: (id: string) =>
    apiFetch(`/admin/catalog/combinations/${id}/availability`),

  // Essentials delivery config — reusable denomination + quantity rules
  getEssentialsDeliveryConfig: (productId: string) =>
    apiFetch(`/admin/products/${productId}/essentials/delivery-config`),
  saveEssentialsDeliveryConfig: (productId: string, items: { denominationId: string; quantity: number }[]) =>
    apiFetch(`/admin/products/${productId}/essentials/delivery-config`, {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),
  getEssentialsAvailability: (productId: string) =>
    apiFetch(`/admin/products/${productId}/essentials/availability`),
};

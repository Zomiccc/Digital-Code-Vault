import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { Layout } from '@/components/Layout';

// Keep lazy components at module scope so navigation reuses loaded modules.
const LoginPage = lazy(() => import('@/pages/LoginPage').then(module => ({ default: module.LoginPage })));
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then(module => ({ default: module.DashboardPage })));
const MerchantsPage = lazy(() => import('@/pages/MerchantsPage').then(module => ({ default: module.MerchantsPage })));
const ProductsPage = lazy(() => import('@/pages/ProductsPage').then(module => ({ default: module.ProductsPage })));
const InventoryPage = lazy(() => import('@/pages/InventoryPage').then(module => ({ default: module.InventoryPage })));
const BulkUploadPage = lazy(() => import('@/pages/BulkUploadPage').then(module => ({ default: module.BulkUploadPage })));
const FulfillmentPage = lazy(() => import('@/pages/FulfillmentPage').then(module => ({ default: module.FulfillmentPage })));
const CatalogPage = lazy(() => import('@/pages/CatalogPage').then(module => ({ default: module.CatalogPage })));
const FulfillmentPresetsPage = lazy(() => import('@/pages/FulfillmentPresetsPage').then(module => ({ default: module.FulfillmentPresetsPage })));
const SkuMappingPage = lazy(() => import('@/pages/SkuMappingPage').then(module => ({ default: module.SkuMappingPage })));
const SupportInboxPage = lazy(() => import('@/pages/SupportInboxPage').then(module => ({ default: module.SupportInboxPage })));
const FinancePage = lazy(() => import('@/pages/FinancePage').then(module => ({ default: module.FinancePage })));
const MerchantWalletPage = lazy(() => import('@/pages/MerchantWalletPage').then(module => ({ default: module.MerchantWalletPage })));
const AuditLogsPage = lazy(() => import('@/pages/AuditLogsPage').then(module => ({ default: module.AuditLogsPage })));
const EmailLogsPage = lazy(() => import('@/pages/EmailLogsPage').then(module => ({ default: module.EmailLogsPage })));
const CurrencyPage = lazy(() => import('@/pages/CurrencyPage').then(module => ({ default: module.CurrencyPage })));
const EmergencyPage = lazy(() => import('@/pages/EmergencyPage').then(module => ({ default: module.EmergencyPage })));
const StaffPage = lazy(() => import('@/pages/StaffPage').then(module => ({ default: module.StaffPage })));
const MerchantApplicationsPage = lazy(() => import('@/pages/MerchantApplicationsPage').then(module => ({ default: module.MerchantApplicationsPage })));
// Pages exported from the same file share an on-demand chunk.
const MerchantDashboardPage = lazy(() => import('@/pages/MerchantPages').then(module => ({ default: module.MerchantDashboardPage })));
const MerchantOrdersPage = lazy(() => import('@/pages/MerchantPages').then(module => ({ default: module.MerchantOrdersPage })));
const MerchantProductsPage = lazy(() => import('@/pages/MerchantPages').then(module => ({ default: module.MerchantProductsPage })));
const MerchantCreateOrderPage = lazy(() => import('@/pages/MerchantPages').then(module => ({ default: module.MerchantCreateOrderPage })));
const MerchantApiKeysPage = lazy(() => import('@/pages/MerchantPages').then(module => ({ default: module.MerchantApiKeysPage })));
const MerchantWebhooksPage = lazy(() => import('@/pages/MerchantPages').then(module => ({ default: module.MerchantWebhooksPage })));
const IncomingWebhooksPage = lazy(() => import('@/pages/MerchantPages').then(module => ({ default: module.IncomingWebhooksPage })));
const ConnectedProductsPage = lazy(() => import('@/pages/MerchantPages').then(module => ({ default: module.ConnectedProductsPage })));
const MerchantIntegrationsPage = lazy(() => import('@/pages/MerchantIntegrationsPage').then(module => ({ default: module.MerchantIntegrationsPage })));
const CustomerDashboardPage = lazy(() => import('@/pages/CustomerPages').then(module => ({ default: module.CustomerDashboardPage })));
const CustomerProductsPage = lazy(() => import('@/pages/CustomerPages').then(module => ({ default: module.CustomerProductsPage })));
const CustomerCreateOrderPage = lazy(() => import('@/pages/CustomerPages').then(module => ({ default: module.CustomerCreateOrderPage })));
const CustomerOrdersPage = lazy(() => import('@/pages/CustomerPages').then(module => ({ default: module.CustomerOrdersPage })));
const CustomerBecomeMerchantPage = lazy(() => import('@/pages/CustomerPages').then(module => ({ default: module.CustomerBecomeMerchantPage })));

function RouteLoading() {
  return (
    <div role="status" className="flex min-h-48 items-center justify-center text-muted-foreground">
      Loading...
    </div>
  );
}

function ProtectedRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Layout>
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          {user.role === 'admin' ? (
            <>
              <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="/admin/dashboard" element={<DashboardPage />} />
              <Route path="/admin/merchants" element={<MerchantsPage />} />
              <Route path="/admin/products" element={<ProductsPage />} />
              <Route path="/admin/catalog" element={<CatalogPage />} />
              <Route path="/admin/presets" element={<FulfillmentPresetsPage />} />
              <Route path="/admin/sku-mapping" element={<SkuMappingPage />} />
              <Route path="/admin/support" element={<SupportInboxPage />} />
              <Route path="/admin/inventory" element={<InventoryPage />} />
              <Route path="/admin/upload" element={<BulkUploadPage />} />
              <Route path="/admin/fulfillment" element={<FulfillmentPage />} />
              <Route path="/admin/finance" element={<FinancePage />} />
              <Route path="/admin/applications" element={<MerchantApplicationsPage />} />
              <Route path="/admin/audit" element={<AuditLogsPage />} />
              <Route path="/admin/email-logs" element={<EmailLogsPage />} />
              <Route path="/admin/staff" element={<StaffPage />} />
              <Route path="/admin/currency" element={<CurrencyPage />} />
              <Route path="/admin/emergency" element={<EmergencyPage />} />
              <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
            </>
          ) : user.role === 'merchant' ? (
            <>
              <Route path="/merchant" element={<Navigate to="/merchant/dashboard" replace />} />
              <Route path="/merchant/dashboard" element={<MerchantDashboardPage />} />
              <Route path="/merchant/wallet" element={<MerchantWalletPage />} />
              <Route path="/merchant/orders" element={<MerchantOrdersPage />} />
              <Route path="/merchant/products" element={<MerchantProductsPage />} />
              <Route path="/merchant/create-order" element={<MerchantCreateOrderPage />} />
              <Route path="/merchant/api-keys" element={<MerchantApiKeysPage />} />
              <Route path="/merchant/webhooks" element={<MerchantWebhooksPage />} />
              <Route path="/merchant/incoming-webhooks" element={<IncomingWebhooksPage />} />
              <Route path="/merchant/connected-products" element={<ConnectedProductsPage />} />
              <Route path="/merchant/integrations" element={<MerchantIntegrationsPage />} />
              <Route path="/" element={<Navigate to="/merchant/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/merchant/dashboard" replace />} />
            </>
          ) : (
            <>
              <Route path="/customer" element={<Navigate to="/customer/dashboard" replace />} />
              <Route path="/customer/dashboard" element={<CustomerDashboardPage />} />
              <Route path="/customer/browse" element={<CustomerProductsPage />} />
              <Route path="/customer/order" element={<CustomerCreateOrderPage />} />
              <Route path="/customer/my-orders" element={<CustomerOrdersPage />} />
              <Route path="/customer/become-merchant" element={<CustomerBecomeMerchantPage />} />
              <Route path="/" element={<Navigate to="/customer/dashboard" replace />} />
            </>
          )}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<LoginPage />} />
          <Route path="/merchant/login" element={<Navigate to="/login" replace />} />
          <Route path="/*" element={<ProtectedRoutes />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}

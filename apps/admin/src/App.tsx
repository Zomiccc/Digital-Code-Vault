import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { LoginPage } from '@/pages/LoginPage';
import { Layout } from '@/components/Layout';
import { DashboardPage } from '@/pages/DashboardPage';
import { MerchantsPage } from '@/pages/MerchantsPage';
import { ProductsPage } from '@/pages/ProductsPage';
import { InventoryPage } from '@/pages/InventoryPage';
import { BulkUploadPage } from '@/pages/BulkUploadPage';
import { FulfillmentPage } from '@/pages/FulfillmentPage';
import { CatalogPage } from '@/pages/CatalogPage';
import { FulfillmentPresetsPage } from '@/pages/FulfillmentPresetsPage';
import { SkuMappingPage } from '@/pages/SkuMappingPage';
import { SupportInboxPage } from '@/pages/SupportInboxPage';
import { MerchantChatWidget } from '@/components/MerchantChatWidget';
import { FinancePage } from '@/pages/FinancePage';
import { MerchantWalletPage } from '@/pages/MerchantWalletPage';
import { AuditLogsPage } from '@/pages/AuditLogsPage';
import { StaffPage } from '@/pages/StaffPage';
import { MerchantApplicationsPage } from '@/pages/MerchantApplicationsPage';
import {
  MerchantDashboardPage,
  MerchantOrdersPage,
  MerchantProductsPage,
  MerchantCreateOrderPage,
  MerchantApiKeysPage,
  MerchantWebhooksPage,
  IncomingWebhooksPage,
  ConnectedProductsPage,
} from '@/pages/MerchantPages';
import { MerchantIntegrationsPage } from '@/pages/MerchantIntegrationsPage';
import {
  CustomerDashboardPage,
  CustomerProductsPage,
  CustomerCreateOrderPage,
  CustomerOrdersPage,
  CustomerBecomeMerchantPage,
} from '@/pages/CustomerPages';

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
            <Route path="/admin/staff" element={<StaffPage />} />
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
            <Route path="*" element={<><MerchantChatWidget /><Navigate to="/merchant/dashboard" replace /></>} />
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
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<LoginPage />} />
        <Route path="/*" element={<ProtectedRoutes />} />
      </Routes>
    </AuthProvider>
  );
}

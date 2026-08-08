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
import { AuditLogsPage } from '@/pages/AuditLogsPage';
import { StaffPage } from '@/pages/StaffPage';
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
            <Route path="/" element={<DashboardPage />} />
            <Route path="/merchants" element={<MerchantsPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/upload" element={<BulkUploadPage />} />
            <Route path="/fulfillment" element={<FulfillmentPage />} />
            <Route path="/audit" element={<AuditLogsPage />} />
            <Route path="/staff" element={<StaffPage />} />
          </>
        ) : user.role === 'merchant' ? (
          <>
            <Route path="/" element={<MerchantDashboardPage />} />
            <Route path="/orders" element={<MerchantOrdersPage />} />
            <Route path="/products" element={<MerchantProductsPage />} />
            <Route path="/create-order" element={<MerchantCreateOrderPage />} />
            <Route path="/api-keys" element={<MerchantApiKeysPage />} />
            <Route path="/webhooks" element={<MerchantWebhooksPage />} />
            <Route path="/incoming-webhooks" element={<IncomingWebhooksPage />} />
            <Route path="/connected-products" element={<ConnectedProductsPage />} />
          </>
        ) : (
          <>
            <Route path="/" element={<CustomerDashboardPage />} />
            <Route path="/browse" element={<CustomerProductsPage />} />
            <Route path="/order" element={<CustomerCreateOrderPage />} />
            <Route path="/my-orders" element={<CustomerOrdersPage />} />
            <Route path="/become-merchant" element={<CustomerBecomeMerchantPage />} />
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
        <Route path="/*" element={<ProtectedRoutes />} />
      </Routes>
    </AuthProvider>
  );
}

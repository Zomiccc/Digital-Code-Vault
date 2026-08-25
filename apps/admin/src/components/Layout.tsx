import { ReactNode, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Package, Database, Upload, FileText,
  ScrollText, UserCog, LogOut, Menu, X, Shield, ChevronRight,
  Wallet, Key, ShoppingCart, Webhook, Store, Gift, Plug, Layers, FolderTree,
  MessagesSquare, Tags,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

const adminNav = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/merchants', label: 'Merchants', icon: Users },
  { to: '/admin/applications', label: 'Applications', icon: Store },
  { to: '/admin/products', label: 'Products', icon: Package },
  { to: '/admin/catalog', label: 'Catalog', icon: FolderTree },
  { to: '/admin/presets', label: 'Fulfillment Presets', icon: Layers },
  { to: '/admin/sku-mapping', label: 'SKU Mapping', icon: Tags },
  { to: '/admin/inventory', label: 'Inventory', icon: Database },
  { to: '/admin/upload', label: 'Bulk Upload', icon: Upload },
  { to: '/admin/fulfillment', label: 'Fulfillment', icon: FileText },
  { to: '/admin/finance', label: 'Finance', icon: Wallet },
  { to: '/admin/support', label: 'Support Inbox', icon: MessagesSquare },
  { to: '/admin/audit', label: 'Audit Logs', icon: ScrollText },
  { to: '/admin/staff', label: 'Staff', icon: UserCog },
];

const merchantNav = [
  { to: '/merchant/dashboard', label: 'Dashboard', icon: Wallet },
  { to: '/merchant/wallet', label: 'Wallet & Funding', icon: Wallet },
  { to: '/merchant/orders', label: 'Orders', icon: FileText },
  { to: '/merchant/products', label: 'Products', icon: Package },
  { to: '/merchant/create-order', label: 'Create Order', icon: ShoppingCart },
  { to: '/merchant/integrations', label: 'Integrations', icon: Plug },
  { to: '/merchant/api-keys', label: 'API Keys', icon: Key },
  { to: '/merchant/webhooks', label: 'Webhooks', icon: Webhook },
  { to: '/merchant/incoming-webhooks', label: 'Incoming Webhooks', icon: ScrollText },
  { to: '/merchant/connected-products', label: 'Connected Products', icon: Package },
];

const customerNav = [
  { to: '/customer/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/customer/browse', label: 'Browse Products', icon: Package },
  { to: '/customer/order', label: 'Place Order', icon: ShoppingCart },
  { to: '/customer/my-orders', label: 'My Orders', icon: FileText },
  { to: '/customer/become-merchant', label: 'Become Merchant', icon: Store },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = user?.role === 'merchant' ? merchantNav : user?.role === 'customer' ? customerNav : adminNav;
  const roleLabel = user?.role === 'merchant' ? 'Merchant Portal' : user?.role === 'customer' ? 'Customer Portal' : 'Admin Console';
  const RoleIcon = user?.role === 'merchant' ? Store : user?.role === 'customer' ? Gift : Shield;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const activeLabel = navItems.find((item) =>
    location.pathname === item.to || location.pathname.startsWith(item.to + '/') || location.pathname === item.to,
  )?.label || 'Dashboard';

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 transform border-r border-border bg-card/50 backdrop-blur-xl transition-transform duration-300 lg:relative lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b border-border px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg shadow-primary/20">
            <RoleIcon className="h-4 w-4" />
          </div>
          <div>
            <span className="text-lg font-semibold tracking-tight">Code Vault</span>
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{roleLabel}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to.endsWith('/dashboard')}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'group flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-primary/10 text-primary shadow-[inset_2px_0_0_0_hsl(var(--primary))]'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )
              }
            >
              <div className="flex items-center gap-3">
                <item.icon className="h-4.5 w-4.5" />
                {item.label}
              </div>
              <ChevronRight className="h-4 w-4 opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border p-4">
          <div className="mb-3 rounded-lg bg-muted/50 px-3 py-2">
            <p className="text-sm font-medium">{user?.name}</p>
            <p className="text-xs text-muted-foreground">{user?.role === 'merchant' ? user?.merchantName : user?.role === 'customer' ? user?.email : user?.role}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center gap-4 border-b border-border bg-card/30 px-4 backdrop-blur-sm lg:px-8">
          <button
            className="lg:hidden rounded-lg p-2 hover:bg-muted"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="hidden text-muted-foreground/60 sm:inline">{roleLabel}</span>
            <span className="hidden text-muted-foreground/40 sm:inline">/</span>
            <span className="font-medium text-foreground">{activeLabel}</span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <div className="hidden h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] sm:block" />
            <span className="hidden text-xs text-muted-foreground sm:block">System Operational</span>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-8 animate-fade-in">{children}</main>
      </div>
    </div>
  );
}

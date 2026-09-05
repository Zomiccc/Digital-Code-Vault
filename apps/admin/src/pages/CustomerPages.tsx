import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatPrice } from '@/lib/utils';
import { Card, Button, Input, Badge, AddressWithMapsLink } from '@/components/ui';
import { Gift, ShoppingBag, Copy, Check, Store, ArrowRight, Package, Loader2, Clock, ImageIcon } from 'lucide-react';

export function CustomerDashboardPage() {
  const { data: profile } = useQuery({ queryKey: ['customer-profile'], queryFn: api.customerProfile });
  const { data: orders } = useQuery({ queryKey: ['customer-orders'], queryFn: api.customerOrders });

  const activeOrders = orders?.filter((o: any) => o.status === 'ALLOCATED' || o.status === 'PENDING') || [];
  const pastOrders = orders?.filter((o: any) => o.status !== 'ALLOCATED' && o.status !== 'PENDING') || [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">My Dashboard</h1>
        <p className="text-sm text-muted-foreground">Welcome back, {profile?.name || 'Customer'}</p>
      </div>

      {!profile?.isMerchant && profile?.merchantAppStatus !== 'PENDING' && (
        <Card className="border-primary/30 bg-primary/5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">Want to sell digital codes?</p>
              <p className="text-sm text-muted-foreground">Register as a merchant — submit your details and start selling after approval.</p>
            </div>
            <a href="/customer/become-merchant">
              <Button>
                <Store className="mr-2 h-4 w-4" /> Register as Merchant
              </Button>
            </a>
          </div>
        </Card>
      )}
      {profile?.isMerchant && (
        <Card className="border-primary/30 bg-primary/5">
          <div className="flex items-center gap-3">
            <Store className="h-5 w-5 text-primary" />
            <div>
              <p className="font-semibold">You have a merchant account</p>
              <p className="text-sm text-muted-foreground">Switch to merchant view from the sidebar to manage your store</p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2.5">
              <ShoppingBag className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{orders?.length || 0}</p>
              <p className="text-xs text-muted-foreground">Total Orders</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-500/10 p-2.5">
              <Gift className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeOrders.length}</p>
              <p className="text-xs text-muted-foreground">Active Deliveries</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-500/10 p-2.5">
              <Package className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{pastOrders.length}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
          </div>
        </Card>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Recent Orders</h2>
        {orders && orders.length > 0 ? (
          <div className="space-y-3">
            {orders.slice(0, 10).map((order: any) => (
              <Card key={order.id}>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="font-semibold">{order.product_name}</p>
                    <p className="text-sm text-muted-foreground">
                      ${order.amount} • {new Date(order.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={
                      order.status === 'ALLOCATED' ? 'bg-emerald-500/10 text-emerald-500' :
                      order.status === 'FAILED' ? 'bg-destructive/10 text-destructive' :
                      'bg-amber-500/10 text-amber-500'
                    }>
                      {order.status}
                    </Badge>
                    {order.delivery_link && (
                      <a href={order.delivery_link} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm">
                          <Gift className="mr-1.5 h-3.5 w-3.5" /> View Codes
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <p className="text-center text-muted-foreground py-8">No orders yet. Browse products to get started!</p>
          </Card>
        )}
      </div>
    </div>
  );
}

export function CustomerProductsPage() {
  const { data: products, isLoading } = useQuery({ queryKey: ['customer-products'], queryFn: api.customerProducts });

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Browse Products</h1>
        <p className="text-sm text-muted-foreground">Digital codes available for purchase</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {products?.map((p: any) => (
          <Card key={p.id}>
            <h3 className="font-semibold">{p.name}</h3>
            <p className="text-sm text-muted-foreground">{p.region}</p>
            {p.denominations?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {p.denominations.map((d: any) => (
                  <Badge key={d.id} className="bg-secondary text-secondary-foreground">
                    {formatPrice(d.faceValue, d.currency)}
                    {d.local_currency && d.local_currency !== 'USD' && (
                      <span className="ml-1.5 opacity-70">{d.local_formatted}</span>
                    )}
                  </Badge>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

export function CustomerCreateOrderPage() {
  return (
    <div className="space-y-8 animate-slide-up">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Order Digital Codes</h1>
        <p className="text-sm text-muted-foreground">Direct online checkout has been removed.</p>
      </div>
      <Card>
        <div className="space-y-3 py-6 text-center">
          <Store className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="font-medium">Codes are purchased directly from your connected merchant's site.</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Browse the catalog to see available products and denominations, then order on the merchant
            storefront. Your codes appear here under "My Orders" once fulfilled.
          </p>
          <a href="/customer/browse"><Button>Browse Products</Button></a>
        </div>
      </Card>
    </div>
  );
}


export function CustomerOrdersPage() {
  const { data: orders, isLoading } = useQuery({ queryKey: ['customer-orders'], queryFn: api.customerOrders });

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">My Orders</h1>
        <p className="text-sm text-muted-foreground">View your order history and delivery links</p>
      </div>

      {orders && orders.length > 0 ? (
        <div className="space-y-3">
          {orders.map((order: any) => (
            <Card key={order.id}>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="font-semibold">{order.product_name}</p>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>${order.amount}</span>
                    <span>•</span>
                    <span>{new Date(order.createdAt).toLocaleString()}</span>
                    {order.reference_id && (
                      <>
                        <span>•</span>
                        <span className="font-mono text-xs">{order.reference_id}</span>
                      </>
                    )}
                  </div>
                  {order.failureReason && (
                    <p className="text-xs text-destructive">{order.failureReason}</p>
                  )}
                  {order.customer_address && (
                    <div className="mt-1">
                      <AddressWithMapsLink address={order.customer_address} label="Customer Address" />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Badge className={
                    order.status === 'ALLOCATED' ? 'bg-emerald-500/10 text-emerald-500' :
                    order.status === 'FAILED' ? 'bg-destructive/10 text-destructive' :
                    'bg-amber-500/10 text-amber-500'
                  }>
                    {order.status}
                  </Badge>
                  {order.delivery_link && (
                    <a href={order.delivery_link} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm">
                        <Gift className="mr-1.5 h-3.5 w-3.5" /> View Codes
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <p className="text-center text-muted-foreground py-8">No orders yet</p>
        </Card>
      )}
    </div>
  );
}

export function CustomerBecomeMerchantPage() {
  const { data: profile } = useQuery({ queryKey: ['customer-profile'], queryFn: api.customerProfile });
  const [storeName, setStoreName] = useState('');
  const [storeEmail, setStoreEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [idDocType, setIdDocType] = useState('CNIC');
  const [businessNtn, setBusinessNtn] = useState('');
  const [idFrontImage, setIdFrontImage] = useState<string | null>(null);
  const [idBackImage, setIdBackImage] = useState<string | null>(null);
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const pickImage = (file: File | undefined, setter: (v: string) => void) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('ID image too large — please upload under 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setter(reader.result as string);
    reader.readAsDataURL(file);
  };

  const mutation = useMutation({
    mutationFn: () => api.customerBecomeMerchant({
      storeName,
      storeEmail,
      firstName,
      lastName,
      phone,
      idDocType,
      idFrontImage: idFrontImage!,
      idBackImage: idBackImage!,
      businessNtn,
    }),
    onSuccess: () => {
      setSuccess(true);
      setError('');
    },
    onError: (err: any) => setError(err.message || 'Failed to submit application'),
  });

  if ((success || profile?.merchantAppStatus === 'PENDING') && !profile?.isMerchant) {
    return (
      <div className="space-y-8 animate-slide-up">
        <Card className="border-amber-500/30 bg-amber-500/5">
          <div className="text-center py-10 space-y-3">
            <Clock className="h-12 w-12 text-amber-500 mx-auto" />
            <h2 className="text-xl font-bold text-amber-500">Waiting for Admin Approval</h2>
            <p className="max-w-md mx-auto text-sm text-muted-foreground">
              Your merchant application and KYC documents have been submitted.
              An admin will verify your details — you'll be able to access the merchant dashboard once approved.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  if (profile?.isMerchant) {
    return (
      <div className="space-y-8">
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <div className="text-center py-8 space-y-3">
            <Store className="h-12 w-12 text-emerald-500 mx-auto" />
            <h2 className="text-xl font-bold text-emerald-400">You are a Merchant!</h2>
            <p className="text-muted-foreground">Switch to merchant view from the sidebar to manage your store.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-slide-up">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Register as Merchant</h1>
        <p className="text-sm text-muted-foreground">Submit your details and documents — an admin will review and approve your store</p>
      </div>

      <Card className="space-y-5">
        <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3 text-sm">
          <p className="font-semibold text-primary mb-1">Merchant benefits:</p>
          <p className="text-muted-foreground">Prepaid wallet · API keys · Webhook notifications · Order dashboard · Full catalog access</p>
        </div>

        {/* Business details */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Business details</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Store Name *" value={storeName} onChange={(e: any) => setStoreName(e.target.value)} placeholder="My Digital Store" required />
            <Input label="Store Email *" type="email" value={storeEmail} onChange={(e: any) => setStoreEmail(e.target.value)} placeholder="store@example.com" required />
          </div>
        </div>

        {/* Personal details */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Personal details</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="First Name *" value={firstName} onChange={(e: any) => setFirstName(e.target.value)} placeholder="John" required />
            <Input label="Last Name *" value={lastName} onChange={(e: any) => setLastName(e.target.value)} placeholder="Doe" required />
          </div>
          <div className="mt-4">
            <Input label="Phone Number *" type="tel" value={phone} onChange={(e: any) => setPhone(e.target.value)} placeholder="+92 3XX XXXXXXX" required />
          </div>
        </div>

        {/* ID document */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Identity document</p>
          <div className="mb-4 flex gap-2">
            {['CNIC', 'Passport', 'License'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setIdDocType(t.toUpperCase())}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  idDocType === t.toUpperCase() ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border hover:border-primary/40'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <input ref={frontRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0], setIdFrontImage)} />
          <input ref={backRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0], setIdBackImage)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <button type="button" onClick={() => frontRef.current?.click()} className={`flex flex-col items-center gap-2 rounded-xl border border-dashed p-5 text-center text-xs transition-colors ${idFrontImage ? 'border-emerald-500/60 text-emerald-500' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
              {idFrontImage ? (
                <>
                  <img src={idFrontImage} alt="front" className="h-24 w-full rounded-lg object-cover" />
                  <span>Front picture ✓ (tap to change)</span>
                </>
              ) : (
                <><ImageIcon className="h-5 w-5" /> Front Picture *</>
              )}
            </button>
            <button type="button" onClick={() => backRef.current?.click()} className={`flex flex-col items-center gap-2 rounded-xl border border-dashed p-5 text-center text-xs transition-colors ${idBackImage ? 'border-emerald-500/60 text-emerald-500' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
              {idBackImage ? (
                <>
                  <img src={idBackImage} alt="back" className="h-24 w-full rounded-lg object-cover" />
                  <span>Back picture ✓ (tap to change)</span>
                </>
              ) : (
                <><ImageIcon className="h-5 w-5" /> Back Picture *</>
              )}
            </button>
          </div>
        </div>

        {/* NTN */}
        <Input label="Business NTN Number *" value={businessNtn} onChange={(e: any) => setBusinessNtn(e.target.value)} placeholder="e.g. 1234567-8" required />

        {error && <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !storeName || !storeEmail || !firstName || !lastName || !phone || !businessNtn || !idFrontImage || !idBackImage}
          size="lg"
          className="w-full"
        >
          {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Store className="mr-2 h-4 w-4" />}
          {mutation.isPending ? 'Submitting...' : 'Submit for Admin Approval'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Your documents are stored encrypted. Once approved, you'll sign in with the same credentials and get the merchant dashboard.
        </p>
      </Card>
    </div>
  );
}

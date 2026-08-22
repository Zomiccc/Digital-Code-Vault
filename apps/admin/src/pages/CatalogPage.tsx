import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Plus, Trash2, Globe, FolderTree, Tags } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Input, Select, Modal, Badge } from '@/components/ui';

type Tab = 'categories' | 'regions' | 'productRegions';

export function CatalogPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('categories');

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Catalog Management</h1>
        <p className="text-sm text-muted-foreground">Manage categories, regions, product-region mappings, and variants</p>
      </div>

      <div className="flex gap-2 border-b border-border">
        <TabButton active={tab === 'categories'} onClick={() => setTab('categories')} icon={FolderTree} label="Categories" />
        <TabButton active={tab === 'regions'} onClick={() => setTab('regions')} icon={Globe} label="Regions" />
        <TabButton active={tab === 'productRegions'} onClick={() => setTab('productRegions')} icon={Tags} label="Product-Regions" />
      </div>

      {tab === 'categories' && <CategoriesTab />}
      {tab === 'regions' && <RegionsTab />}
      {tab === 'productRegions' && <ProductRegionsTab />}
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
        active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function CategoriesTab() {
  const queryClient = useQueryClient();
  const { data: categories, isLoading } = useQuery({ queryKey: ['categories'], queryFn: () => api.listCategories() });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', sortOrder: 0 });

  const createMutation = useMutation({
    mutationFn: () => api.createCategory(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setShowCreate(false);
      setForm({ name: '', description: '', sortOrder: 0 });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteCategory(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)}><Plus className="mr-2 h-4 w-4" /> Add Category</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {categories?.map((cat: any) => (
          <Card key={cat.id} hover>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">{cat.name}</h3>
                <p className="text-xs text-muted-foreground">/{cat.slug}</p>
                {cat.description && <p className="mt-2 text-sm text-muted-foreground">{cat.description}</p>}
                <div className="mt-3 flex items-center gap-2">
                  <Badge className={cat.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                    {cat.active ? 'ACTIVE' : 'INACTIVE'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{cat._count?.products || 0} products</span>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => deleteMutation.mutate(cat.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Category">
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. PlayStation" />
          <Input label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional" />
          <Input label="Sort Order" type="number" value={String(form.sortOrder)} onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })} />
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.name} className="w-full">
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function RegionsTab() {
  const queryClient = useQueryClient();
  const { data: regions, isLoading } = useQuery({ queryKey: ['regions'], queryFn: () => api.listRegions() });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', currency: 'USD', symbol: '$' });

  const createMutation = useMutation({
    mutationFn: () => api.createRegion(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['regions'] });
      setShowCreate(false);
      setForm({ name: '', code: '', currency: 'USD', symbol: '$' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteRegion(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['regions'] }),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)}><Plus className="mr-2 h-4 w-4" /> Add Region</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {regions?.map((region: any) => (
          <Card key={region.id} hover>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">{region.name}</h3>
                <p className="text-xs text-muted-foreground">{region.code} · {region.currency} {region.symbol}</p>
                <Badge className={`mt-3 ${region.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {region.active ? 'ACTIVE' : 'INACTIVE'}
                </Badge>
              </div>
              <Button variant="outline" size="sm" onClick={() => deleteMutation.mutate(region.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Region">
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. United States" />
          <Input label="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. USA" />
          <Input label="Currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} placeholder="USD" />
          <Input label="Symbol" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} placeholder="$" />
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.name || !form.code} className="w-full">
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function ProductRegionsTab() {
  const queryClient = useQueryClient();
  const { data: products } = useQuery({ queryKey: ['admin-products'], queryFn: api.listProducts });
  const { data: regions } = useQuery({ queryKey: ['regions'], queryFn: () => api.listRegions() });
  const { data: productRegions, isLoading } = useQuery({ queryKey: ['product-regions-all'], queryFn: () => api.listProductRegions() });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ productId: '', regionId: '' });

  const createMutation = useMutation({
    mutationFn: () => api.createProductRegion(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-regions-all'] });
      setShowCreate(false);
      setForm({ productId: '', regionId: '' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteProductRegion(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['product-regions-all'] }),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)}><Plus className="mr-2 h-4 w-4" /> Map Product to Region</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {productRegions?.map((pr: any) => (
          <Card key={pr.id} hover>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">{pr.product?.name}</h3>
                <p className="text-sm text-muted-foreground">{pr.region?.name} ({pr.region?.code})</p>
                <Badge className={`mt-3 ${pr.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {pr.active ? 'ACTIVE' : 'INACTIVE'}
                </Badge>
              </div>
              <Button variant="outline" size="sm" onClick={() => deleteMutation.mutate(pr.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Map Product to Region">
        <div className="space-y-4">
          <Select
            label="Product"
            value={form.productId}
            onChange={(e) => setForm({ ...form, productId: e.target.value })}
            options={[
              { value: '', label: '— Select Product —' },
              ...(products?.map((p: any) => ({ value: p.id, label: `${p.name} (${p.region})` })) || []),
            ]}
          />
          <Select
            label="Region"
            value={form.regionId}
            onChange={(e) => setForm({ ...form, regionId: e.target.value })}
            options={[
              { value: '', label: '— Select Region —' },
              ...(regions?.map((r: any) => ({ value: r.id, label: `${r.name} (${r.code})` })) || []),
            ]}
          />
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.productId || !form.regionId} className="w-full">
            {createMutation.isPending ? 'Creating...' : 'Create Mapping'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}


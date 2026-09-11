import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Plus, Trash2, Pencil, FolderTree, Layers, GitBranch } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Input, Select, Modal, Badge } from '@/components/ui';

type Tab = 'brands' | 'categories' | 'subcategories';

export function CatalogPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('brands');

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Catalog Management</h1>
        <p className="text-sm text-muted-foreground">
          Brand → Category → Sub-category. A brand is the company (Microsoft), a category is what
          it sells (Xbox Digital Codes), and a sub-category is the grouping inside it (Xbox USA,
          Xbox Game Pass). Products are then added under a sub-category.
        </p>
      </div>

      <div className="flex gap-2 border-b border-border">
        <TabButton active={tab === 'brands'} onClick={() => setTab('brands')} icon={Layers} label="Brands" />
        <TabButton active={tab === 'categories'} onClick={() => setTab('categories')} icon={FolderTree} label="Categories" />
        <TabButton active={tab === 'subcategories'} onClick={() => setTab('subcategories')} icon={GitBranch} label="Sub-categories" />
      </div>

      {tab === 'brands' && <BrandsTab />}
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'subcategories' && <SubcategoriesTab />}
    </div>
  );
}

function BrandsTab() {
  const queryClient = useQueryClient();
  const { data: brands, isLoading } = useQuery({ queryKey: ['brands'], queryFn: () => api.listBrands() });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', sortOrder: 0 });

  const [editing, setEditing] = useState<any>(null);
  // Every one of these used to fail in silence: no onError anywhere, so a
  // refused create or delete looked exactly like a button that did nothing.
  const [error, setError] = useState('');

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['brands'] });
    queryClient.invalidateQueries({ queryKey: ['categories'] });
    queryClient.invalidateQueries({ queryKey: ['catalog-hierarchy'] });
  };

  const createMutation = useMutation({
    mutationFn: () => api.createBrand(form),
    onSuccess: () => {
      refresh();
      setShowCreate(false);
      setForm({ name: '', description: '', sortOrder: 0 });
      setError('');
    },
    onError: (err: any) => setError(err.message),
  });

  const renameMutation = useMutation({
    mutationFn: () => api.updateBrand(editing.id, { name: editing.name.trim() }),
    onSuccess: () => { refresh(); setEditing(null); setError(''); },
    onError: (err: any) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteBrand(id),
    onSuccess: () => { refresh(); setError(''); },
    onError: (err: any) => setError(err.message),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setError(''); setShowCreate(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Add Brand
        </Button>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {brands?.map((brand: any) => (
          <Card key={brand.id} hover>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">{brand.name}</h3>
                <p className="text-xs text-muted-foreground">/{brand.slug}</p>
                {brand.description && <p className="mt-2 text-sm text-muted-foreground">{brand.description}</p>}
                <div className="mt-3 flex items-center gap-2">
                  <Badge className={brand.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                    {brand.active ? 'ACTIVE' : 'INACTIVE'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{brand._count?.categories || 0} categories</span>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="outline" size="sm" title="Rename this brand"
                  onClick={() => { setError(''); setEditing({ id: brand.id, name: brand.name }); }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline" size="sm" title="Delete this brand"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => { setError(''); deleteMutation.mutate(brand.id); }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Rename brand">
        <div className="space-y-4">
          <Input
            label="Name"
            value={editing?.name ?? ''}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            The brand's address follows its name, so links to it change with the rename.
          </p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              className="flex-1"
              disabled={renameMutation.isPending || !editing?.name?.trim()}
              onClick={() => renameMutation.mutate()}
            >
              {renameMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Brand">
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. PlayStation" />
          <Input label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional" />
          <Input label="Sort Order" type="number" value={String(form.sortOrder)} onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.name} className="w-full">
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </Modal>
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
  const { data: brands } = useQuery({ queryKey: ['brands'], queryFn: () => api.listBrands() });
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', sortOrder: 0, brandId: '' });

  const [editing, setEditing] = useState<any>(null);
  const [error, setError] = useState('');

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['categories'] });
    queryClient.invalidateQueries({ queryKey: ['subcategories'] });
    queryClient.invalidateQueries({ queryKey: ['catalog-hierarchy'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
  };

  const createMutation = useMutation({
    mutationFn: () => api.createCategory(form),
    onSuccess: () => {
      refresh();
      setShowCreate(false);
      setForm({ name: '', description: '', sortOrder: 0, brandId: '' });
      setError('');
    },
    onError: (err: any) => setError(err.message),
  });

  const renameMutation = useMutation({
    mutationFn: () => api.updateCategory(editing.id, {
      name: editing.name.trim(),
      brandId: editing.brandId || null,
    }),
    onSuccess: () => { refresh(); setEditing(null); setError(''); },
    onError: (err: any) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteCategory(id),
    onSuccess: () => { refresh(); setError(''); },
    onError: (err: any) => setError(err.message),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setError(''); setShowCreate(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Add Category
        </Button>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {categories?.map((cat: any) => (
          <Card key={cat.id} hover>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">{cat.name}</h3>
                <p className="text-xs text-muted-foreground">/{cat.slug}{cat.brand ? ` · ${cat.brand.name}` : ''}</p>
                {cat.description && <p className="mt-2 text-sm text-muted-foreground">{cat.description}</p>}
                <div className="mt-3 flex items-center gap-2">
                  <Badge className={cat.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                    {cat.active ? 'ACTIVE' : 'INACTIVE'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{cat._count?.products || 0} products</span>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="outline" size="sm" title="Rename this category"
                  onClick={() => {
                    setError('');
                    setEditing({ id: cat.id, name: cat.name, brandId: cat.brandId || '' });
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline" size="sm" title="Delete this category"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => { setError(''); deleteMutation.mutate(cat.id); }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit category">
        <div className="space-y-4">
          <Input
            label="Name"
            value={editing?.name ?? ''}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          />
          <Select
            label="Brand"
            value={editing?.brandId ?? ''}
            onChange={(e) => setEditing({ ...editing, brandId: e.target.value })}
            options={[
              { value: '', label: 'No brand' },
              ...(brands?.map((b: any) => ({ value: b.id, label: b.name })) || []),
            ]}
          />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              className="flex-1"
              disabled={renameMutation.isPending || !editing?.name?.trim()}
              onClick={() => renameMutation.mutate()}
            >
              {renameMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Category">
        <div className="space-y-4">
          <Select
            label="Brand (optional)"
            value={form.brandId}
            onChange={(e) => setForm({ ...form, brandId: e.target.value })}
            options={[
              { value: '', label: 'No brand' },
              ...(brands?.map((b: any) => ({ value: b.id, label: b.name })) || []),
            ]}
          />
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. PSN Gift Card" />
          <Input label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional" />
          <Input label="Sort Order" type="number" value={String(form.sortOrder)} onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.name} className="w-full">
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}



/**
 * Sub-categories: the grouping inside a category.
 *
 * Most of them stand for a region — "Xbox USA" is the USA region under Xbox
 * Digital Codes — and one that names a region lends it to every product filed
 * under it, so the region stops being typed by hand on each product. The link
 * is optional, because "Xbox Game Pass" belongs beside "Xbox USA" without
 * being a place.
 */
function SubcategoriesTab() {
  const queryClient = useQueryClient();
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => api.listCategories() });
  const { data: regions } = useQuery({ queryKey: ['regions'], queryFn: () => api.listRegions() });
  const { data: subcategories, isLoading } = useQuery({
    queryKey: ['subcategories'],
    queryFn: () => api.listSubcategories(),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', categoryId: '', regionId: '' });
  const [error, setError] = useState('');
  // A sub-category usually IS a region, so a new one is made here rather than
  // on a separate screen. The currency lives on the region and drives every
  // price shown for it, which is why it is asked for rather than assumed.
  const [newRegion, setNewRegion] = useState<null | {
    name: string; code: string; currency: string; symbol: string;
  }>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['subcategories'] });
    queryClient.invalidateQueries({ queryKey: ['catalog-tree'] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      // Create the region first when one was typed, so the sub-category can
      // point at it in the same step.
      let regionId = form.regionId || null;
      if (newRegion) {
        const created = await api.createRegion({
          name: newRegion.name.trim(),
          code: newRegion.code.trim().toUpperCase(),
          currency: newRegion.currency.trim().toUpperCase() || 'USD',
          symbol: newRegion.symbol.trim() || '$',
        });
        regionId = created.id;
      }
      return api.createSubcategory({
        name: form.name.trim(),
        categoryId: form.categoryId,
        regionId,
      });
    },
    onSuccess: () => {
      refresh();
      queryClient.invalidateQueries({ queryKey: ['regions'] });
      setShowCreate(false);
      setForm({ name: '', categoryId: '', regionId: '' });
      setNewRegion(null);
      setError('');
    },
    onError: (err: any) => setError(err.message),
  });

  const [editing, setEditing] = useState<any>(null);

  const renameMutation = useMutation({
    mutationFn: () => api.updateSubcategory(editing.id, {
      name: editing.name.trim(),
      regionId: editing.regionId || null,
    }),
    onSuccess: () => { refresh(); setEditing(null); setError(''); },
    onError: (err: any) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteSubcategory(id),
    onSuccess: () => { refresh(); setError(''); },
    onError: (err: any) => setError(err.message),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  // Grouped under their category, so the tree is readable at a glance.
  const byCategory = new Map<string, any[]>();
  for (const sub of subcategories || []) {
    const key = sub.category?.name || 'Uncategorised';
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(sub);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setError(''); setShowCreate(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Add Sub-category
        </Button>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {[...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([category, rows]) => (
        <div key={category} className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {category}
          </h3>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {rows.map((sub: any) => (
              <Card key={sub.id} hover>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="font-semibold">{sub.name}</h4>
                    <p className="text-xs text-muted-foreground">
                      {sub.region
                        ? `${sub.region.name} (${sub.region.code}) · ${sub.region.currency}`
                        : 'No region — products here need one of their own'}
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <Badge className={sub.active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-destructive/10 text-destructive'}>
                        {sub.active ? 'ACTIVE' : 'INACTIVE'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {sub._count?.products || 0} product(s)
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline" size="sm" title="Rename this sub-category"
                      onClick={() => {
                        setError('');
                        setEditing({ id: sub.id, name: sub.name, regionId: sub.regionId || '' });
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline" size="sm"
                      className="text-destructive hover:bg-destructive/10"
                      title={sub._count?.products
                        ? 'Has products — this switches it off instead of deleting'
                        : 'Delete this sub-category'}
                      onClick={() => { setError(''); deleteMutation.mutate(sub.id); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {(!subcategories || subcategories.length === 0) && (
        <Card className="py-12 text-center text-muted-foreground">
          No sub-categories yet. Add one to group products inside a category.
        </Card>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit sub-category">
        <div className="space-y-4">
          <Input
            label="Name"
            value={editing?.name ?? ''}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          />
          <Select
            label="Region"
            value={editing?.regionId ?? ''}
            onChange={(e) => setEditing({ ...editing, regionId: e.target.value })}
            options={[
              { value: '', label: 'No region' },
              ...(regions?.map((r: any) => ({
                value: r.id,
                label: `${r.name} (${r.code}) · ${r.currency}`,
              })) || []),
            ]}
          />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              className="flex-1"
              disabled={renameMutation.isPending || !editing?.name?.trim()}
              onClick={() => renameMutation.mutate()}
            >
              {renameMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Sub-category">
        <div className="space-y-4">
          <Select
            label="Category"
            value={form.categoryId}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            options={[
              { value: '', label: '— Select —' },
              ...(categories?.map((c: any) => ({
                value: c.id,
                label: c.brand ? `${c.brand.name} › ${c.name}` : c.name,
              })) || []),
            ]}
          />
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Xbox USA, or Xbox Game Pass"
          />
          <Select
            label="Region (optional)"
            value={newRegion ? '__new' : form.regionId}
            onChange={(e) => {
              const value = e.target.value;
              if (value === '__new') {
                setNewRegion({ name: '', code: '', currency: 'USD', symbol: '$' });
                setForm({ ...form, regionId: '' });
              } else {
                setNewRegion(null);
                setForm({ ...form, regionId: value });
              }
            }}
            options={[
              { value: '', label: 'No region' },
              ...(regions?.map((r: any) => ({
                value: r.id,
                label: `${r.name} (${r.code}) · ${r.currency}`,
              })) || []),
              { value: '__new', label: '+ New region...' },
            ]}
          />

          {newRegion && (
            <div className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
              <Input
                label="Region name"
                value={newRegion.name}
                onChange={(e) => setNewRegion({ ...newRegion, name: e.target.value })}
                placeholder="e.g. Turkey"
              />
              <Input
                label="Code"
                value={newRegion.code}
                onChange={(e) => setNewRegion({ ...newRegion, code: e.target.value })}
                placeholder="e.g. TR"
              />
              <Input
                label="Currency"
                value={newRegion.currency}
                onChange={(e) => setNewRegion({ ...newRegion, currency: e.target.value })}
                placeholder="e.g. TRY"
              />
              <Input
                label="Symbol"
                value={newRegion.symbol}
                onChange={(e) => setNewRegion({ ...newRegion, symbol: e.target.value })}
                placeholder="e.g. ₺"
              />
              <p className="text-xs text-muted-foreground sm:col-span-2">
                The currency is what every price for this region is written in, so a Turkish
                sub-category set to TRY shows Lira rather than dollars.
              </p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Pick a region and every product filed under this sub-category takes it automatically,
            along with the currency it prices in. Leave it blank for a grouping that is not a
            place, such as Game Pass.
          </p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button
            onClick={() => createMutation.mutate()}
            disabled={
              createMutation.isPending ||
              !form.name.trim() ||
              !form.categoryId ||
              (!!newRegion && (!newRegion.name.trim() || !newRegion.code.trim()))
            }
            className="w-full"
          >
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

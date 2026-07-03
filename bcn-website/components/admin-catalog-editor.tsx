"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { hasSupabaseBrowserConfig, supabase } from "@/lib/supabase-browser";

type CatalogProduct = {
  id: string;
  slug: string;
  name: string;
  scientific_name: string | null;
  common_name: string | null;
  category: "Plants" | "Cuttings" | "Seeds";
  description: string;
  price: number;
  inventory: number;
  featured: boolean;
  active: boolean;
  ships: boolean;
  local_pickup: boolean;
  tags: string[] | null;
};

type CatalogVariant = {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  price: number;
  inventory: number;
  active: boolean;
};

type AdminState = "checking" | "signed-out" | "not-admin" | "ready" | "missing-config";

const emptyForm = {
  name: "",
  slug: "",
  scientific_name: "",
  common_name: "",
  category: "Seeds" as CatalogProduct["category"],
  description: "",
  price: "0",
  inventory: "0",
  featured: false,
  active: true,
  ships: true,
  local_pickup: false,
  tags: ""
};

export function AdminCatalogEditor() {
  const [state, setState] = useState<AdminState>("checking");
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [variants, setVariants] = useState<CatalogVariant[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const selected = products.find((product) => product.id === selectedId) ?? null;
  const selectedVariants = variants.filter((variant) => variant.product_id === selectedId);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter((product) =>
      [product.name, product.scientific_name, product.common_name, product.category, product.slug]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [products, search]);

  useEffect(() => {
    if (!hasSupabaseBrowserConfig() || !supabase) {
      setState("missing-config");
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) {
        setState("signed-out");
        return;
      }
      void verifyAdminAndLoad(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setState("signed-out");
        setProducts([]);
        setVariants([]);
        return;
      }
      void verifyAdminAndLoad(nextSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!selected) return;
    setForm({
      name: selected.name,
      slug: selected.slug,
      scientific_name: selected.scientific_name ?? "",
      common_name: selected.common_name ?? "",
      category: selected.category,
      description: selected.description ?? "",
      price: String(selected.price ?? 0),
      inventory: String(selected.inventory ?? 0),
      featured: selected.featured,
      active: selected.active,
      ships: selected.ships,
      local_pickup: selected.local_pickup,
      tags: (selected.tags ?? []).join(", ")
    });
  }, [selected]);

  async function verifyAdminAndLoad(nextSession: Session) {
    if (!supabase) return;
    setState("checking");
    const { data: admin, error } = await supabase
      .from("bcn_admins")
      .select("user_id")
      .eq("user_id", nextSession.user.id)
      .maybeSingle();

    if (error || !admin) {
      setState("not-admin");
      setMessage(error?.message ?? "Signed in, but this account is not listed as a BCN admin.");
      return;
    }

    setState("ready");
    await loadCatalog();
  }

  async function loadCatalog() {
    if (!supabase) return;
    setMessage("Loading catalog...");
    const [{ data: productRows, error: productError }, { data: variantRows, error: variantError }] = await Promise.all([
      supabase.from("products").select("*").order("name", { ascending: true }),
      supabase.from("product_variants").select("*").order("name", { ascending: true })
    ]);

    if (productError || variantError) {
      setMessage(productError?.message ?? variantError?.message ?? "Could not load catalog.");
      return;
    }

    setProducts((productRows ?? []) as CatalogProduct[]);
    setVariants((variantRows ?? []) as CatalogVariant[]);
    setSelectedId((current) => current ?? productRows?.[0]?.id ?? null);
    setMessage(`Loaded ${productRows?.length ?? 0} products.`);
  }

  async function signIn() {
    if (!supabase) return;
    setMessage("Signing in...");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message);
  }

  async function signInWithGoogle() {
    if (!supabase) return;
    setMessage("Opening Google sign in...");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/admin`
      }
    });
    if (error) setMessage(error.message);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  async function saveProduct() {
    if (!supabase || !selected) return;
    setSaving(true);
    setMessage("Saving product...");
    const tags = form.tags
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);

    const { error } = await supabase
      .from("products")
      .update({
        name: form.name,
        slug: form.slug,
        scientific_name: form.scientific_name || null,
        common_name: form.common_name || null,
        category: form.category,
        description: form.description,
        price: Number(form.price) || 0,
        inventory: Number(form.inventory) || 0,
        featured: form.featured,
        active: form.active,
        ships: form.ships,
        local_pickup: form.local_pickup,
        tags
      })
      .eq("id", selected.id);

    setSaving(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setProducts((current) =>
      current.map((product) =>
        product.id === selected.id
          ? {
              ...product,
              name: form.name,
              slug: form.slug,
              scientific_name: form.scientific_name || null,
              common_name: form.common_name || null,
              category: form.category,
              description: form.description,
              price: Number(form.price) || 0,
              inventory: Number(form.inventory) || 0,
              featured: form.featured,
              active: form.active,
              ships: form.ships,
              local_pickup: form.local_pickup,
              tags
            }
          : product
      )
    );
    setMessage("Product saved.");
  }

  async function updateVariant(variant: CatalogVariant, patch: Partial<CatalogVariant>) {
    if (!supabase) return;
    const next = { ...variant, ...patch };
    const nextVariants = variants.map((item) => (item.id === variant.id ? next : item));
    setVariants(nextVariants);
    const { error } = await supabase
      .from("product_variants")
      .update({
        name: next.name,
        sku: next.sku,
        price: Number(next.price) || 0,
        inventory: Number(next.inventory) || 0,
        active: next.active
      })
      .eq("id", variant.id);
    if (error) {
      setMessage(error.message);
      await loadCatalog();
      return;
    }
    setMessage("Inventory option saved.");
    await refreshProductInventory(next.product_id, nextVariants);
  }

  async function refreshProductInventory(productId: string, variantRows = variants) {
    if (!supabase) return;
    const currentVariants = variantRows.filter((variant) => variant.product_id === productId);
    const inventory = currentVariants.reduce((sum, variant) => sum + Math.max(0, Number(variant.inventory) || 0), 0);
    await supabase.from("products").update({ inventory }).eq("id", productId);
    setProducts((current) => current.map((product) => (product.id === productId ? { ...product, inventory } : product)));
  }

  if (state === "missing-config") {
    return <AdminShell title="Admin setup needed">Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to Vercel and local `.env.local`.</AdminShell>;
  }

  if (state === "checking") {
    return <AdminShell title="Checking access">Looking for your admin session...</AdminShell>;
  }

  if (state === "signed-out") {
    return (
      <AdminShell title="Owner sign in">
        <div className="mt-6 grid gap-4">
          <input className="admin-input" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <input className="admin-input" placeholder="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <button className="button button-primary" onClick={signIn}>Sign In</button>
          <button className="button button-secondary" onClick={signInWithGoogle}>Sign In With Google</button>
          {message ? <p className="text-sm font-bold text-rust">{message}</p> : null}
        </div>
      </AdminShell>
    );
  }

  if (state === "not-admin") {
    return (
      <AdminShell title="Not an admin yet">
        <p className="mt-4 leading-7 text-ink/75">{message}</p>
        <p className="mt-4 text-sm font-bold text-stone">Add this user id to `public.bcn_admins` in Supabase:</p>
        <code className="mt-2 block rounded-md bg-sage p-3 text-sm text-pine">{session?.user.id}</code>
        <button className="button button-secondary mt-6" onClick={signOut}>Sign Out</button>
      </AdminShell>
    );
  }

  return (
    <main className="container py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-stone">Owner admin</p>
          <h1 className="mt-3 text-5xl font-black text-pine">Catalog editor</h1>
          <p className="mt-4 text-ink/70">Signed in as {session?.user.email}</p>
        </div>
        <button className="button button-secondary" onClick={signOut}>Sign Out</button>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
        <aside className="field-card p-4">
          <input className="admin-input" placeholder="Search catalog..." value={search} onChange={(event) => setSearch(event.target.value)} />
          <button className="button button-secondary mt-3 w-full" onClick={loadCatalog}>Refresh</button>
          <div className="mt-4 max-h-[720px] overflow-y-auto pr-1">
            {filteredProducts.map((product) => (
              <button
                key={product.id}
                className={`mb-2 w-full rounded-md border p-3 text-left ${product.id === selectedId ? "border-pine bg-sage" : "border-pine/15 bg-white"}`}
                onClick={() => setSelectedId(product.id)}
              >
                <p className="font-black text-pine">{product.name}</p>
                <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-stone">
                  {product.category} / {product.inventory} available / {product.active ? "active" : "hidden"}
                </p>
              </button>
            ))}
          </div>
        </aside>

        <section className="field-card p-6">
          {selected ? (
            <div className="grid gap-6">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Product name"><input className="admin-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
                <Field label="Slug"><input className="admin-input" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} /></Field>
                <Field label="Common name"><input className="admin-input" value={form.common_name} onChange={(event) => setForm({ ...form, common_name: event.target.value })} /></Field>
                <Field label="Scientific name"><input className="admin-input" value={form.scientific_name} onChange={(event) => setForm({ ...form, scientific_name: event.target.value })} /></Field>
                <Field label="Category">
                  <select className="admin-input" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as CatalogProduct["category"] })}>
                    <option>Seeds</option>
                    <option>Plants</option>
                    <option>Cuttings</option>
                  </select>
                </Field>
                <Field label="Base price"><input className="admin-input" type="number" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></Field>
              </div>

              <Field label="Description">
                <textarea className="admin-input min-h-44" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
              </Field>

              <Field label="Tags">
                <input className="admin-input" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} />
              </Field>

              <div className="flex flex-wrap gap-3">
                <Toggle label="Active" checked={form.active} onChange={(checked) => setForm({ ...form, active: checked })} />
                <Toggle label="Featured" checked={form.featured} onChange={(checked) => setForm({ ...form, featured: checked })} />
                <Toggle label="Ships" checked={form.ships} onChange={(checked) => setForm({ ...form, ships: checked })} />
                <Toggle label="Local pickup" checked={form.local_pickup} onChange={(checked) => setForm({ ...form, local_pickup: checked })} />
              </div>

              <div>
                <h2 className="text-2xl font-black text-pine">Inventory options</h2>
                <div className="mt-4 grid gap-3">
                  {selectedVariants.map((variant) => (
                    <VariantEditor key={variant.id} variant={variant} onSave={updateVariant} />
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <button className="button button-primary" disabled={saving} onClick={saveProduct}>{saving ? "Saving..." : "Save Product"}</button>
                {message ? <p className="font-bold text-stone">{message}</p> : null}
              </div>
            </div>
          ) : (
            <p className="text-lg text-ink/70">Choose a product to edit.</p>
          )}
        </section>
      </div>
    </main>
  );
}

function AdminShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="container py-12">
      <section className="field-card mx-auto max-w-2xl p-8">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-stone">Owner admin</p>
        <h1 className="mt-3 text-4xl font-black text-pine">{title}</h1>
        <div className="mt-2 text-ink/75">{children}</div>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-stone">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className={`rounded-full border px-4 py-2 text-sm font-black ${checked ? "border-pine bg-pine text-white" : "border-pine/20 bg-sage text-pine"}`}>
      <input className="sr-only" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function VariantEditor({ variant, onSave }: { variant: CatalogVariant; onSave: (variant: CatalogVariant, patch: Partial<CatalogVariant>) => void }) {
  const [draft, setDraft] = useState(variant);

  useEffect(() => setDraft(variant), [variant]);

  return (
    <article className="rounded-md border border-pine/15 bg-sage/45 p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_120px_100px_100px_auto]">
        <input className="admin-input" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        <input className="admin-input" value={draft.sku ?? ""} placeholder="SKU" onChange={(event) => setDraft({ ...draft, sku: event.target.value })} />
        <input className="admin-input" type="number" step="0.01" value={draft.price} onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })} />
        <input className="admin-input" type="number" value={draft.inventory} onChange={(event) => setDraft({ ...draft, inventory: Number(event.target.value) })} />
        <button className="button button-secondary" onClick={() => onSave(variant, draft)}>Save</button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {[-5, -1, 1, 5, 10].map((amount) => (
          <button
            key={amount}
            className="rounded-full bg-white px-3 py-1 text-xs font-black text-pine"
            onClick={() => {
              const inventory = Math.max(0, Number(draft.inventory) + amount);
              setDraft({ ...draft, inventory });
              onSave(variant, { inventory });
            }}
          >
            {amount > 0 ? `+${amount}` : amount}
          </button>
        ))}
        <button
          className="rounded-full bg-white px-3 py-1 text-xs font-black text-rust"
          onClick={() => {
            setDraft({ ...draft, inventory: 0 });
            onSave(variant, { inventory: 0 });
          }}
        >
          Sold out
        </button>
      </div>
    </article>
  );
}

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

type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  sku: string | null;
  product_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
};

type ShopOrder = {
  id: string;
  stripe_session_id: string;
  stripe_payment_intent: string | null;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
  customer_name: string | null;
  customer_email: string | null;
  phone: string | null;
  order_status: "new" | "ready_for_pickup" | "shipped" | "fulfilled" | "cancelled" | "refunded";
  payment_status: "paid" | "unpaid" | "no_payment_required" | "refunded" | "failed";
  fulfillment_type: "pickup" | "shipping";
  pickup_location: string | null;
  shipping_address: Record<string, unknown> | null;
  subtotal: number;
  shipping_cost: number;
  tax: number;
  total: number;
  currency: string;
  notes: string | null;
  fulfilled_at: string | null;
  order_items: OrderItem[];
};

type AdminState = "checking" | "signed-out" | "not-admin" | "ready" | "missing-config";
type AdminTab = "orders" | "catalog";

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
  const [activeTab, setActiveTab] = useState<AdminTab>("orders");

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
          <h1 className="mt-3 text-5xl font-black text-pine">{activeTab === "orders" ? "Orders" : "Catalog editor"}</h1>
          <p className="mt-4 text-ink/70">Signed in as {session?.user.email}</p>
        </div>
        <button className="button button-secondary" onClick={signOut}>Sign Out</button>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          className={`button ${activeTab === "orders" ? "button-primary" : "button-secondary"}`}
          onClick={() => setActiveTab("orders")}
        >
          Orders
        </button>
        <button
          className={`button ${activeTab === "catalog" ? "button-primary" : "button-secondary"}`}
          onClick={() => setActiveTab("catalog")}
        >
          Catalog
        </button>
      </div>

      {activeTab === "orders" ? (
        <AdminOrdersDashboard />
      ) : (
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
      )}
    </main>
  );
}

function AdminOrdersDashboard() {
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "new" | "pickup" | "shipping" | "fulfilled" | "cancelled" | "all">("open");
  const [orderSearch, setOrderSearch] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const selected = orders.find((order) => order.id === selectedId) ?? orders[0] ?? null;

  const filteredOrders = useMemo(() => {
    const byStatus = (() => {
      if (filter === "all") return orders;
      if (filter === "open") return orders.filter((order) => !["fulfilled", "cancelled", "refunded"].includes(order.order_status));
      if (filter === "pickup") return orders.filter((order) => order.fulfillment_type === "pickup");
      if (filter === "shipping") return orders.filter((order) => order.fulfillment_type === "shipping");
      return orders.filter((order) => order.order_status === filter);
    })();

    const term = orderSearch.trim().toLowerCase();
    if (!term) return byStatus;
    return byStatus.filter((order) =>
      [
        order.customer_name,
        order.customer_email,
        order.phone,
        order.order_status,
        order.fulfillment_type,
        order.payment_status,
        order.stripe_session_id,
        ...order.order_items.flatMap((item) => [item.product_name, item.variant_name, item.sku])
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [filter, orderSearch, orders]);

  const orderCounts = useMemo(() => ({
    open: orders.filter((order) => !["fulfilled", "cancelled", "refunded"].includes(order.order_status)).length,
    new: orders.filter((order) => order.order_status === "new").length,
    pickup: orders.filter((order) => order.fulfillment_type === "pickup").length,
    shipping: orders.filter((order) => order.fulfillment_type === "shipping").length,
    fulfilled: orders.filter((order) => order.order_status === "fulfilled").length
  }), [orders]);

  useEffect(() => {
    void loadOrders();
  }, []);

  async function loadOrders() {
    if (!supabase) return;
    setLoading(true);
    setMessage("Loading orders...");
    const { data, error } = await supabase
      .from("orders")
      .select(`
        *,
        order_items (
          id,
          order_id,
          product_id,
          variant_id,
          sku,
          product_name,
          variant_name,
          quantity,
          unit_price,
          line_total
        )
      `)
      .order("created_at", { ascending: false });

    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }

    const rows = ((data ?? []) as ShopOrder[]).map((order) => ({
      ...order,
      order_items: order.order_items ?? []
    }));
    setOrders(rows);
    setSelectedId((current) => current ?? rows[0]?.id ?? null);
    setMessage(`Loaded ${rows.length} order${rows.length === 1 ? "" : "s"}.`);
  }

  async function updateOrderStatus(order: ShopOrder, order_status: ShopOrder["order_status"]) {
    if (!supabase) return;
    setMessage("Updating order...");
    const { error } = await supabase
      .from("orders")
      .update({
        order_status,
        fulfilled_at: order_status === "fulfilled" ? new Date().toISOString() : null
      })
      .eq("id", order.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setOrders((current) =>
      current.map((item) =>
        item.id === order.id
          ? { ...item, order_status, fulfilled_at: order_status === "fulfilled" ? new Date().toISOString() : null }
          : item
      )
    );
    setMessage(`Order marked ${formatStatus(order_status)}.`);
  }

  function exportCsv() {
    const header = ["created_at", "customer", "email", "fulfillment", "status", "payment", "total", "items"];
    const rows = filteredOrders.map((order) => [
      order.created_at,
      order.customer_name ?? "",
      order.customer_email ?? "",
      order.fulfillment_type,
      order.order_status,
      order.payment_status,
      order.total,
      order.order_items.map((item) => `${item.quantity}x ${item.product_name}${item.variant_name ? ` (${item.variant_name})` : ""}`).join("; ")
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `bcn-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyPickupEmail(order: ShopOrder) {
    const name = order.customer_name?.split(" ")[0] || "there";
    const body = `Hi ${name},\n\nYour Base Camp North order is ready for pickup.\n\nOrder: ${order.order_items
      .map((item) => `${item.quantity}x ${item.product_name}${item.variant_name ? ` (${item.variant_name})` : ""}`)
      .join(", ")}\n\nPickup location: ${order.pickup_location || "Base Camp North"}\n\nThank you!\nBase Camp North`;
    await navigator.clipboard.writeText(body);
    setMessage("Pickup message copied.");
  }

  async function copyShippingAddress(order: ShopOrder) {
    await navigator.clipboard.writeText(formatShippingAddress(order.shipping_address));
    setMessage("Shipping address copied.");
  }

  async function copyCustomerUpdate(order: ShopOrder) {
    const name = order.customer_name?.split(" ")[0] || "there";
    const itemSummary = order.order_items
      .map((item) => `${item.quantity}x ${item.product_name}${item.variant_name ? ` (${item.variant_name})` : ""}`)
      .join(", ");
    const action =
      order.fulfillment_type === "shipping"
        ? "Your Base Camp North order is packed and moving toward shipping."
        : "Your Base Camp North order is being prepared for local pickup.";
    const body = `Hi ${name},\n\n${action}\n\nOrder: ${itemSummary}\n\nCurrent status: ${formatStatus(order.order_status)}\n\nThank you!\nBase Camp North`;
    await navigator.clipboard.writeText(body);
    setMessage("Customer update copied.");
  }

  function printPackingSlip(order: ShopOrder) {
    const printWindow = window.open("", "_blank", "width=820,height=900");
    if (!printWindow) {
      setMessage("Popup blocked. Allow popups to print packing slips.");
      return;
    }

    const items = order.order_items
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.product_name)}${item.variant_name ? `<br><span>${escapeHtml(item.variant_name)}</span>` : ""}</td>
            <td>${escapeHtml(item.sku || "")}</td>
            <td>${item.quantity}</td>
            <td>${formatMoney(Number(item.line_total), order.currency)}</td>
          </tr>`
      )
      .join("");

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>BCN Packing Slip</title>
          <style>
            body { color: #16201A; font-family: Arial, sans-serif; margin: 32px; }
            h1 { color: #0f3f25; font-size: 32px; margin: 0 0 8px; }
            h2 { font-size: 18px; margin: 28px 0 8px; text-transform: uppercase; letter-spacing: 0.12em; }
            .muted { color: #6d7769; }
            .box { border: 1px solid #ccd8c3; border-radius: 8px; padding: 16px; margin-top: 16px; }
            table { border-collapse: collapse; margin-top: 16px; width: 100%; }
            th, td { border-bottom: 1px solid #ccd8c3; padding: 10px; text-align: left; vertical-align: top; }
            th { font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; }
            span { color: #6d7769; font-size: 12px; }
            .total { font-size: 24px; font-weight: 800; text-align: right; }
            @media print { button { display: none; } }
          </style>
        </head>
        <body>
          <button onclick="window.print()">Print</button>
          <h1>Base Camp North</h1>
          <p class="muted">Packing slip / ${escapeHtml(formatDateTime(order.created_at))}</p>
          <div class="box">
            <strong>${escapeHtml(order.customer_name || "Customer")}</strong><br>
            ${escapeHtml(order.customer_email || "No email")}<br>
            ${escapeHtml(order.phone || "")}
          </div>
          <div class="box">
            <strong>${escapeHtml(formatStatus(order.fulfillment_type))}</strong><br>
            <pre>${escapeHtml(order.fulfillment_type === "pickup" ? order.pickup_location || "Base Camp North local pickup" : formatShippingAddress(order.shipping_address))}</pre>
          </div>
          <h2>Items</h2>
          <table>
            <thead><tr><th>Item</th><th>SKU</th><th>Qty</th><th>Total</th></tr></thead>
            <tbody>${items}</tbody>
          </table>
          <p class="total">${formatMoney(Number(order.total), order.currency)}</p>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setMessage("Packing slip opened.");
  }

  return (
    <div className="mt-8 grid gap-6 xl:grid-cols-[420px_1fr]">
      <aside className="field-card p-4">
        <div className="grid grid-cols-2 gap-3">
          <OrderMetric label="open" value={orderCounts.open} />
          <OrderMetric label="new" value={orderCounts.new} />
          <OrderMetric label="pickup" value={orderCounts.pickup} />
          <OrderMetric label="shipping" value={orderCounts.shipping} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(["open", "new", "pickup", "shipping", "fulfilled", "cancelled", "all"] as const).map((nextFilter) => (
            <button
              key={nextFilter}
              className={`rounded-full border px-4 py-2 text-sm font-black ${filter === nextFilter ? "border-pine bg-pine text-white" : "border-pine/20 bg-sage text-pine"}`}
              onClick={() => setFilter(nextFilter)}
            >
              {formatStatus(nextFilter)}
            </button>
          ))}
        </div>

        <input
          className="admin-input mt-4"
          placeholder="Search orders, email, SKU, item..."
          value={orderSearch}
          onChange={(event) => setOrderSearch(event.target.value)}
        />

        <div className="mt-4 flex gap-3">
          <button className="button button-secondary flex-1" onClick={loadOrders}>{loading ? "Loading..." : "Refresh"}</button>
          <button className="button button-secondary flex-1" onClick={exportCsv}>CSV</button>
        </div>

        {message ? <p className="mt-4 text-sm font-bold text-stone">{message}</p> : null}

        <div className="mt-4 max-h-[760px] overflow-y-auto pr-1">
          {filteredOrders.map((order) => (
            <button
              key={order.id}
              className={`mb-2 w-full rounded-md border p-3 text-left ${order.id === selected?.id ? "border-pine bg-sage" : "border-pine/15 bg-white"}`}
              onClick={() => setSelectedId(order.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-pine">{order.customer_name || order.customer_email || "No customer name"}</p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-stone">
                    {formatDateTime(order.created_at)}
                  </p>
                </div>
                <p className="font-black text-pine">{formatMoney(Number(order.total), order.currency)}</p>
              </div>
              <p className="mt-2 text-sm font-bold text-ink/75">
                {formatStatus(order.order_status)} / {order.fulfillment_type} / {order.order_items.length} item{order.order_items.length === 1 ? "" : "s"}
              </p>
            </button>
          ))}
        </div>
      </aside>

      <section className="field-card p-6">
        {selected ? (
          <OrderDetail
            order={selected}
            onStatus={updateOrderStatus}
            onCopyPickupEmail={copyPickupEmail}
            onCopyShippingAddress={copyShippingAddress}
            onCopyCustomerUpdate={copyCustomerUpdate}
            onPrintPackingSlip={printPackingSlip}
          />
        ) : (
          <p className="text-lg text-ink/70">No orders yet.</p>
        )}
      </section>
    </div>
  );
}

function OrderDetail({
  order,
  onStatus,
  onCopyPickupEmail,
  onCopyShippingAddress,
  onCopyCustomerUpdate,
  onPrintPackingSlip
}: {
  order: ShopOrder;
  onStatus: (order: ShopOrder, status: ShopOrder["order_status"]) => void;
  onCopyPickupEmail: (order: ShopOrder) => void;
  onCopyShippingAddress: (order: ShopOrder) => void;
  onCopyCustomerUpdate: (order: ShopOrder) => void;
  onPrintPackingSlip: (order: ShopOrder) => void;
}) {
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-stone">Order detail</p>
          <h2 className="mt-2 text-3xl font-black text-pine">{order.customer_name || "Customer"}</h2>
          <p className="mt-2 text-ink/70">{order.customer_email || "No email"} {order.phone ? `/ ${order.phone}` : ""}</p>
          <p className="mt-1 text-sm font-bold text-stone">{formatDateTime(order.created_at)}</p>
        </div>
        <div className="rounded-md bg-pine px-5 py-4 text-right text-white">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-white/70">Total</p>
          <p className="text-3xl font-black">{formatMoney(Number(order.total), order.currency)}</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <OrderMetric label="status" value={formatStatus(order.order_status)} />
        <OrderMetric label="payment" value={formatStatus(order.payment_status)} />
        <OrderMetric label="fulfillment" value={order.fulfillment_type} />
        <OrderMetric label="items" value={order.order_items.reduce((sum, item) => sum + Number(item.quantity), 0)} />
      </div>

      <div>
        <h3 className="text-xl font-black text-pine">Items</h3>
        <div className="mt-3 overflow-hidden rounded-md border border-pine/15">
          {order.order_items.map((item) => (
            <div key={item.id} className="grid gap-2 border-b border-pine/10 bg-white p-4 last:border-b-0 md:grid-cols-[1fr_90px_100px]">
              <div>
                <p className="font-black text-pine">{item.product_name}</p>
                <p className="text-sm font-bold text-stone">{item.variant_name || "Regular"} {item.sku ? `/ ${item.sku}` : ""}</p>
              </div>
              <p className="font-black text-pine">Qty {item.quantity}</p>
              <p className="font-black text-pine">{formatMoney(Number(item.line_total), order.currency)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-md border border-pine/15 bg-sage/45 p-4">
          <h3 className="text-lg font-black text-pine">Fulfillment</h3>
          <p className="mt-2 text-ink/75">{order.fulfillment_type === "pickup" ? `Pickup: ${order.pickup_location || "Base Camp North"}` : formatShippingAddress(order.shipping_address)}</p>
          {order.notes ? <p className="mt-3 text-sm font-bold text-stone">Notes: {order.notes}</p> : null}
        </section>
        <section className="rounded-md border border-pine/15 bg-sage/45 p-4">
          <h3 className="text-lg font-black text-pine">Stripe</h3>
          <p className="mt-2 break-all text-sm text-ink/75">Session: {order.stripe_session_id}</p>
          <p className="mt-2 break-all text-sm text-ink/75">Payment: {order.stripe_payment_intent || "not recorded"}</p>
        </section>
      </div>

      <div className="flex flex-wrap gap-3">
        <button className="button button-primary" onClick={() => onStatus(order, "ready_for_pickup")}>Ready for Pickup</button>
        <button className="button button-secondary" onClick={() => onStatus(order, "shipped")}>Mark Shipped</button>
        <button className="button button-secondary" onClick={() => onStatus(order, "fulfilled")}>Mark Fulfilled</button>
        <button className="button button-secondary" onClick={() => onCopyPickupEmail(order)}>Copy Pickup Email</button>
        <button className="button button-secondary" onClick={() => onCopyCustomerUpdate(order)}>Copy Customer Update</button>
        {order.fulfillment_type === "shipping" ? (
          <button className="button button-secondary" onClick={() => onCopyShippingAddress(order)}>Copy Address</button>
        ) : null}
        <button className="button button-secondary" onClick={() => onPrintPackingSlip(order)}>Print Packing Slip</button>
        <button className="button button-secondary text-rust" onClick={() => onStatus(order, "cancelled")}>Mark Issue/Cancelled</button>
      </div>
    </div>
  );
}

function OrderMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-pine/15 bg-sage/60 p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-stone">{label}</p>
      <p className="mt-2 text-xl font-black text-pine">{value}</p>
    </div>
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

function formatMoney(value: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase()
  }).format(Number(value) || 0);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatShippingAddress(address: Record<string, unknown> | null) {
  if (!address || Object.keys(address).length === 0) return "Shipping address not recorded.";
  const parts = [
    address.line1,
    address.line2,
    [address.city, address.state, address.postal_code].filter(Boolean).join(", "),
    address.country
  ].filter(Boolean);
  return parts.length ? parts.join("\n") : JSON.stringify(address);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

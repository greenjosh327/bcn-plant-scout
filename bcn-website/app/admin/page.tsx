const adminCards = [
  "Products",
  "Inventory",
  "Orders",
  "Customers",
  "Articles",
  "GIS Services"
];

export default function AdminPage() {
  return (
    <main className="container py-12">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-stone">Admin</p>
      <h1 className="mt-3 text-5xl font-black text-pine">Back office scaffold</h1>
      <p className="mt-5 max-w-3xl text-lg leading-8 text-ink/75">
        This page is a placeholder for the future authenticated admin dashboard. It gives
        the site structure a home for product editing, inventory, orders, customers,
        articles, and GIS service content.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {adminCards.map((title) => (
          <article key={title} className="field-card p-6">
            <h2 className="text-2xl font-black text-pine">{title}</h2>
            <p className="mt-3 text-sm leading-6 text-ink/70">Placeholder module</p>
          </article>
        ))}
      </div>
    </main>
  );
}

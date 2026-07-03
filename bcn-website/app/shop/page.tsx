import { ProductCard } from "@/components/product-card";
import { SectionHeading } from "@/components/section-heading";
import { products } from "@/lib/products";

export default async function ShopPage({
  searchParams
}: {
  searchParams: Promise<{ category?: string; search?: string; sort?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const category = resolvedSearchParams.category ?? "All";
  const search = (resolvedSearchParams.search ?? "").toLowerCase();
  const sort = resolvedSearchParams.sort ?? "featured";

  const filtered = products
    .filter((product) => product.active)
    .filter((product) => category === "All" || product.category === category)
    .filter((product) => {
      if (!search) return true;
      return [product.name, product.scientificName, product.commonName, product.description, ...product.tags]
        .join(" ")
        .toLowerCase()
        .includes(search);
    })
    .sort((a, b) => {
      if (sort === "price-low") return a.price - b.price;
      if (sort === "price-high") return b.price - a.price;
      if (sort === "name") return a.name.localeCompare(b.name);
      return Number(b.featured) - Number(a.featured);
    });

  return (
    <main className="container py-12">
      <SectionHeading eyebrow="Shop" title="Plants, cuttings, and seeds">
        Browse sample inventory. Checkout is scaffolded for Stripe but payments are not live yet.
      </SectionHeading>

      <form className="field-card mb-8 grid gap-4 p-4 md:grid-cols-[1fr_180px_180px_auto]">
        <input
          className="rounded-md border border-pine/20 bg-white px-4 py-3"
          name="search"
          placeholder="Search species, notes, tags..."
          defaultValue={resolvedSearchParams.search ?? ""}
        />
        <select className="rounded-md border border-pine/20 bg-white px-4 py-3" name="category" defaultValue={category}>
          {["All", "Plants", "Cuttings", "Seeds"].map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <select className="rounded-md border border-pine/20 bg-white px-4 py-3" name="sort" defaultValue={sort}>
          <option value="featured">Featured</option>
          <option value="name">Name</option>
          <option value="price-low">Price: low to high</option>
          <option value="price-high">Price: high to low</option>
        </select>
        <button className="button button-primary" type="submit">
          Filter
        </button>
      </form>

      <div className="grid gap-6 md:grid-cols-3">
        {filtered.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </main>
  );
}

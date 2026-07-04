import Link from "next/link";

export default function CartSuccessPage() {
  return (
    <main className="container py-12">
      <section className="field-card max-w-3xl p-8">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-stone">Order received</p>
        <h1 className="mt-3 text-5xl font-black text-pine">Thanks for your order.</h1>
        <p className="mt-5 text-lg leading-8 text-ink/75">
          Stripe accepted the payment. Base Camp North will follow up with pickup or shipping details.
          Inventory and order management are the next backend step.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="button button-primary" href="/shop">Back to shop</Link>
          <Link className="button button-secondary" href="/contact">Contact BCN</Link>
        </div>
      </section>
    </main>
  );
}

export default function CartPage() {
  return (
    <main className="container py-12">
      <section className="field-card max-w-3xl p-8">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-stone">Cart</p>
        <h1 className="mt-3 text-5xl font-black text-pine">Shopping cart</h1>
        <p className="mt-5 text-lg leading-8 text-ink/75">
          Cart architecture is ready for quantity adjustment, subtotal, shipping estimate,
          tax placeholder, and Stripe checkout. Live payments are intentionally not enabled.
        </p>
        <div className="mt-8 rounded-md bg-sage/55 p-5">
          <div className="flex items-center justify-between">
            <span className="font-bold">Subtotal</span>
            <span className="font-black">$0.00</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-stone">
            <span>Estimated shipping</span>
            <span>Calculated later</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-stone">
            <span>Tax</span>
            <span>Calculated later</span>
          </div>
        </div>
        <button className="button button-primary mt-6 w-full" type="button">
          Checkout Coming Soon
        </button>
      </section>
    </main>
  );
}

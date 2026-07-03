export default function ContactPage() {
  return (
    <main className="container py-12">
      <section className="field-card max-w-3xl p-8">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-stone">Contact</p>
        <h1 className="mt-3 text-5xl font-black text-pine">Talk plants, pickup, or GIS.</h1>
        <p className="mt-5 text-lg leading-8 text-ink/75">
          This contact form is a placeholder for now. Email and scheduling automation can be
          wired in after the core site is settled.
        </p>
        <div className="mt-8 grid gap-4">
          <input className="rounded-md border border-pine/20 px-4 py-3" placeholder="Name" />
          <input className="rounded-md border border-pine/20 px-4 py-3" placeholder="Email" />
          <textarea className="min-h-40 rounded-md border border-pine/20 px-4 py-3" placeholder="What are you working on?" />
          <button className="button button-primary" type="button">Send Message Later</button>
        </div>
      </section>
    </main>
  );
}

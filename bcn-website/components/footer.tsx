import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-pine/10 bg-pine text-white">
      <div className="container grid gap-8 py-12 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-sage">Base Camp North</p>
          <h2 className="mt-3 text-3xl font-black">Resilience into roots.</h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-sage">
            Native plants, seed collection, and GIS work for people rebuilding habitat one
            backyard, trail edge, and woodland patch at a time.
          </p>
        </div>
        <div className="grid gap-2 text-sm">
          <p className="font-black uppercase tracking-[0.18em] text-sage">Shop</p>
          <Link href="/shop?category=Plants">Plants</Link>
          <Link href="/shop?category=Cuttings">Cuttings</Link>
          <Link href="/shop?category=Seeds">Seeds</Link>
        </div>
        <div className="grid gap-2 text-sm">
          <p className="font-black uppercase tracking-[0.18em] text-sage">Work</p>
          <Link href="/gis">GIS Services</Link>
          <Link href="/about">About BCN</Link>
          <Link href="/contact">Contact</Link>
        </div>
      </div>
    </footer>
  );
}

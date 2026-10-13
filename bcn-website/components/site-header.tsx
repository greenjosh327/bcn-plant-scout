import Link from "next/link";
import Image from "next/image";
import { CartLink } from "@/components/cart-link";

const navItems = [
  ["Shop", "/shop"],
  ["Scout App", "https://scout.basecampnorthpa.com"],
  ["Weekly Giveaway", "/plant-scout-challenge"],
  ["Articles", "/articles"],
  ["About", "/about"],
  ["Contact", "/contact"]
];

export function SiteHeader() {
  return (
    <header className="border-b border-pine/10 bg-[#f8faf3]/92 backdrop-blur">
      <div className="container flex min-h-[56px] items-center justify-between gap-2 md:min-h-20 md:gap-4">
        <Link href="/" className="flex min-w-0 items-center gap-2 md:gap-3">
          <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-pine/15 bg-white md:h-12 md:w-12">
            <Image
              src="/bcn-icon.png"
              alt=""
              fill
              sizes="48px"
              className="object-cover"
              priority
            />
          </span>
          <span>
            <span className="block text-base font-black leading-tight text-pine md:text-lg">Base Camp North</span>
            <span className="hidden text-xs font-bold uppercase tracking-[0.18em] text-stone md:block">
              Native nursery and seeds
            </span>
          </span>
        </Link>
        <nav aria-label="Main navigation" className="hidden flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm font-bold text-pine md:flex">
          {navItems.map(([label, href]) => (
            href === "/plant-scout-challenge" ? <a key={href} href={href} className="hover:text-rust">{label}</a> :
            <Link key={href} href={href} className="hover:text-rust">
              {label}
            </Link>
          ))}
        </nav>
        <CartLink />
      </div>
      <nav aria-label="Mobile navigation" className="container flex items-center justify-between gap-2 text-sm font-bold text-pine md:hidden"><a href="/shop" className="inline-flex min-h-11 items-center hover:text-rust">Shop</a><a href="/plant-scout-challenge" className="inline-flex min-h-11 items-center hover:text-rust">Weekly Giveaway</a><details className="relative"><summary className="flex min-h-11 cursor-pointer items-center px-2">Menu</summary><div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-pine/15 bg-[#f8faf3] p-2 shadow-lg">{navItems.filter(([,href]) => href !== "/shop" && href !== "/plant-scout-challenge").map(([label,href]) => <Link key={href} href={href} className="flex min-h-11 items-center rounded px-3 hover:bg-sage/40">{label}</Link>)}</div></details></nav>
    </header>
  );
}

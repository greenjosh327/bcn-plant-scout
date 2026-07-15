import Link from "next/link";
import Image from "next/image";
import { CartLink } from "@/components/cart-link";

const navItems = [
  ["Shop", "/shop"],
  ["GIS", "/gis"],
  ["Articles", "/articles"],
  ["About", "/about"],
  ["Contact", "/contact"]
];

export function SiteHeader() {
  return (
    <header className="border-b border-pine/10 bg-[#f8faf3]/92 backdrop-blur">
      <div className="container flex min-h-20 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3">
          <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-pine/15 bg-white">
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
            <span className="block text-lg font-black leading-tight text-pine">Base Camp North</span>
            <span className="block text-xs font-bold uppercase tracking-[0.18em] text-stone">
              Native nursery and GIS
            </span>
          </span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-bold text-pine md:flex">
          {navItems.map(([label, href]) => (
            <Link key={href} href={href} className="hover:text-rust">
              {label}
            </Link>
          ))}
        </nav>
        <CartLink />
      </div>
    </header>
  );
}

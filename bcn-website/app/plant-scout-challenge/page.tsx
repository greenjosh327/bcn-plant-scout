import type { Metadata } from "next";
import Image from "next/image";
import { ChallengeEntryForm } from "@/components/challenge-entry-form";
import { ChallengePreviewForm } from "@/components/challenge-preview-form";
import { previewReady } from "@/lib/challenge/preview-server";
import { getCatalogProducts } from "@/lib/catalog-db";
import { DEFAULT_PRODUCT_IMAGE_URL, getPrimaryProductImage } from "@/lib/product-images";
import { currentWeek, DRAWINGS, WEEKS } from "@/lib/challenge/core";
import { available, pageVisible } from "@/lib/challenge/server";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "BCN Plant Scout Weekly Seed Giveaway", description: "Save 10 plants. Get entered. Win three free seed packs. No purchase necessary; free alternative email entry available. Coming soon.", robots: { index: false, follow: false } };
const faqs = [
  ["Do I need to buy anything?", "No. No purchase or paid subscription is required. Free email entry is available without downloading the app and has the same odds."],
  ["Do the ten records need to be different species?", "No. Save ten new plant records during the week. Different species are not required. Extra photos attached to one record still count as one saved plant."],
  ["Do I need to submit an app entry?", "No. When participation is active, reaching ten new saved records automatically qualifies your account. You can opt out in the Weekly Seed Giveaway card. Eligibility details still need confirmation."],
  ["Can I enter by both methods?", "One eligible entry per person per week across app and email methods. Using both does not improve your odds."],
  ["When are the drawings?", "Weekly periods close Sunday night Eastern Time. Drawings are Monday, October 26, November 2, November 9, and November 16, 2026."],
  ["Will my photos or locations be public?", "No. The giveaway counts saved record IDs and timestamps. It does not publish or copy your private photographs or GPS coordinates."],
  ["Can I enter right now?", "The giveaway starts October 19! We're testing our entry form before launch. Test submissions do not count as official entries or provide a chance to win."],
  ["What if my trial has ended?", "Existing app trials and subscriptions stay unchanged. Free website entry requires no purchase or app download."]
];
export default async function ChallengePage() {
  if (!pageVisible()) return <main className="container py-12"><h1 className="text-3xl font-black">Giveaway information is unavailable.</h1></main>;
  let active = false; try { await available(); active = Boolean(currentWeek(new Date())); } catch { /* Preview requires no database or secrets. */ }
  let previewEnabled = false; try { await previewReady(); previewEnabled = true; } catch { /* Fail closed unless preview storage, privacy and cleanup are ready. */ }
  const week = currentWeek(new Date());
  const seedExamples = (await getCatalogProducts()).filter(product => {
    const image = getPrimaryProductImage(product);
    return product.active && product.category === "Seeds" && product.productType !== "bundle"
      && product.price === 5.99 && product.inventory > 0
      && (!product.variations?.length || product.variations.some(variant => variant.price === 5.99 && variant.inventory > 0))
      && !image.isFallback && image.url !== DEFAULT_PRODUCT_IMAGE_URL;
  }).slice(0, 3);
  return <main id="giveaway-page" className="giveaway-page">
    <section className="bg-pine text-white"><div className="container grid gap-6 py-6 md:gap-10 md:py-20 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-widest text-sage md:text-sm">BCN Plant Scout Weekly Seed Giveaway</p>
        <h1 className="mt-3 text-4xl font-black leading-tight md:text-6xl"><span className="block text-[1.85rem] sm:text-5xl">4 Weeks. 4 Winners.</span><span className="block text-sage">Win Free Seeds!</span></h1>
        <p className="mt-3 font-bold md:mt-5 md:text-lg">October 19 – November 15, 2026</p>
        <p className="mt-3 max-w-xl leading-6 text-white/90 md:text-lg md:leading-7">Win 3 eligible seed packs of your choice — $17.97 retail value plus free standard domestic shipping.</p>
        <p className="mt-3 max-w-xl leading-6 text-white/90">Save 10 new plants in BCN Plant Scout during a giveaway week for a chance to win.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <a className="button min-h-12 w-full bg-white text-center text-pine hover:bg-sage" href="https://apps.apple.com/us/app/bcn-plant-scout/id6784878818">Download for iPhone</a>
          <a className="button min-h-12 w-full bg-white text-center text-pine hover:bg-sage" href="https://play.google.com/store/apps/details?id=com.basecampnorth.bcnplantscout">Download for Android</a>
          <a className="button min-h-12 w-full border border-white/60 text-center text-white hover:bg-white/10 sm:col-span-2" href="#free-entry">Free Email Entry — No App Required</a>
        </div>
        <p className="mt-3 text-sm leading-6">No purchase necessary. Both entry methods have equal drawing odds.</p>
        <div className="mt-4 rounded-md border border-white/20 bg-white/5 p-3 text-sm leading-6">
          <p className="font-bold text-sage">{active ? "Weekly entries are open" : "Giveaway starts October 19!"}</p>
          {!active ? <p>We're testing our entry form before launch. Test submissions do not count as official entries.</p> : null}
        </div>
        <nav aria-label="Giveaway sections" className="mt-3 flex flex-wrap gap-x-5 text-sm font-bold underline underline-offset-4"><a className="inline-flex min-h-11 items-center" href="#how-it-works">How it works</a><a className="inline-flex min-h-11 items-center" href="#schedule">Drawing dates</a><a className="inline-flex min-h-11 items-center" href="#free-entry">Free email entry</a></nav>
      </div>
      <div className="min-w-0 rounded-xl border border-white/20 bg-white/5 p-4 md:flex md:flex-col md:justify-center md:p-7"><p className="text-xs font-black uppercase tracking-widest text-sage">One winner every week</p><h2 className="mt-2 text-2xl font-black md:text-3xl">3 Seed Packs — $17.97 Value + Free Shipping</h2>
        <div className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:my-6">{seedExamples.map(product => { const image = getPrimaryProductImage(product); return <figure key={product.id} className="min-w-0 overflow-hidden rounded-md border border-white/25 bg-parchment text-pine last:col-span-2 last:mx-auto last:w-[calc(50%-6px)] sm:last:col-span-1 sm:last:mx-0 sm:last:w-auto"><div className="relative aspect-square"><Image src={image.url} alt={image.altText} fill sizes="(min-width: 1024px) 150px, (min-width: 640px) 30vw, 45vw" className="object-cover" /></div><figcaption className="break-words px-2 py-2 text-center text-sm font-bold leading-5">{product.commonName || product.name}</figcaption></figure>; })}</div>
        <p className="leading-6">Choose three eligible packs. Standard domestic shipping is included.</p>
        <a className="button mt-4 min-h-12 w-full bg-white text-center text-pine hover:bg-sage" href="https://basecampnorthpa.com/shop">Browse the Seeds You Could Win</a>
        <p className="mt-4 text-sm leading-6 text-white/85">Prizes are limited to eligible, in-stock standard $5.99 seed packs. Bundles, larger packs, plants and other shop products do not qualify. Photos show examples from the BCN catalog; availability and final eligibility apply.</p><p className="mt-3 text-sm text-sage">Four weekly prizes · October 19–November 15, 2026</p>
      </div>
    </div></section>
    <div className="container max-w-5xl py-7 md:py-12">
      <section id="how-it-works"><p className="text-xs font-black uppercase tracking-widest text-pine">Simple steps. More time outside.</p><h2 className="mt-3 text-3xl font-black text-pine">Your weekly nature habit could win seeds.</h2>
        <div className="mt-4 grid gap-3 md:mt-6 md:grid-cols-3">{[["01", "Save 10 new plants", "Create ten new records during the week. Repeated species count; extra photos of one record do not."], ["02", "Qualify automatically", "During an active week, ten saves qualify automatically. No separate app entry button. Confirm eligibility; opt out anytime."], ["03", "Choose your seed packs", "One winner each Monday chooses three eligible seed packs, with free standard domestic shipping."]].map(([n,title,text]) => <article key={n} className="field-card grid grid-cols-[2rem_1fr] gap-x-3 p-4 md:block md:p-6"><p className="text-2xl font-black text-rust md:text-3xl">{n}</p><div><h3 className="text-lg font-black text-pine md:mt-3 md:text-xl">{title}</h3><p className="mt-2 leading-6 text-ink/80 md:mt-3 md:leading-7">{text}</p></div></article>)}</div>
      </section>
      <section className="my-10 rounded-lg bg-sage/60 p-6 md:p-8"><h2 className="text-2xl font-black text-pine">Bring Plant Scout on your next walk.</h2><p className="mt-3 text-ink/75">Record plants, explore nature, and follow your weekly progress. Downloading the app is optional for the giveaway.</p><div className="mt-5 flex flex-wrap gap-3"><a className="button button-primary" href="https://apps.apple.com/us/app/bcn-plant-scout/id6784878818">Download for iPhone</a><a className="button button-secondary" href="https://play.google.com/store/apps/details?id=com.basecampnorth.bcnplantscout">Download for Android</a></div></section>
      <section id="schedule" className="scroll-mt-4"><h2 className="text-2xl font-black text-pine md:text-3xl">4 Weeks • 4 Winners • 12 Seed Packs</h2><p className="mt-2 text-sm font-bold text-pine">Four Monday drawings. All dates and deadlines are Eastern Time.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 md:hidden">{WEEKS.map((w,i) => <article key={w.id} className="field-card p-4"><h3 className="font-black text-pine">Week {w.id} · {w.label}</h3><p className="mt-1 text-sm">Drawing: Monday, {DRAWINGS[i]}, 2026</p></article>)}</div>
        <div className="mt-5 hidden md:block"><table className="w-full text-left"><caption className="sr-only">2026 weekly entry periods and Monday drawing dates, Eastern Time</caption><thead><tr className="border-b border-pine/20"><th scope="col" className="p-3">Week</th><th scope="col" className="p-3">Save / enter during</th><th scope="col" className="p-3">Drawing</th></tr></thead><tbody>{WEEKS.map((w,i) => <tr key={w.id} className="border-b border-pine/10"><th scope="row" className="p-3">{w.id}</th><td className="p-3">{w.label}, 2026</td><td className="p-3">Monday, {DRAWINGS[i]}, 2026</td></tr>)}</tbody></table></div><p className="mt-4 text-sm leading-6 text-ink/75">Weeks open Monday at 12:00 a.m. and close Sunday at 11:59:59 p.m. Eastern Time. New app records must sync before the weekly cutoff. The final November 15 entry period is drawn November 16.</p></section>
      {active ? <ChallengeEntryForm week={week?.id ?? 1} siteKey={process.env.NEXT_PUBLIC_SCOUT_CHALLENGE_TURNSTILE_SITE_KEY ?? ""} /> : <ChallengePreviewForm enabled={previewEnabled} />}
      <section id="rules" className="mt-12"><h2 className="text-3xl font-black text-pine">Official rules — review draft</h2><p className="mt-4 rounded-md bg-parchment p-4 font-bold">The public preview form is for testing only, not an invitation to enter the official giveaway. Final contest rules and privacy terms require review before official launch.</p>
        <ul className="mt-5 list-disc space-y-3 pl-6 text-ink/80"><li>Proposed eligibility: age 18+, residing in the 50 U.S. states or D.C., subject to final reviewed exclusions.</li><li>No purchase or subscription required. One eligible entry per person per week across both methods, with equal drawing odds.</li><li>App method: ten new saved plant records during the week qualify automatically, with opt-out available. Species need not differ; multiple photos on one record count once. Eligibility confirmation and duplicate-person review apply.</li><li>Alternative method: free verified-email entry using this website. No app, photos, payment, or subscription required.</li><li>Each weekly winner chooses three eligible, in-stock seed packs with standard domestic shipping included. No payment to claim the prize. Odds depend on the number of eligible entries.</li><li>Sponsor legal details, prize value/list, seed shipping restrictions, response deadlines, alternate-winner handling, retention and other terms are being reviewed. Apple and Google do not sponsor this promotion.</li></ul>
        {process.env.SCOUT_CHALLENGE_RULES_URL ? <p className="mt-4"><a className="underline" href={process.env.SCOUT_CHALLENGE_RULES_URL}>Read reviewed full rules</a></p> : null}
      </section>
      <section id="privacy" className="mt-10"><h2 className="text-3xl font-black text-pine">Your field records stay private.</h2><p className="mt-4 leading-7 text-ink/75">The giveaway uses record IDs and timestamps to count new saved plants, plus name, email, state and eligibility details to administer entries. It does not copy or publicly share your private plant photographs or GPS coordinates. App users can opt out of automatic participation. No automatic marketing opt-in.</p><p className="mt-3 leading-7 text-ink/75">Free entry uses email verification and bot protection when active. Access is restricted to authorized administrators. Retention and deletion procedures will be finalized before launch. This public preview creates no official contest entries. See the test form above for its separate privacy and deletion disclosure.</p><p className="mt-4"><a className="underline" href="https://scout.basecampnorthpa.com/privacy-policy">BCN Privacy Policy</a> · <a className="underline" href="/contact">Questions? Contact BCN</a></p></section>
      <section className="mt-12"><h2 className="text-3xl font-black text-pine">A few things to know</h2><div className="mt-5 grid gap-3">{faqs.map(([q,a]) => <details key={q} className="field-card p-5"><summary className="cursor-pointer font-bold text-pine">{q}</summary><p className="mt-3 leading-7 text-ink/75">{a}</p></details>)}</div></section>
      <p className="mt-10"><a className="button button-primary" href="https://basecampnorthpa.com/shop">Browse BCN Seeds</a></p>
    </div>
  </main>;
}

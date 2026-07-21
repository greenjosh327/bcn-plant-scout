export function SectionHeading({
  eyebrow,
  title,
  children,
  as: Heading = "h2"
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
  as?: "h1" | "h2";
}) {
  return (
    <div className="mb-8 max-w-3xl">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-stone">{eyebrow}</p>
      <Heading className="mt-3 text-4xl font-black tracking-tight text-pine md:text-5xl">{title}</Heading>
      {children ? <p className="mt-4 text-lg leading-8 text-ink/72">{children}</p> : null}
    </div>
  );
}

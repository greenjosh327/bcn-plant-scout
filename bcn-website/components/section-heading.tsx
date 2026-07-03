export function SectionHeading({
  eyebrow,
  title,
  children
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-8 max-w-3xl">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-stone">{eyebrow}</p>
      <h2 className="mt-3 text-4xl font-black tracking-tight text-pine md:text-5xl">{title}</h2>
      {children ? <p className="mt-4 text-lg leading-8 text-ink/72">{children}</p> : null}
    </div>
  );
}

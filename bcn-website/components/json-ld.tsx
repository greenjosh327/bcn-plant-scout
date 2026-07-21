import { serializeJsonLd, type JsonLdInput } from "@/lib/structured-data";

export function JsonLd({ data }: { data: JsonLdInput | null }) {
  if (!data) return null;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}

from __future__ import annotations

import csv
import html
import json
import re
from collections import defaultdict
from html.parser import HTMLParser
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SQUARE_CSV = Path(r"C:\Users\green\Downloads\MLPXB0KH69RQW_catalog-2026-07-03-0207.csv")
ETSY_CSV = Path(r"C:\Users\green\Downloads\EtsyListingsDownload.csv")
OUTPUT_TS = ROOT / "lib" / "imported-products.ts"
SUMMARY_MD = ROOT / "imports" / "catalog-import-summary.md"
SEED_SQL = ROOT / "supabase" / "sql" / "20260703_bcn_catalog_seed.sql"


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        if data.strip():
            self.parts.append(data.strip())

    def text(self) -> str:
        return " ".join(self.parts)


def html_to_text(value: str) -> str:
    parser = TextExtractor()
    parser.feed(value or "")
    return clean_text(parser.text())


def clean_text(value: str) -> str:
    value = html.unescape(value or "").replace("\xa0", " ").strip()
    if any(marker in value for marker in ("Ã", "â", "ð")):
        try:
            repaired = value.encode("cp1252").decode("utf-8")
            if sum(marker in repaired for marker in ("Ã", "â", "ð")) < sum(marker in value for marker in ("Ã", "â", "ð")):
                value = repaired
        except UnicodeError:
            pass
    value = re.sub(r"\s+", " ", value)
    return value


def slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "product"


def money(value: str) -> float:
    try:
        return round(float((value or "0").replace("$", "").strip()), 2)
    except ValueError:
        return 0.0


def quantity(value: str) -> int:
    try:
        return int(float((value or "0").strip()))
    except ValueError:
        return 0


def truthy(value: str) -> bool:
    return (value or "").strip().upper() in {"Y", "YES", "TRUE", "1"}


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def best_category(raw: str, name: str) -> str:
    haystack = f"{raw} {name}".lower()
    if "cutting" in haystack:
        return "Cuttings"
    if any(word in haystack for word in ["tree", "plant", "bareroot", "bare root", "starter", "starts"]):
        return "Plants"
    return "Seeds"


def image_for(product: dict[str, Any]) -> list[str]:
    haystack = f"{product['name']} {' '.join(product['tags'])}".lower()
    if "elderberry" in haystack:
        return ["/images/scout-elderberry.webp", "/images/scout-berry-branch.webp"]
    if "chestnut" in haystack:
        return ["/images/scout-chestnut.webp", "/images/scout-nut-pile.webp"]
    if "crabapple" in haystack or "apple" in haystack:
        return ["/images/scout-crabapple.webp", "/images/scout-berry-branch.webp"]
    if "fig" in haystack:
        return ["/images/scout-fig.webp", "/images/scout-cuttings-bundle.webp"]
    if "grape" in haystack:
        return ["/images/scout-grape.webp", "/images/scout-berry-branch.webp"]
    if "locust" in haystack:
        return ["/images/scout-honey-locust.webp", "/images/scout-seedling-tray.webp"]
    if "cutting" in haystack:
        return ["/images/scout-cuttings-bundle.webp", "/images/scout-field-kit.webp"]
    if product["category"] == "Plants":
        return ["/images/scout-bare-root-seedling.webp", "/images/scout-seedling-tray.webp"]
    return ["/images/scout-nut-pile.webp", "/images/scout-evergreen-cones.webp"]


def extract_scientific_name(name: str) -> str:
    match = re.search(r"\(([^)]+)\)", name)
    if match:
        return match.group(1).strip()
    return "See description"


def extract_common_name(name: str) -> str:
    name = re.sub(r"\([^)]*\)", "", name)
    name = re.sub(r"\s[-–].*$", "", name)
    name = re.sub(r"\b(seeds?|cuttings?|bareroot|bare root|pre-order|starter tree|tree|plants?)\b", "", name, flags=re.I)
    return clean_text(name).strip(" -–") or name


def etsy_lookup(rows: list[dict[str, str]]) -> dict[str, dict[str, str]]:
    lookup: dict[str, dict[str, str]] = {}
    for row in rows:
        title = clean_text(row.get("TITLE", ""))
        key = slugify(re.sub(r"\bseeds?\b.*$", "", title, flags=re.I))
        lookup[key] = row
    return lookup


def tags_from(*values: str) -> list[str]:
    tags: list[str] = []
    for value in values:
        for piece in re.split(r"[,|;/]+", value or ""):
            tag = clean_text(piece).lower()
            if tag and tag not in tags:
                tags.append(tag)
    return tags[:12]


def build_products(square_rows: list[dict[str, str]], etsy_rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    etsy = etsy_lookup(etsy_rows)
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in square_rows:
        name = clean_text(row.get("Item Name", ""))
        if not name:
            continue
        grouped[name].append(row)

    products: list[dict[str, Any]] = []
    for index, (name, rows) in enumerate(grouped.items()):
        first = rows[0]
        category = best_category(first.get("Categories", ""), name)
        permalink = next((clean_text(row.get("Permalink", "")) for row in rows if clean_text(row.get("Permalink", ""))), "")
        slug = slugify(permalink or name)
        prices = [money(row.get("Price", "")) or money(row.get("Price Base Camp North", "")) for row in rows]
        prices = [price for price in prices if price > 0]
        variations = []
        for row in rows:
            variation_price = money(row.get("Price", "")) or money(row.get("Price Base Camp North", ""))
            variations.append(
                {
                    "name": clean_text(row.get("Variation Name", "")) or "Regular",
                    "sku": clean_text(row.get("SKU", "")),
                    "price": variation_price,
                    "inventory": quantity(row.get("Current Quantity Base Camp North", "")),
                }
            )

        inventory = sum(max(0, variation["inventory"]) for variation in variations)
        description = html_to_text(first.get("Description", ""))
        etsy_key = slugify(re.sub(r"\bseeds?\b.*$", "", name, flags=re.I))
        etsy_row = etsy.get(etsy_key, {})
        tags = tags_from(first.get("Categories", ""), first.get("Reporting Category", ""), etsy_row.get("TAGS", ""), name)
        product: dict[str, Any] = {
            "id": f"prod_{slug}",
            "slug": slug,
            "name": name,
            "scientificName": extract_scientific_name(name),
            "commonName": extract_common_name(name),
            "category": category,
            "description": description or "Seasonal Base Camp North nursery item. More growing details coming soon.",
            "price": min(prices) if prices else 0,
            "inventory": inventory,
            "featured": index < 9,
            "active": not truthy(first.get("Archived", "")) and any(row.get("Sellable", "Y") != "N" for row in rows),
            "images": [],
            "plantType": f"{category[:-1] if category.endswith('s') else category} nursery item",
            "nativeStatus": "",
            "hardinessZones": "",
            "sunlight": "",
            "soil": "",
            "height": "",
            "spread": "",
            "bloomTime": "",
            "wildlifeBenefits": "",
            "pollinatorBenefits": "",
            "hostSpecies": "",
            "plantingInstructions": "",
            "shippingNotes": "",
            "growingNotes": description[:420] + ("..." if len(description) > 420 else ""),
            "localPickup": any(truthy(row.get("Pickup Enabled", "")) for row in rows),
            "ships": any(truthy(row.get("Shipping Enabled", "")) for row in rows),
            "tags": tags,
            "variations": variations,
            "source": "square",
            "createdAt": "2026-07-03",
            "updatedAt": "2026-07-03",
        }
        product["images"] = image_for(product)
        products.append(product)

    products.sort(key=lambda item: (item["category"], item["name"]))
    return products


def write_typescript(products: list[dict[str, Any]]) -> None:
    payload = json.dumps(products, ensure_ascii=False, indent=2)
    OUTPUT_TS.write_text(
        "import type { Product } from \"./types\";\n\n"
        "// Generated by scripts/import_catalog.py from Square/Squarespace and Etsy CSV exports.\n"
        "// Re-run the importer when the source catalog changes.\n"
        f"export const importedProducts = {payload} satisfies Product[];\n",
        encoding="utf-8",
    )


def write_summary(square_rows: list[dict[str, str]], etsy_rows: list[dict[str, str]], products: list[dict[str, Any]]) -> None:
    SUMMARY_MD.parent.mkdir(parents=True, exist_ok=True)
    active = sum(1 for product in products if product["active"])
    variation_count = sum(len(product.get("variations", [])) for product in products)
    SUMMARY_MD.write_text(
        "\n".join(
            [
                "# Catalog Import Summary",
                "",
                f"- Square/Squarespace rows read: {len(square_rows)}",
                f"- Etsy rows read: {len(etsy_rows)}",
                f"- Website products generated: {len(products)}",
                f"- Active products: {active}",
                f"- Variations generated: {variation_count}",
                "",
                "Square/Squarespace is treated as the source of truth for names, prices, inventory, categories, descriptions, and variations.",
                "Etsy is currently used as a supplemental source for tags where names match cleanly.",
                "",
                "Next polish: add exact product photos per item, then move this generated catalog into the database/admin workflow.",
            ]
        )
        + "\n",
        encoding="utf-8",
    )


def sql_string(value: Any) -> str:
    if value is None:
        return "null"
    return "'" + str(value).replace("'", "''") + "'"


def sql_bool(value: bool) -> str:
    return "true" if value else "false"


def sql_array(values: list[str]) -> str:
    if not values:
        return "'{}'"
    return "array[" + ", ".join(sql_string(value) for value in values) + "]::text[]"


def write_seed_sql(products: list[dict[str, Any]]) -> None:
    SEED_SQL.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "-- Generated by scripts/import_catalog.py from Square/Squarespace and Etsy CSV exports.",
        "-- Run after 20260703_bcn_catalog_schema.sql.",
        "begin;",
        "",
    ]
    for product in products:
        lines.append(
            "insert into public.products ("
            "id, slug, name, scientific_name, common_name, category, description, price, inventory, featured, active, "
            "plant_type, native_status, hardiness_zones, sunlight, soil, height, spread, bloom_time, wildlife_benefits, "
            "pollinator_benefits, host_species, planting_instructions, shipping_notes, growing_notes, local_pickup, ships, tags, source, created_at, updated_at"
            ") values ("
            + ", ".join(
                [
                    sql_string(product["id"]),
                    sql_string(product["slug"]),
                    sql_string(product["name"]),
                    sql_string(product["scientificName"]),
                    sql_string(product["commonName"]),
                    sql_string(product["category"]),
                    sql_string(product["description"]),
                    str(product["price"]),
                    str(product["inventory"]),
                    sql_bool(product["featured"]),
                    sql_bool(product["active"]),
                    sql_string(product["plantType"]),
                    sql_string(product["nativeStatus"]),
                    sql_string(product["hardinessZones"]),
                    sql_string(product["sunlight"]),
                    sql_string(product["soil"]),
                    sql_string(product["height"]),
                    sql_string(product["spread"]),
                    sql_string(product["bloomTime"]),
                    sql_string(product["wildlifeBenefits"]),
                    sql_string(product["pollinatorBenefits"]),
                    sql_string(product["hostSpecies"]),
                    sql_string(product["plantingInstructions"]),
                    sql_string(product["shippingNotes"]),
                    sql_string(product["growingNotes"]),
                    sql_bool(product["localPickup"]),
                    sql_bool(product["ships"]),
                    sql_array(product["tags"]),
                    sql_string(product["source"]),
                    sql_string(product["createdAt"]),
                    sql_string(product["updatedAt"]),
                ]
            )
            + ") on conflict (id) do update set "
            "slug = excluded.slug, name = excluded.name, scientific_name = excluded.scientific_name, common_name = excluded.common_name, "
            "category = excluded.category, description = excluded.description, price = excluded.price, inventory = excluded.inventory, "
            "featured = excluded.featured, active = excluded.active, plant_type = excluded.plant_type, native_status = excluded.native_status, "
            "hardiness_zones = excluded.hardiness_zones, sunlight = excluded.sunlight, soil = excluded.soil, height = excluded.height, "
            "spread = excluded.spread, bloom_time = excluded.bloom_time, wildlife_benefits = excluded.wildlife_benefits, "
            "pollinator_benefits = excluded.pollinator_benefits, host_species = excluded.host_species, planting_instructions = excluded.planting_instructions, shipping_notes = excluded.shipping_notes, "
            "growing_notes = excluded.growing_notes, local_pickup = excluded.local_pickup, ships = excluded.ships, tags = excluded.tags, "
            "source = excluded.source, updated_at = excluded.updated_at;"
        )
        for order, image in enumerate(product["images"]):
            image_id = f"{product['id']}_image_{order + 1}"
            lines.append(
                "insert into public.product_images (id, product_id, public_url, alt_text, sort_order, is_primary) values ("
                + ", ".join(
                    [
                        sql_string(image_id),
                        sql_string(product["id"]),
                        sql_string(image),
                        sql_string(product["name"]),
                        str(order),
                        sql_bool(order == 0),
                    ]
                )
                + ") on conflict (id) do update set public_url = excluded.public_url, alt_text = excluded.alt_text, "
                "sort_order = excluded.sort_order, is_primary = excluded.is_primary;"
            )
        for index, variation in enumerate(product.get("variations", [])):
            variant_id = f"{product['id']}_variant_{index + 1}"
            lines.append(
                "insert into public.product_variants (id, product_id, name, sku, price, inventory, active) values ("
                + ", ".join(
                    [
                        sql_string(variant_id),
                        sql_string(product["id"]),
                        sql_string(variation["name"]),
                        sql_string(variation["sku"]),
                        str(variation["price"]),
                        str(variation["inventory"]),
                        sql_bool(True),
                    ]
                )
                + ") on conflict (id) do update set name = excluded.name, sku = excluded.sku, price = excluded.price, "
                "inventory = excluded.inventory, active = excluded.active;"
            )
        lines.append("")
    lines.extend(["commit;", ""])
    SEED_SQL.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    square_rows = read_csv(SQUARE_CSV)
    etsy_rows = read_csv(ETSY_CSV)
    products = build_products(square_rows, etsy_rows)
    write_typescript(products)
    write_summary(square_rows, etsy_rows, products)
    write_seed_sql(products)
    print(f"Generated {len(products)} products from {len(square_rows)} Square rows and {len(etsy_rows)} Etsy rows.")
    print(f"Wrote {OUTPUT_TS}")
    print(f"Wrote {SUMMARY_MD}")
    print(f"Wrote {SEED_SQL}")


if __name__ == "__main__":
    main()

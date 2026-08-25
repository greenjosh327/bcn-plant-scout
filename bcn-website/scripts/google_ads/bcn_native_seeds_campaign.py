from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import html.parser
import json
import os
import sys
import textwrap
import urllib.request
from pathlib import Path
from typing import Iterable

from google.api_core import protobuf_helpers
from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException


CUSTOMER_ID = "7759794615"
CAMPAIGN_ID = 24184686637
CAMPAIGN_NAME = "BCN | Native Seeds | Search"

LANDING_PAGES = {
    "Native Tree & Shrub Seeds": "https://shop.basecampnorthpa.com/shop/product/pennsylvania-native-tree-shrub-seed-collection",
    "Wildlife Habitat Seeds": "https://shop.basecampnorthpa.com/shop/product/wildlife-habitat-seed-collection",
    "Native Berry Food Forest": "https://shop.basecampnorthpa.com/shop/product/native-berry-food-forest-seed-collection",
    "Individual Species": "https://shop.basecampnorthpa.com/shop?category=Seeds",
}

EXPECTED_AD_GROUPS = {
    "Native Tree & Shrub Seeds",
    "Wildlife Habitat Seeds",
    "Native Berry Food Forest",
    "Individual Species",
}

INTENDED_KEYWORDS = {
    "Native Tree & Shrub Seeds": [
        "native tree seeds for sale",
        "native shrub seeds for sale",
        "Pennsylvania native seeds",
        "PA native plant seeds",
        "native woody plant seeds",
        "native tree seed collection",
    ],
    "Wildlife Habitat Seeds": [
        "wildlife habitat seeds",
        "native seeds for wildlife",
        "wildlife tree seeds",
        "native shrubs for wildlife",
        "seeds for bird habitat",
        "wildlife food plot tree seeds",
        "native habitat seed collection",
    ],
    "Native Berry Food Forest": [
        "native berry seeds",
        "food forest seeds",
        "native edible plant seeds",
        "native berry shrubs",
        "berry shrub seeds",
        "food forest seed collection",
    ],
    "Individual Species": [
        "black huckleberry seeds",
        "Gaylussacia baccata seeds",
        "black chokeberry seeds",
        "Aronia melanocarpa seeds",
        "black cherry seeds",
        "Prunus serotina seeds",
        "staghorn sumac seeds",
        "Rhus typhina seeds",
        "red elderberry seeds",
        "Sambucus racemosa seeds",
        "beach plum seeds",
        "Prunus maritima seeds",
    ],
}

EXPECTED_NEGATIVES = {
    "free",
    "recipe",
    "jam recipe",
    "jelly recipe",
    "identification",
    "identify",
    "pictures",
    "images",
    "clipart",
    "tattoo",
    "artificial",
    "plastic",
    "Minecraft",
}


@dataclasses.dataclass(frozen=True)
class KeywordRow:
    ad_group_id: int
    ad_group_name: str
    criterion_id: int
    resource_name: str
    text: str
    match_type: str
    status: str
    negative: bool


class Log:
    def __init__(self, command: str) -> None:
        timestamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        self.path = Path(__file__).with_name("logs") / f"{timestamp}-{command}.log"
        self.path.parent.mkdir(exist_ok=True)

    def write(self, message: str = "") -> None:
        print(message)
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(message + "\n")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Manage the BCN Native Seeds Google Ads campaign safely.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("audit", help="Read-only campaign audit.")
    subparsers.add_parser("validate", help="Read-only pre-launch validation.")

    pause_parser = subparsers.add_parser("pause-broad", help="Pause enabled broad-match keywords in the target campaign.")
    pause_parser.add_argument("--execute", action="store_true", help="Actually apply the pause operations. Omit for dry run.")

    args = parser.parse_args(argv)
    log = Log(args.command)

    try:
        client = load_client()
        if args.command == "audit":
            audit(client, log)
        elif args.command == "validate":
            validate(client, log)
        elif args.command == "pause-broad":
            pause_broad(client, log, execute=args.execute)
        log.write("")
        log.write(f"Log written to {log.path}")
        return 0
    except GoogleAdsException as ex:
        log.write("Google Ads API request failed.")
        for error in ex.failure.errors:
            log.write(f"- {error.error_code}: {error.message}")
        log.write(f"Request ID: {ex.request_id}")
        return 2
    except Exception as ex:
        log.write(f"Error: {ex}")
        return 1


def load_client() -> GoogleAdsClient:
    local_yaml = Path(__file__).with_name("google-ads.yaml")
    if local_yaml.exists():
        return GoogleAdsClient.load_from_storage(str(local_yaml), version=None)
    required_env = [
        "GOOGLE_ADS_DEVELOPER_TOKEN",
        "GOOGLE_ADS_CLIENT_ID",
        "GOOGLE_ADS_CLIENT_SECRET",
        "GOOGLE_ADS_REFRESH_TOKEN",
        "GOOGLE_ADS_USE_PROTO_PLUS",
    ]
    missing = [name for name in required_env if not os.environ.get(name)]
    if missing:
        raise RuntimeError(
            "Google Ads API credentials are not configured. Copy "
            f"{Path(__file__).with_name('google-ads.example.yaml')} to "
            f"{Path(__file__).with_name('google-ads.yaml')} and fill it locally, "
            "or set the required GOOGLE_ADS_* environment variables. Missing: "
            + ", ".join(missing)
        )
    return GoogleAdsClient.load_from_env(version=None)


def audit(client: GoogleAdsClient, log: Log) -> dict:
    log.write("READ-ONLY AUDIT")
    log.write(f"Customer: {CUSTOMER_ID}")
    log.write(f"Campaign: {CAMPAIGN_ID} / {CAMPAIGN_NAME}")
    log.write("")

    campaign = require_target_campaign(client, log)
    ad_groups = fetch_ad_groups(client)
    keywords = fetch_keywords(client)
    negatives = fetch_campaign_negative_keywords(client)
    ads = fetch_responsive_search_ads(client)
    location_criteria = safe_fetch("location criteria", log, lambda: fetch_location_criteria(client))
    conversions = safe_fetch("conversion actions", log, lambda: fetch_conversion_actions(client))
    customer_goals = safe_fetch("customer conversion goals", log, lambda: fetch_customer_conversion_goals(client))
    assets = safe_fetch("campaign assets", log, lambda: fetch_campaign_assets(client))

    print_campaign_summary(log, campaign)
    print_ad_groups(log, ad_groups)
    print_keywords(log, keywords)
    print_negatives(log, negatives)
    print_ads(log, ads)

    if location_criteria is not None:
        log.write("")
        log.write("Location criteria:")
        for row in location_criteria:
            log.write(f"- criterion={row['criterion_id']} geo={row['geo_target_constant']} negative={row['negative']} status={row['status']}")

    if conversions is not None:
        log.write("")
        log.write("Conversion actions:")
        for row in conversions:
            log.write(
                f"- {row['name']} | category={row['category']} | type={row['type']} | "
                f"status={row['status']} | primary={row['primary_for_goal']} | include={row['include_in_conversions_metric']}"
            )

    if customer_goals is not None:
        log.write("")
        log.write("Customer conversion goals:")
        for row in customer_goals:
            log.write(f"- category={row['category']} | origin={row['origin']} | biddable={row['biddable']}")

    if assets is not None:
        log.write("")
        log.write("Campaign assets:")
        if not assets:
            log.write("- none returned")
        for row in assets:
            log.write(f"- {row['field_type']} | status={row['status']} | label={row['label']}")

    return {
        "campaign": campaign,
        "ad_groups": ad_groups,
        "keywords": keywords,
        "negatives": negatives,
        "ads": ads,
        "conversions": conversions or [],
        "customer_goals": customer_goals or [],
    }


def validate(client: GoogleAdsClient, log: Log) -> None:
    data = audit(client, log)
    campaign = data["campaign"]
    ad_groups = data["ad_groups"]
    keywords = data["keywords"]
    negatives = data["negatives"]
    ads = data["ads"]
    conversions = data["conversions"]
    customer_goals = data["customer_goals"]

    log.write("")
    log.write("VALIDATION")

    checks: list[tuple[str, bool, str]] = []
    checks.append(("campaign name matches", campaign["name"] == CAMPAIGN_NAME, campaign["name"]))
    checks.append(("campaign type is Search", campaign["advertising_channel_type"] == "SEARCH", campaign["advertising_channel_type"]))
    checks.append(("daily budget is exactly $5/day", campaign["budget_micros"] == 5_000_000, micros_to_usd(campaign["budget_micros"])))
    checks.append(("bidding is Maximize Clicks", campaign["bidding_strategy_type"] == "MAXIMIZE_CLICKS", campaign["bidding_strategy_type"]))
    checks.append(("Google Search enabled", campaign["target_google_search"] is True, str(campaign["target_google_search"])))
    checks.append(("Search Partners off", campaign["target_partner_search_network"] is False, str(campaign["target_partner_search_network"])))
    checks.append(("Display expansion off", campaign["target_content_network"] is False, str(campaign["target_content_network"])))
    checks.append(("U.S. Presence targeting", campaign["positive_geo_target_type"] == "PRESENCE", campaign["positive_geo_target_type"]))

    found_ad_groups = {row["name"] for row in ad_groups}
    checks.append(("four expected ad groups present", EXPECTED_AD_GROUPS.issubset(found_ad_groups), ", ".join(sorted(found_ad_groups))))

    enabled_broad = [kw for kw in keywords if kw.status == "ENABLED" and kw.match_type == "BROAD" and not kw.negative]
    checks.append(("no enabled Broad keywords", not enabled_broad, str(len(enabled_broad))))

    enabled_keyword_lookup = {
        (kw.ad_group_name, normalize_keyword(kw.text), kw.match_type)
        for kw in keywords
        if kw.status == "ENABLED" and not kw.negative
    }
    missing_keywords = []
    for ad_group_name, terms in INTENDED_KEYWORDS.items():
        for term in terms:
            normalized = normalize_keyword(term)
            has_exact = (ad_group_name, normalized, "EXACT") in enabled_keyword_lookup
            has_phrase = (ad_group_name, normalized, "PHRASE") in enabled_keyword_lookup
            if not has_exact and not has_phrase:
                missing_keywords.append(f"{ad_group_name}: {term}")
    checks.append(("intended Exact/Phrase keywords covered", not missing_keywords, f"{len(missing_keywords)} missing"))

    negative_texts = {normalize_keyword(row["text"]) for row in negatives if row["status"] == "ENABLED"}
    missing_negatives = sorted(term for term in EXPECTED_NEGATIVES if normalize_keyword(term) not in negative_texts)
    checks.append(("required campaign negatives present", not missing_negatives, f"{len(missing_negatives)} missing"))

    purchase_actions = [
        row for row in conversions
        if row["status"] == "ENABLED" and ("purchase" in row["name"].lower() or row["category"] == "PURCHASE")
    ]
    primary_purchase_actions = [row for row in purchase_actions if row["primary_for_goal"]]
    biddable_purchase_goals = [row for row in customer_goals if row["category"] == "PURCHASE" and row["biddable"]]
    checks.append(("Purchase conversion action exists", bool(purchase_actions), f"{len(purchase_actions)} purchase-like actions"))
    checks.append(
        ("Purchase is primary or biddable goal",
         bool(primary_purchase_actions or biddable_purchase_goals),
         f"primary actions={len(primary_purchase_actions)}, biddable goals={len(biddable_purchase_goals)}"),
    )

    ads_with_policy_issues = [ad for ad in ads if ad["approval_status"] not in {"APPROVED", "APPROVED_LIMITED", "UNKNOWN"}]
    checks.append(("no major RSA policy disapprovals", not ads_with_policy_issues, f"{len(ads_with_policy_issues)} issue(s)"))

    landing_results = check_landing_pages()
    for result in landing_results:
        checks.append((f"landing page OK: {result['ad_group']}", result["ok"], result["detail"]))

    for label, ok, detail in checks:
        marker = "PASS" if ok else "FAIL"
        log.write(f"{marker}: {label} ({detail})")

    if missing_keywords:
        log.write("")
        log.write("Missing intended keywords. Do not add automatically; review first:")
        for item in missing_keywords:
            log.write(f"- {item}")

    if missing_negatives:
        log.write("")
        log.write("Missing campaign-level negatives. Do not add automatically; review first:")
        for item in missing_negatives:
            log.write(f"- {item}")

    if enabled_broad:
        log.write("")
        log.write("Enabled Broad keywords still present:")
        for kw in enabled_broad:
            log.write(f"- {kw.ad_group_name}: {kw.text}")

    log.write("")
    if all(ok for _, ok, _ in checks):
        log.write("FINAL CHECKLIST PASSED. Do not enable yet. Ask: Enable BCN | Native Seeds | Search at $5/day?")
    else:
        log.write("FINAL CHECKLIST FAILED. Do not enable the campaign.")


def pause_broad(client: GoogleAdsClient, log: Log, execute: bool) -> None:
    require_target_campaign(client, log)
    broad_keywords = [
        kw for kw in fetch_keywords(client)
        if kw.status == "ENABLED" and kw.match_type == "BROAD" and not kw.negative
    ]

    log.write("BROAD KEYWORD CLEANUP")
    log.write(f"Mode: {'EXECUTE' if execute else 'DRY RUN'}")
    log.write("")

    if not broad_keywords:
        log.write("No enabled Broad keywords found in the target campaign.")
        return

    log.write("Before changing anything, proposed actions are:")
    for kw in broad_keywords:
        log.write(f"- ad_group={kw.ad_group_name} | keyword={kw.text} | current_match_type={kw.match_type} | proposed_action=PAUSE")

    if not execute:
        log.write("")
        log.write("Dry run only. Re-run with --execute to pause these Broad keywords.")
        return

    log.write("")
    log.write("Executing mutation: pause only the enabled Broad keyword criteria listed above.")
    operations = []
    for kw in broad_keywords:
        operation = client.get_type("AdGroupCriterionOperation")
        criterion = operation.update
        criterion.resource_name = kw.resource_name
        criterion.status = client.enums.AdGroupCriterionStatusEnum.PAUSED
        client.copy_from(operation.update_mask, protobuf_helpers.field_mask(None, criterion._pb))
        operations.append(operation)

    service = client.get_service("AdGroupCriterionService")
    response = service.mutate_ad_group_criteria(customer_id=CUSTOMER_ID, operations=operations)
    for result in response.results:
        log.write(f"Paused {result.resource_name}")

    enabled_broad_after = [
        kw for kw in fetch_keywords(client)
        if kw.status == "ENABLED" and kw.match_type == "BROAD" and not kw.negative
    ]
    log.write("")
    log.write(f"Post-change verification: enabled Broad keywords remaining = {len(enabled_broad_after)}")
    if enabled_broad_after:
        for kw in enabled_broad_after:
            log.write(f"- {kw.ad_group_name}: {kw.text}")
        raise RuntimeError("Broad keyword cleanup did not fully verify.")


def require_target_campaign(client: GoogleAdsClient, log: Log) -> dict:
    rows = search(client, f"""
        SELECT
          campaign.id,
          campaign.name,
          campaign.status,
          campaign.advertising_channel_type,
          campaign.bidding_strategy_type,
          campaign_budget.amount_micros,
          campaign.network_settings.target_google_search,
          campaign.network_settings.target_search_network,
          campaign.network_settings.target_content_network,
          campaign.network_settings.target_partner_search_network,
          campaign.geo_target_type_setting.positive_geo_target_type,
          campaign.geo_target_type_setting.negative_geo_target_type
        FROM campaign
        WHERE campaign.id = {CAMPAIGN_ID}
        LIMIT 1
    """)
    if not rows:
        raise RuntimeError(f"Campaign {CAMPAIGN_ID} was not found in customer {CUSTOMER_ID}.")

    row = rows[0]
    campaign = row.campaign
    budget = row.campaign_budget
    network = campaign.network_settings
    geo = campaign.geo_target_type_setting
    summary = {
        "id": campaign.id,
        "name": campaign.name,
        "status": enum_name(campaign.status),
        "advertising_channel_type": enum_name(campaign.advertising_channel_type),
        "bidding_strategy_type": enum_name(campaign.bidding_strategy_type),
        "budget_micros": budget.amount_micros,
        "target_google_search": network.target_google_search,
        "target_search_network": network.target_search_network,
        "target_content_network": network.target_content_network,
        "target_partner_search_network": network.target_partner_search_network,
        "positive_geo_target_type": enum_name(geo.positive_geo_target_type),
        "negative_geo_target_type": enum_name(geo.negative_geo_target_type),
    }

    if summary["name"] != CAMPAIGN_NAME:
        log.write(json.dumps(summary, indent=2))
        raise RuntimeError(f"Refusing to continue: campaign ID {CAMPAIGN_ID} is named {summary['name']!r}, not {CAMPAIGN_NAME!r}.")

    return summary


def fetch_ad_groups(client: GoogleAdsClient) -> list[dict]:
    rows = search(client, f"""
        SELECT
          ad_group.id,
          ad_group.name,
          ad_group.status,
          ad_group.type
        FROM ad_group
        WHERE campaign.id = {CAMPAIGN_ID}
        ORDER BY ad_group.name
    """)
    return [
        {
            "id": row.ad_group.id,
            "name": row.ad_group.name,
            "status": enum_name(row.ad_group.status),
            "type": enum_name(row.ad_group.type),
        }
        for row in rows
    ]


def fetch_keywords(client: GoogleAdsClient) -> list[KeywordRow]:
    rows = search(client, f"""
        SELECT
          ad_group.id,
          ad_group.name,
          ad_group_criterion.criterion_id,
          ad_group_criterion.resource_name,
          ad_group_criterion.status,
          ad_group_criterion.negative,
          ad_group_criterion.keyword.text,
          ad_group_criterion.keyword.match_type
        FROM keyword_view
        WHERE campaign.id = {CAMPAIGN_ID}
          AND ad_group_criterion.type = KEYWORD
        ORDER BY ad_group.name, ad_group_criterion.keyword.text
    """)
    return [
        KeywordRow(
            ad_group_id=row.ad_group.id,
            ad_group_name=row.ad_group.name,
            criterion_id=row.ad_group_criterion.criterion_id,
            resource_name=row.ad_group_criterion.resource_name,
            text=row.ad_group_criterion.keyword.text,
            match_type=enum_name(row.ad_group_criterion.keyword.match_type),
            status=enum_name(row.ad_group_criterion.status),
            negative=row.ad_group_criterion.negative,
        )
        for row in rows
    ]


def fetch_campaign_negative_keywords(client: GoogleAdsClient) -> list[dict]:
    rows = search(client, f"""
        SELECT
          campaign_criterion.criterion_id,
          campaign_criterion.status,
          campaign_criterion.negative,
          campaign_criterion.keyword.text,
          campaign_criterion.keyword.match_type
        FROM campaign_criterion
        WHERE campaign.id = {CAMPAIGN_ID}
          AND campaign_criterion.type = KEYWORD
          AND campaign_criterion.negative = TRUE
        ORDER BY campaign_criterion.keyword.text
    """)
    return [
        {
            "criterion_id": row.campaign_criterion.criterion_id,
            "status": enum_name(row.campaign_criterion.status),
            "negative": row.campaign_criterion.negative,
            "text": row.campaign_criterion.keyword.text,
            "match_type": enum_name(row.campaign_criterion.keyword.match_type),
        }
        for row in rows
    ]


def fetch_responsive_search_ads(client: GoogleAdsClient) -> list[dict]:
    rows = search(client, f"""
        SELECT
          ad_group.id,
          ad_group.name,
          ad_group_ad.ad.id,
          ad_group_ad.status,
          ad_group_ad.ad_strength,
          ad_group_ad.policy_summary.approval_status,
          ad_group_ad.ad.final_urls
        FROM ad_group_ad
        WHERE campaign.id = {CAMPAIGN_ID}
          AND ad_group_ad.ad.type = RESPONSIVE_SEARCH_AD
        ORDER BY ad_group.name
    """)
    return [
        {
            "ad_group": row.ad_group.name,
            "ad_id": row.ad_group_ad.ad.id,
            "status": enum_name(row.ad_group_ad.status),
            "ad_strength": enum_name(row.ad_group_ad.ad_strength),
            "approval_status": enum_name(row.ad_group_ad.policy_summary.approval_status),
            "final_urls": list(row.ad_group_ad.ad.final_urls),
        }
        for row in rows
    ]


def fetch_location_criteria(client: GoogleAdsClient) -> list[dict]:
    rows = search(client, f"""
        SELECT
          campaign_criterion.criterion_id,
          campaign_criterion.status,
          campaign_criterion.negative,
          campaign_criterion.location.geo_target_constant
        FROM campaign_criterion
        WHERE campaign.id = {CAMPAIGN_ID}
          AND campaign_criterion.type = LOCATION
    """)
    return [
        {
            "criterion_id": row.campaign_criterion.criterion_id,
            "status": enum_name(row.campaign_criterion.status),
            "negative": row.campaign_criterion.negative,
            "geo_target_constant": row.campaign_criterion.location.geo_target_constant,
        }
        for row in rows
    ]


def fetch_conversion_actions(client: GoogleAdsClient) -> list[dict]:
    rows = search(client, """
        SELECT
          conversion_action.id,
          conversion_action.name,
          conversion_action.status,
          conversion_action.type,
          conversion_action.category,
          conversion_action.primary_for_goal,
          conversion_action.include_in_conversions_metric
        FROM conversion_action
        ORDER BY conversion_action.name
    """)
    return [
        {
            "id": row.conversion_action.id,
            "name": row.conversion_action.name,
            "status": enum_name(row.conversion_action.status),
            "type": enum_name(row.conversion_action.type),
            "category": enum_name(row.conversion_action.category),
            "primary_for_goal": row.conversion_action.primary_for_goal,
            "include_in_conversions_metric": row.conversion_action.include_in_conversions_metric,
        }
        for row in rows
    ]


def fetch_customer_conversion_goals(client: GoogleAdsClient) -> list[dict]:
    rows = search(client, """
        SELECT
          customer_conversion_goal.category,
          customer_conversion_goal.origin,
          customer_conversion_goal.biddable
        FROM customer_conversion_goal
    """)
    return [
        {
            "category": enum_name(row.customer_conversion_goal.category),
            "origin": enum_name(row.customer_conversion_goal.origin),
            "biddable": row.customer_conversion_goal.biddable,
        }
        for row in rows
    ]


def fetch_campaign_assets(client: GoogleAdsClient) -> list[dict]:
    rows = search(client, f"""
        SELECT
          campaign.id,
          campaign_asset.field_type,
          campaign_asset.status,
          asset.sitelink_asset.link_text,
          asset.callout_asset.callout_text,
          asset.structured_snippet_asset.header,
          asset.name
        FROM campaign_asset
        WHERE campaign.id = {CAMPAIGN_ID}
        ORDER BY campaign_asset.field_type
    """)
    assets = []
    for row in rows:
        label = (
            row.asset.sitelink_asset.link_text
            or row.asset.callout_asset.callout_text
            or row.asset.structured_snippet_asset.header
            or row.asset.name
        )
        assets.append({
            "field_type": enum_name(row.campaign_asset.field_type),
            "status": enum_name(row.campaign_asset.status),
            "label": label,
        })
    return assets


def search(client: GoogleAdsClient, query: str) -> list:
    service = client.get_service("GoogleAdsService")
    return list(service.search(customer_id=CUSTOMER_ID, query=clean_query(query)))


def safe_fetch(label: str, log: Log, func):
    try:
        return func()
    except GoogleAdsException as ex:
        log.write(f"Could not read {label}:")
        for error in ex.failure.errors:
            log.write(f"- {error.error_code}: {error.message}")
        return None


def print_campaign_summary(log: Log, campaign: dict) -> None:
    log.write("Campaign settings:")
    log.write(f"- id: {campaign['id']}")
    log.write(f"- name: {campaign['name']}")
    log.write(f"- status: {campaign['status']}")
    log.write(f"- type: {campaign['advertising_channel_type']}")
    log.write(f"- budget: {micros_to_usd(campaign['budget_micros'])}/day")
    log.write(f"- bidding: {campaign['bidding_strategy_type']}")
    log.write(f"- Google Search: {campaign['target_google_search']}")
    log.write(f"- Search Network: {campaign['target_search_network']}")
    log.write(f"- Search Partners: {campaign['target_partner_search_network']}")
    log.write(f"- Display Network: {campaign['target_content_network']}")
    log.write(f"- location positive targeting: {campaign['positive_geo_target_type']}")
    log.write(f"- location negative targeting: {campaign['negative_geo_target_type']}")


def print_ad_groups(log: Log, ad_groups: list[dict]) -> None:
    log.write("")
    log.write("Ad groups:")
    for row in ad_groups:
        log.write(f"- {row['name']} | id={row['id']} | status={row['status']} | type={row['type']}")


def print_keywords(log: Log, keywords: Iterable[KeywordRow]) -> None:
    log.write("")
    log.write("Keywords:")
    for kw in keywords:
        log.write(f"- {kw.ad_group_name} | {kw.text} | {kw.match_type} | {kw.status} | negative={kw.negative}")


def print_negatives(log: Log, negatives: list[dict]) -> None:
    log.write("")
    log.write("Campaign-level negative keywords:")
    if not negatives:
        log.write("- none returned")
    for row in negatives:
        log.write(f"- {row['text']} | {row['match_type']} | {row['status']}")


def print_ads(log: Log, ads: list[dict]) -> None:
    log.write("")
    log.write("Responsive Search Ads:")
    if not ads:
        log.write("- none returned")
    for row in ads:
        log.write(
            f"- {row['ad_group']} | ad_id={row['ad_id']} | status={row['status']} | "
            f"strength={row['ad_strength']} | approval={row['approval_status']} | final_urls={', '.join(row['final_urls'])}"
        )


def check_landing_pages() -> list[dict]:
    results = []
    for ad_group, url in LANDING_PAGES.items():
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "BCN-Google-Ads-Validator/1.0"})
            with urllib.request.urlopen(request, timeout=20) as response:
                status = response.status
                body = response.read(500_000).decode("utf-8", errors="replace")
            visible_text = HtmlTextExtractor.extract(body).lower()
            broken = status != 200 or "404" in visible_text[:500] or "not found" in visible_text[:500]
            sold_out = "sold out" in visible_text and "add to cart" not in visible_text
            ok = not broken and not sold_out
            detail = f"status={status}, sold_out_detected={sold_out}"
        except Exception as ex:
            ok = False
            detail = str(ex)
        results.append({"ad_group": ad_group, "url": url, "ok": ok, "detail": detail})
    return results


class HtmlTextExtractor(html.parser.HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)

    @classmethod
    def extract(cls, html: str) -> str:
        parser = cls()
        parser.feed(html)
        return " ".join(parser.parts)


def enum_name(value) -> str:
    return getattr(value, "name", str(value))


def normalize_keyword(value: str) -> str:
    return " ".join(value.strip().casefold().split())


def micros_to_usd(value: int) -> str:
    return f"${value / 1_000_000:.2f}"


def clean_query(query: str) -> str:
    return textwrap.dedent(query).strip()


if __name__ == "__main__":
    raise SystemExit(main())

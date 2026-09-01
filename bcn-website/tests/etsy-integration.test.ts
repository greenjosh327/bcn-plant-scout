import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  assertReadOnlyEtsyMethod,
  collectAllActiveEtsyListings,
  collectEtsyListingInventories,
  fetchEtsySelfWithToken,
  normalizeEtsyListing,
  normalizeEtsyListingInventory,
  shouldRefreshEtsyToken
} from "../lib/etsy/client";
import {
  createOAuthState,
  createPkceChallenge,
  createPkceVerifier,
  hashOAuthState,
  oauthStateMatches,
  openSecret,
  sealSecret
} from "../lib/etsy/crypto";
import { buildEtsyAuthorizationUrl } from "../lib/etsy/oauth";
import { ETSY_API_BASE_URL, type EtsyConfig } from "../lib/etsy/config";
import type { EtsyListing, EtsyListingInventory } from "../lib/etsy/types";

const config: EtsyConfig = {
  apiKey: "test-keystring",
  sharedSecret: "server-only-shared-secret",
  redirectUri: "https://example.com/api/admin/etsy/callback",
  encryptionKey: randomBytes(32).toString("base64")
};

function listing(id: number, overrides: Partial<EtsyListing> = {}): EtsyListing {
  return {
    listing_id: id,
    title: `Listing ${id}`,
    state: "active",
    quantity: 4,
    url: `https://www.etsy.com/listing/${id}`,
    updated_timestamp: 1_700_000_000,
    price: { amount: 1250, divisor: 100, currency_code: "USD" },
    ...overrides
  };
}

describe("Etsy Phase 1 integration", () => {
  it("uses the application server declared by Etsy's current OpenAPI specification", () => {
    assert.equal(ETSY_API_BASE_URL, "https://openapi.etsy.com/v3/application");
  });

  it("creates Etsy-compatible PKCE values and validates OAuth state", () => {
    const verifier = createPkceVerifier();
    const challenge = createPkceChallenge(verifier);
    const state = createOAuthState();
    const stateHash = hashOAuthState(state);

    assert.ok(verifier.length >= 43 && verifier.length <= 128);
    assert.match(verifier, /^[A-Za-z0-9_-]+$/);
    assert.equal(challenge.length, 43);
    assert.match(challenge, /^[A-Za-z0-9_-]+$/);
    assert.equal(oauthStateMatches(state, stateHash), true);
    assert.equal(oauthStateMatches(`${state}x`, stateHash), false);
  });

  it("encrypts OAuth credentials with authenticated encryption", () => {
    const ciphertext = sealSecret("private-token", config.encryptionKey);

    assert.notEqual(ciphertext, "private-token");
    assert.equal(openSecret(ciphertext, config.encryptionKey), "private-token");
    assert.throws(() => openSecret(`${ciphertext}tampered`, config.encryptionKey));
  });

  it("builds an S256 authorization URL with read-only scopes and no shared secret", () => {
    const authorizeUrl = new URL(buildEtsyAuthorizationUrl(config, "state-value", "challenge-value"));

    assert.equal(authorizeUrl.origin, "https://www.etsy.com");
    assert.equal(authorizeUrl.searchParams.get("scope"), "shops_r listings_r");
    assert.equal(authorizeUrl.searchParams.get("code_challenge_method"), "S256");
    assert.equal(authorizeUrl.searchParams.get("redirect_uri"), config.redirectUri);
    assert.equal(authorizeUrl.toString().includes(config.sharedSecret), false);
  });

  it("sends Etsy's required read-only authentication headers", async () => {
    const accessToken = "12345678.test-access-token";
    let requestedUrl = "";
    let requestedHeaders = new Headers();

    await fetchEtsySelfWithToken(accessToken, config, async (input, init) => {
      requestedUrl = String(input);
      requestedHeaders = new Headers(init?.headers);
      return Response.json({ user_id: 12345678, shop_id: 87654321 });
    });

    assert.equal(requestedUrl, `${ETSY_API_BASE_URL}/users/me`);
    assert.equal(requestedHeaders.get("authorization"), `Bearer ${accessToken}`);
    assert.equal(requestedHeaders.get("x-api-key"), `${config.apiKey}:${config.sharedSecret}`);
  });

  it("logs only safe Etsy request diagnostics on an API error", async () => {
    const accessToken = "12345678.private-access-token";
    const logged: unknown[][] = [];
    const originalConsoleError = console.error;
    console.error = (...values: unknown[]) => logged.push(values);

    try {
      await assert.rejects(
        fetchEtsySelfWithToken(accessToken, config, async () =>
          Response.json(
            {
              error: `Invalid credentials: Bearer ${accessToken} ${config.apiKey}:${config.sharedSecret}`
            },
            { status: 403 }
          )
        ),
        /status 403/i
      );
    } finally {
      console.error = originalConsoleError;
    }

    assert.deepEqual(logged, [
      [
        "Etsy API request failed",
        {
          endpoint: "/users/me",
          status: 403,
          message: "Invalid credentials: Bearer [redacted] [redacted]:[redacted]"
        }
      ]
    ]);
    assert.equal(JSON.stringify(logged).includes(accessToken), false);
    assert.equal(JSON.stringify(logged).includes(config.apiKey), false);
    assert.equal(JSON.stringify(logged).includes(config.sharedSecret), false);
  });

  it("normalizes Etsy Money and updated_timestamp values", () => {
    const normalized = normalizeEtsyListing(listing(42));

    assert.equal(normalized.listingId, 42);
    assert.equal(normalized.price, 12.5);
    assert.equal(normalized.currencyCode, "USD");
    assert.equal(normalized.lastUpdated, "2023-11-14T22:13:20.000Z");
  });

  it("normalizes a listing inventory record with no variations", () => {
    const inventory: EtsyListingInventory = {
      products: [
        {
          product_id: 10,
          sku: "",
          offerings: [
            {
              offering_id: 20,
              quantity: 8,
              is_enabled: true,
              price: { amount: 450, divisor: 100, currency_code: "USD" }
            }
          ],
          property_values: []
        }
      ],
      price_on_property: [],
      quantity_on_property: [],
      sku_on_property: []
    };

    const normalized = normalizeEtsyListingInventory(inventory);

    assert.equal(normalized.recordAvailable, true);
    assert.equal(normalized.hasVariations, false);
    assert.equal(normalized.priceVaries, false);
    assert.equal(normalized.quantityVaries, false);
    assert.deepEqual(normalized.offerings, [
      {
        productId: 10,
        offeringId: 20,
        options: [],
        quantity: 8,
        price: 4.5,
        currencyCode: "USD",
        sku: null,
        isEnabled: true
      }
    ]);
  });

  it("normalizes one Etsy variation and its price and quantity behavior", () => {
    const normalized = normalizeEtsyListingInventory({
      products: [
        {
          product_id: 11,
          sku: "BCN-25",
          offerings: [
            {
              offering_id: 21,
              quantity: 12,
              is_enabled: true,
              price: { amount: 500, divisor: 100, currency_code: "USD" }
            }
          ],
          property_values: [
            { property_id: 100, property_name: "Packet size", value_ids: [1001], values: ["25 Seeds"] }
          ]
        }
      ],
      price_on_property: [100],
      quantity_on_property: [100],
      sku_on_property: [100]
    });

    assert.equal(normalized.hasVariations, true);
    assert.equal(normalized.priceVaries, true);
    assert.equal(normalized.quantityVaries, true);
    assert.equal(normalized.offerings[0]?.sku, "BCN-25");
    assert.deepEqual(normalized.offerings[0]?.options, [
      {
        propertyId: 100,
        name: "Packet size",
        value: "25 Seeds",
        priceVaries: true,
        quantityVaries: true,
        skuVaries: true
      }
    ]);
  });

  it("normalizes multiple Etsy variation offerings with independent quantity, price, and SKU values", () => {
    const normalized = normalizeEtsyListingInventory({
      products: [
        {
          product_id: 12,
          sku: "BCN-25",
          offerings: [
            {
              offering_id: 22,
              quantity: 16,
              is_enabled: true,
              price: { amount: 500, divisor: 100, currency_code: "USD" }
            }
          ],
          property_values: [{ property_id: 100, property_name: "Packet size", values: ["25 Seeds"] }]
        },
        {
          product_id: 13,
          sku: "BCN-100",
          offerings: [
            {
              offering_id: 23,
              quantity: 3,
              is_enabled: true,
              price: { amount: 1400, divisor: 100, currency_code: "USD" }
            }
          ],
          property_values: [{ property_id: 100, property_name: "Packet size", values: ["100 Seeds"] }]
        }
      ],
      price_on_property: [100],
      quantity_on_property: [100],
      sku_on_property: [100]
    });

    assert.equal(normalized.offerings.length, 2);
    assert.deepEqual(
      normalized.offerings.map((offering) => ({
        option: offering.options[0]?.value,
        quantity: offering.quantity,
        price: offering.price,
        sku: offering.sku
      })),
      [
        { option: "25 Seeds", quantity: 16, price: 5, sku: "BCN-25" },
        { option: "100 Seeds", quantity: 3, price: 14, sku: "BCN-100" }
      ]
    );
  });

  it("batches inventory reads at Etsy's 100-listing limit without changing methods or scopes", async () => {
    const requestedBatches: number[][] = [];
    const listingIds = Array.from({ length: 101 }, (_, index) => index + 1);

    const inventories = await collectEtsyListingInventories(listingIds, async (batchIds) => {
      requestedBatches.push(batchIds);
      return {
        count: batchIds.length,
        results: batchIds.map((listingId) => ({ listing_id: listingId, inventory: null }))
      };
    });

    assert.deepEqual(requestedBatches.map((batch) => batch.length), [100, 1]);
    assert.equal(inventories.size, 101);
  });

  it("paginates through every result and defensively keeps only active listings", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => listing(index + 1));
    const requestedOffsets: number[] = [];

    const listings = await collectAllActiveEtsyListings(async (offset, limit) => {
      requestedOffsets.push(offset);
      assert.equal(limit, 100);
      return offset === 0
        ? { count: 102, results: firstPage }
        : { count: 102, results: [listing(101), listing(102, { state: "draft" })] };
    });

    assert.deepEqual(requestedOffsets, [0, 100]);
    assert.equal(listings.length, 101);
    assert.equal(listings.some((item) => item.listingId === 102), false);
  });

  it("rejects application-level write methods in Phase 1", () => {
    assert.doesNotThrow(() => assertReadOnlyEtsyMethod("GET"));
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      assert.throws(() => assertReadOnlyEtsyMethod(method), /read only/i);
    }
  });

  it("refreshes expired and nearly expired access tokens", () => {
    const now = Date.parse("2026-08-30T12:00:00.000Z");

    assert.equal(shouldRefreshEtsyToken("2026-08-30T11:59:59.000Z", now), true);
    assert.equal(shouldRefreshEtsyToken("2026-08-30T12:04:59.000Z", now), true);
    assert.equal(shouldRefreshEtsyToken("2026-08-30T12:05:01.000Z", now), false);
    assert.equal(shouldRefreshEtsyToken("not-a-date", now), true);
  });

  it("keeps the Supabase credential table server-only", async () => {
    const migration = await readFile(
      new URL("../supabase/sql/20260830_bcn_etsy_read_only.sql", import.meta.url),
      "utf8"
    );

    assert.match(migration, /enable row level security/i);
    assert.match(migration, /revoke all on table public\.etsy_connections from public, anon, authenticated/i);
    assert.match(migration, /access_token_encrypted text/i);
    assert.doesNotMatch(migration, /access_token\s+text/i);
  });
});

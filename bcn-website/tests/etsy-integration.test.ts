import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  assertReadOnlyEtsyMethod,
  collectAllActiveEtsyListings,
  collectEtsyListingInventories,
  collectIndividualEtsyListingInventories,
  fetchEtsySelfWithToken,
  normalizeEtsyListing,
  normalizeEtsyListingInventory,
  preserveGrantedScopesAfterRefresh,
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
import {
  calculateSafeAllocation,
  findManagedSpeciesByProductId,
  packSizeQuantityVaries,
  suggestManagedSpecies,
  suggestPacksConsumed
} from "../lib/etsy/inventory-allocation";
import {
  assertEtsyInventoryWriteRequest,
  buildEtsyInventoryUpdatePayload,
  inventoryOfferingKey,
  sanitizeEtsyInventoryResponse
} from "../lib/etsy/inventory-writer";
import {
  changeSetMeetsCompletionInvariant,
  putThenReadBackEtsyInventory
} from "../lib/etsy/inventory-apply";
import { buildVerifiedEtsyOfferingSummary } from "../lib/etsy/inventory-apply-summary";
import { ETSY_API_BASE_URL, ETSY_REQUIRED_SCOPES, type EtsyConfig } from "../lib/etsy/config";
import {
  BLACK_CHERRY_PRODUCT_ID,
  normalizeEtsyReceiptForStorage,
  normalizeEtsyTransactionForStorage,
  planOrderInventoryForTesting,
  type ConfirmedOrderMapping
} from "../lib/etsy/order-sync-core";
import type { EtsyListing, EtsyListingInventory, EtsyReceipt, EtsyReceiptTransaction } from "../lib/etsy/types";

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

describe("Etsy Phase 1 and controlled Phase 2 integration", () => {
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

  it("builds an S256 authorization URL with only the required listing and order scopes", () => {
    const authorizeUrl = new URL(buildEtsyAuthorizationUrl(config, "state-value", "challenge-value"));

    assert.equal(authorizeUrl.origin, "https://www.etsy.com");
    assert.equal(authorizeUrl.searchParams.get("scope"), "shops_r listings_r listings_w transactions_r");
    assert.deepEqual(ETSY_REQUIRED_SCOPES, ["shops_r", "listings_r", "listings_w", "transactions_r"]);
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

  it("retries a rate-limited read using Etsy's 429 response without changing the request", async () => {
    const accessToken = "12345678.test-access-token";
    const warnings: unknown[][] = [];
    const originalConsoleWarn = console.warn;
    let requestCount = 0;
    console.warn = (...values: unknown[]) => warnings.push(values);

    try {
      const self = await fetchEtsySelfWithToken(accessToken, config, async () => {
        requestCount += 1;
        return requestCount === 1
          ? Response.json({ error: "Exceeded per second rate limit" }, { status: 429, headers: { "retry-after": "0" } })
          : Response.json({ user_id: 12345678, shop_id: 87654321 });
      });

      assert.deepEqual(self, { user_id: 12345678, shop_id: 87654321 });
    } finally {
      console.warn = originalConsoleWarn;
    }

    assert.equal(requestCount, 2);
    assert.deepEqual(warnings, [
      [
        "Etsy API read rate limited; retrying",
        { endpoint: "/users/me", status: 429, message: "Exceeded per second rate limit" }
      ]
    ]);
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

  it("uses fresh individual listing inventory instead of a stale batch snapshot", async () => {
    const staleBatch = await collectEtsyListingInventories([42], async () => ({
      count: 1,
      results: [
        {
          listing_id: 42,
          inventory: {
            products: [
              {
                product_id: 10,
                offerings: [
                  {
                    offering_id: 20,
                    quantity: 6,
                    is_enabled: true,
                    price: { amount: 500, divisor: 100, currency_code: "USD" }
                  }
                ]
              }
            ]
          }
        }
      ]
    }));
    const freshIndividual = await collectIndividualEtsyListingInventories([42], async () => ({
      products: [
        {
          product_id: 10,
          offerings: [
            {
              offering_id: 20,
              quantity: 2,
              is_enabled: true,
              price: { amount: 500, divisor: 100, currency_code: "USD" }
            }
          ]
        }
      ]
    }));

    assert.equal(normalizeEtsyListingInventory(staleBatch.get(42)).offerings[0]?.quantity, 6);
    assert.equal(normalizeEtsyListingInventory(freshIndividual.get(42)).offerings[0]?.quantity, 2);
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

  it("keeps Fragrant Sumac and Staghorn Sumac strictly separate", () => {
    assert.equal(suggestManagedSpecies("Fragrant Sumac (Rhus aromatica) Seeds")?.species, "Fragrant Sumac");
    assert.equal(suggestManagedSpecies("Staghorn Sumac (Rhus typhina) Seeds"), null);
    assert.equal(suggestManagedSpecies("Three varieties - Catalpa, Honey Locust, Sumac"), null);
  });

  it("blocks Black Cherry from controlled inventory writes", () => {
    const species = suggestManagedSpecies("Black Cherry (Prunus serotina) Seeds");
    assert.equal(species?.species, "Black Cherry");
    assert.equal(species?.blockedFromWrites, true);
    assert.equal(findManagedSpeciesByProductId("prod_0b70691c-58ab-45d0-b392-87f19b0433bf")?.blockedFromWrites, true);
  });

  it("maps only explicit 25- and 100-seed pack options to physical pack units", () => {
    const listingSummary = { title: "Red Elderberry Seeds" };
    assert.equal(
      suggestPacksConsumed(listingSummary, {
        sku: "BCN-REB-25",
        options: [{ propertyId: 1, name: "Pack size", value: "Pack of 25", priceVaries: true, quantityVaries: true, skuVaries: true }]
      }),
      1
    );
    assert.equal(
      suggestPacksConsumed(listingSummary, {
        sku: "BCN-REB-100",
        options: [{ propertyId: 1, name: "Pack size", value: "Pack of 100", priceVaries: true, quantityVaries: true, skuVaries: true }]
      }),
      4
    );
    assert.equal(
      suggestPacksConsumed(listingSummary, {
        sku: "BCN-REB-50",
        options: [{ propertyId: 1, name: "Pack size", value: "Pack of 50", priceVaries: true, quantityVaries: true, skuVaries: true }]
      }),
      null
    );
  });

  it("requires Etsy quantity to vary on the actual pack-size property", () => {
    assert.equal(
      packSizeQuantityVaries({
        options: [
          {
            propertyId: 1,
            name: "Pack size",
            value: "25 Seeds",
            priceVaries: true,
            quantityVaries: true,
            skuVaries: true
          }
        ]
      }),
      true
    );
    assert.equal(
      packSizeQuantityVaries({
        options: [
          {
            propertyId: 2,
            name: "Packaging",
            value: "Paper packet",
            priceVaries: false,
            quantityVaries: true,
            skuVaries: false
          }
        ]
      }),
      false
    );
  });

  it("forces the 100-seed option to zero below four physical packs", () => {
    const allocation = calculateSafeAllocation(3, [
      { key: "25", quantity: 20, packsConsumed: 1, isEnabled: true },
      { key: "100", quantity: 10, packsConsumed: 4, isEnabled: true }
    ]);

    assert.equal(allocation.status, "below_100_seed_threshold");
    assert.equal(allocation.proposed.get("25"), 3);
    assert.equal(allocation.proposed.get("100"), 0);
    assert.equal(allocation.proposedCommitment, 3);
  });

  it("reduces an overcommitted 100-seed option before the 25-seed option", () => {
    const allocation = calculateSafeAllocation(10, [
      { key: "25", quantity: 6, packsConsumed: 1, isEnabled: true },
      { key: "100", quantity: 2, packsConsumed: 4, isEnabled: true }
    ]);

    assert.equal(allocation.status, "reduced_to_physical_stock");
    assert.equal(allocation.proposed.get("25"), 6);
    assert.equal(allocation.proposed.get("100"), 1);
    assert.equal(allocation.proposedCommitment, 10);
  });

  it("requires manual allocation when duplicate offerings compete for one species pool", () => {
    const allocation = calculateSafeAllocation(20, [
      { key: "listing-a-25", quantity: 5, packsConsumed: 1, isEnabled: true },
      { key: "listing-b-25", quantity: 5, packsConsumed: 1, isEnabled: true }
    ]);
    assert.equal(allocation.status, "manual_allocation");
  });

  it("permits only the exact Etsy inventory PUT and keeps it disabled by default", () => {
    assert.throws(
      () => assertEtsyInventoryWriteRequest("PUT", "/listings/123/inventory", false),
      /disabled pending owner review/i
    );
    assert.doesNotThrow(() => assertEtsyInventoryWriteRequest("PUT", "/listings/123/inventory", true));
    for (const [method, path] of [
      ["PATCH", "/listings/123/inventory"],
      ["PUT", "/listings/123"],
      ["POST", "/shops/1/listings"]
    ]) {
      assert.throws(() => assertEtsyInventoryWriteRequest(method, path, true), /only Etsy listing inventory/i);
    }
  });

  it("builds a full Etsy inventory payload while changing only approved quantities", () => {
    const inventory: EtsyListingInventory = {
      products: [
        {
          product_id: 11,
          sku: "BCN-25",
          property_values: [
            {
              property_id: 100,
              property_name: "Pack size",
              value_ids: [1001],
              values: ["25 Seeds"],
              scale_id: null,
              scale_name: "response-only"
            }
          ],
          offerings: [
            {
              offering_id: 21,
              quantity: 12,
              is_enabled: true,
              price: { amount: 500, divisor: 100, currency_code: "USD" },
              readiness_state_id: 991
            }
          ]
        },
        {
          product_id: 12,
          sku: "BCN-100",
          property_values: [
            { property_id: 100, property_name: "Pack size", value_ids: [1002], values: ["100 Seeds"] }
          ],
          offerings: [
            {
              offering_id: 22,
              quantity: 3,
              is_enabled: true,
              price: { amount: 1200, divisor: 100, currency_code: "USD" },
              readiness_state_id: null
            }
          ]
        }
      ],
      price_on_property: [100],
      quantity_on_property: [100],
      sku_on_property: [100],
      readiness_state_on_property: []
    };
    const payload = buildEtsyInventoryUpdatePayload(
      inventory,
      new Map([[inventoryOfferingKey(12, 22), 0]])
    );

    assert.deepEqual(payload.products[0]?.offerings[0], {
      price: 5,
      quantity: 12,
      is_enabled: true,
      readiness_state_id: 991
    });
    assert.deepEqual(payload.products[1]?.offerings[0], {
      price: 12,
      quantity: 0,
      is_enabled: true,
      readiness_state_id: null
    });
    assert.equal("product_id" in payload.products[0], false);
    assert.equal("offering_id" in payload.products[0].offerings[0], false);
    assert.equal("scale_name" in (payload.products[0].property_values?.[0] || {}), false);
    assert.deepEqual(payload.quantity_on_property, [100]);
  });

  it("allowlists successful Etsy PUT diagnostics and omits response-only or secret-shaped fields", () => {
    const sanitized = sanitizeEtsyInventoryResponse({
      access_token: "must-not-survive",
      products: [
        {
          product_id: 11,
          sku: "BCN-25",
          response_only: "drop-me",
          offerings: [
            { offering_id: 21, quantity: 2, is_enabled: true, price: { amount: 500, divisor: 100 } }
          ]
        }
      ],
      quantity_on_property: [100]
    });

    assert.deepEqual(sanitized, {
      products: [
        {
          productId: 11,
          sku: "BCN-25",
          offerings: [{ offeringId: 21, quantity: 2, isEnabled: true }]
        }
      ],
      quantityOnProperty: [100]
    });
    assert.equal(JSON.stringify(sanitized).includes("must-not-survive"), false);
  });

  it("performs one immediate read-back and never promotes a quantity mismatch to success", async () => {
    let putCalls = 0;
    let readCalls = 0;
    const result = await putThenReadBackEtsyInventory(
      [{ etsy_product_id: 11, etsy_offering_id: 21, proposed_quantity: 2 }],
      async () => {
        putCalls += 1;
        return {
          endpoint: "/listings/42/inventory",
          status: 200,
          response: { products: [], quantityOnProperty: [] }
        };
      },
      async () => {
        readCalls += 1;
        return {
          endpoint: "/listings/42/inventory",
          status: 200,
          fetchedAt: "2026-09-02T01:00:00.000Z",
          data: {
            products: [
              {
                product_id: 11,
                offerings: [
                  {
                    offering_id: 21,
                    quantity: 3,
                    is_enabled: true,
                    price: { amount: 500, divisor: 100, currency_code: "USD" }
                  }
                ]
              }
            ]
          }
        };
      }
    );

    assert.equal(putCalls, 1);
    assert.equal(readCalls, 1);
    assert.equal(result.verification.matches, false);
    assert.equal(result.verification.verified[0]?.actualQuantity, 3);
  });

  it("requires exact persisted quantities and timestamps before a change set can complete", () => {
    const verifiedItem = {
      before_quantity: 6,
      proposed_quantity: 2,
      result_status: "succeeded" as const,
      verified_quantity: 2,
      verified_at: "2026-09-02T01:00:00.000Z"
    };

    assert.equal(changeSetMeetsCompletionInvariant([verifiedItem]), true);
    assert.equal(changeSetMeetsCompletionInvariant([{ ...verifiedItem, verified_quantity: 3 }]), false);
    assert.equal(changeSetMeetsCompletionInvariant([{ ...verifiedItem, verified_at: null }]), false);
    assert.equal(changeSetMeetsCompletionInvariant([{ ...verifiedItem, result_status: "unknown" }]), false);
  });

  it("builds the post-apply Verified on Etsy summary only from exact read-back matches", () => {
    const summary = buildVerifiedEtsyOfferingSummary([
      {
        species: "Catalpa",
        listing_id: 42,
        listing_title: "Catalpa Seeds",
        sku: "BCN-CAT-25",
        variation_name: "Pack of 25",
        before_quantity: 6,
        proposed_quantity: 2,
        result_status: "succeeded",
        verified_quantity: 2,
        verified_at: "2026-09-02T01:00:00.000Z"
      },
      {
        species: "Catalpa",
        listing_id: 42,
        listing_title: "Catalpa Seeds",
        sku: "BCN-CAT-100",
        variation_name: "Pack of 100",
        before_quantity: 2,
        proposed_quantity: 0,
        result_status: "unknown",
        verified_quantity: 2,
        verified_at: null
      }
    ]);

    assert.deepEqual(summary, [
      {
        species: "Catalpa",
        listingId: 42,
        listingTitle: "Catalpa Seeds",
        sku: "BCN-CAT-25",
        variationName: "Pack of 25",
        finalVerifiedQuantity: 2,
        verifiedAt: "2026-09-02T01:00:00.000Z"
      }
    ]);
  });

  it("refreshes expired and nearly expired access tokens", () => {
    const now = Date.parse("2026-08-30T12:00:00.000Z");

    assert.equal(shouldRefreshEtsyToken("2026-08-30T11:59:59.000Z", now), true);
    assert.equal(shouldRefreshEtsyToken("2026-08-30T12:04:59.000Z", now), true);
    assert.equal(shouldRefreshEtsyToken("2026-08-30T12:05:01.000Z", now), false);
    assert.equal(shouldRefreshEtsyToken("not-a-date", now), true);
  });

  it("preserves stored OAuth scopes when Etsy omits scope from a refresh response", () => {
    const tokenSet = preserveGrantedScopesAfterRefresh(
      { accessToken: "new-token", grantedScopes: [] },
      ["shops_r", "listings_r", "listings_w", "transactions_r"]
    );

    assert.deepEqual(tokenSet.grantedScopes, ["shops_r", "listings_r", "listings_w", "transactions_r"]);
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

  it("keeps Phase 2 mappings, proposals, and audit records server-only and ledgered", async () => {
    const migration = await readFile(
      new URL("../supabase/migrations/20260901115231_bcn_etsy_controlled_inventory.sql", import.meta.url),
      "utf8"
    );

    assert.match(migration, /inventory_ledger_reference_key_unique/i);
    for (const [productId, inventory] of [
      ["prod_catalpa-speciosa-seeds", 2],
      ["prod_fragrant-sumac-seeds", 52],
      ["prod_donald-wyman-crabapple-seeds", 36],
      ["prod_prairifire-crabapple-seeds", 1],
      ["prod_6365ffae-5dda-4d0c-84e6-90b20469d2b1", 34],
      ["prod_373a4d3c-96b8-493b-a1b1-edf62ada5fb5", 12],
      ["prod_0b70691c-58ab-45d0-b392-87f19b0433bf", 3],
      ["prod_bb82b070-4894-4f5e-b332-660b47584560", 10],
      ["prod_c747934f-4a0c-4850-a205-e90a8c1f0dc5", 14]
    ] as const) {
      assert.match(migration, new RegExp(`'${productId.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}',\\s*${inventory}`));
    }
    assert.match(migration, /'Pack of 25'[\s\S]*'BCN-2026-REB-25'[\s\S]*packs_consumed = 1/i);
    for (const table of [
      "etsy_listing_mappings",
      "etsy_variation_mappings",
      "etsy_inventory_change_sets",
      "etsy_inventory_change_items"
    ]) {
      assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
      assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, "i"));
    }
  });

  it("persists sanitized PUT and fresh GET verification evidence in the server-only audit table", async () => {
    const migration = await readFile(
      new URL("../supabase/migrations/20260902013815_bcn_etsy_inventory_verification_audit.sql", import.meta.url),
      "utf8"
    );

    for (const column of [
      "put_endpoint",
      "put_http_status",
      "put_response",
      "readback_endpoint",
      "readback_http_status",
      "readback_quantities",
      "readback_at",
      "verified_at"
    ]) {
      assert.match(migration, new RegExp(`add column if not exists ${column}`, "i"));
    }
    assert.doesNotMatch(
      migration,
      /add column if not exists (access_token|refresh_token|api_key|shared_secret|authorization_code|pkce)/i
    );
  });

  it("clears the applied proposal before forcing a fresh Etsy dashboard read", async () => {
    const component = await readFile(
      new URL("../components/admin-etsy-inventory-manager.tsx", import.meta.url),
      "utf8"
    );
    const clearIndex = component.indexOf("setProposal(null)");
    const refreshIndex = component.indexOf("await onDashboardRefresh()", clearIndex);

    assert.ok(clearIndex >= 0);
    assert.ok(refreshIndex > clearIndex);
  });
});

function paidReceipt(overrides: Partial<EtsyReceipt> = {}) {
  return normalizeEtsyReceiptForStorage({
    receipt_id: 9001,
    status: "paid",
    is_paid: true,
    is_canceled: false,
    created_timestamp: 1_788_000_000,
    updated_timestamp: 1_788_000_030,
    refunds: [],
    ...overrides
  });
}

function orderTransaction(
  transactionId: number,
  input: Partial<EtsyReceiptTransaction> & { packSize?: 25 | 100 } = {}
) {
  const packSize = input.packSize ?? 25;
  return normalizeEtsyTransactionForStorage({
    transaction_id: transactionId,
    receipt_id: input.receipt_id ?? 9001,
    listing_id: input.listing_id ?? 7001,
    product_id: input.product_id ?? (packSize === 25 ? 25001 : 100001),
    sku: input.sku ?? `BCN-TEST-${packSize}`,
    quantity: input.quantity ?? 1,
    paid_timestamp: input.paid_timestamp ?? 1_788_000_010,
    product_data: input.product_data ?? [{ property_id: 100, property_name: "Pack Size", values: [`${packSize} Seeds`] }],
    variations: input.variations
  });
}

function confirmedMapping(
  transaction: ReturnType<typeof orderTransaction>,
  bcnProductId = "prod-catalpa",
  packsConsumed: 1 | 4 = 1,
  overrides: Partial<ConfirmedOrderMapping> = {}
): ConfirmedOrderMapping {
  assert.notEqual(transaction.listing_id, null);
  assert.notEqual(transaction.product_id, null);
  return {
    listingId: transaction.listing_id!,
    etsyProductId: transaction.product_id!,
    sku: transaction.sku,
    variationFingerprint: transaction.variation_fingerprint,
    bcnProductId,
    packsConsumed,
    confirmed: true,
    ...overrides
  };
}

describe("Etsy Phase 2.5 order-based inventory synchronization", () => {
  it("requests transactions_r as the only new OAuth scope", () => {
    assert.deepEqual(ETSY_REQUIRED_SCOPES, ["shops_r", "listings_r", "listings_w", "transactions_r"]);
  });

  it("a 25-seed sale consumes one physical pack", () => {
    const transaction = orderTransaction(1);
    const result = planOrderInventoryForTesting({
      receipt: paidReceipt(),
      transactions: [transaction],
      mappings: [confirmedMapping(transaction)],
      inventory: { "prod-catalpa": 2 }
    });
    assert.equal(result.plans[0].physicalPacks, 1);
    assert.equal(result.resultingInventory["prod-catalpa"], 1);
  });

  it("a 100-seed sale consumes four physical packs", () => {
    const transaction = orderTransaction(2, { packSize: 100 });
    const result = planOrderInventoryForTesting({
      receipt: paidReceipt(),
      transactions: [transaction],
      mappings: [confirmedMapping(transaction, "prod-elderberry", 4)],
      inventory: { "prod-elderberry": 14 }
    });
    assert.equal(result.plans[0].physicalPacks, 4);
    assert.equal(result.resultingInventory["prod-elderberry"], 10);
  });

  it("multiplies physical pack use for multi-quantity purchases", () => {
    const transaction = orderTransaction(3, { packSize: 100, quantity: 3 });
    const result = planOrderInventoryForTesting({
      receipt: paidReceipt(),
      transactions: [transaction],
      mappings: [confirmedMapping(transaction, "prod-chokeberry", 4)],
      inventory: { "prod-chokeberry": 20 }
    });
    assert.equal(result.plans[0].physicalPacks, 12);
    assert.equal(result.resultingInventory["prod-chokeberry"], 8);
  });

  it("processes multiple exact listing mappings in one receipt", () => {
    const first = orderTransaction(4, { listing_id: 7001, product_id: 25001 });
    const second = orderTransaction(5, { listing_id: 7002, product_id: 25002, sku: "BCN-BEACH-25" });
    const result = planOrderInventoryForTesting({
      receipt: paidReceipt(),
      transactions: [first, second],
      mappings: [confirmedMapping(first, "prod-catalpa"), confirmedMapping(second, "prod-beach")],
      inventory: { "prod-catalpa": 2, "prod-beach": 12 }
    });
    assert.deepEqual(result.plans.map((plan) => plan.status), ["processed", "processed"]);
    assert.deepEqual(result.resultingInventory, { "prod-catalpa": 1, "prod-beach": 11 });
  });

  it("records an unmatched transaction for manual review without decrementing", () => {
    const transaction = orderTransaction(6);
    const result = planOrderInventoryForTesting({
      receipt: paidReceipt(), transactions: [transaction], mappings: [], inventory: { "prod-catalpa": 2 }
    });
    assert.equal(result.plans[0].status, "manual_review");
    assert.equal(result.resultingInventory["prod-catalpa"], 2);
  });

  it("keeps Black Cherry blocked even if a mapping exists", () => {
    const transaction = orderTransaction(7);
    const result = planOrderInventoryForTesting({
      receipt: paidReceipt(),
      transactions: [transaction],
      mappings: [confirmedMapping(transaction, BLACK_CHERRY_PRODUCT_ID)],
      inventory: { [BLACK_CHERRY_PRODUCT_ID]: 3 }
    });
    assert.equal(result.plans[0].status, "manual_review");
    assert.equal(result.resultingInventory[BLACK_CHERRY_PRODUCT_ID], 3);
  });

  it("never infers Staghorn Sumac from a Fragrant Sumac mapping", () => {
    const fragrant = orderTransaction(8, { listing_id: 8001, product_id: 8101, sku: "FRAGRANT-25" });
    const staghorn = orderTransaction(9, { listing_id: 8002, product_id: 8201, sku: "STAGHORN-25" });
    const result = planOrderInventoryForTesting({
      receipt: paidReceipt(),
      transactions: [staghorn],
      mappings: [confirmedMapping(fragrant, "prod-fragrant")],
      inventory: { "prod-fragrant": 52 }
    });
    assert.equal(result.plans[0].status, "manual_review");
    assert.equal(result.resultingInventory["prod-fragrant"], 52);
  });

  it("rejects insufficient stock without allowing inventory below zero", () => {
    const transaction = orderTransaction(10, { packSize: 100 });
    const result = planOrderInventoryForTesting({
      receipt: paidReceipt(),
      transactions: [transaction],
      mappings: [confirmedMapping(transaction, "prod-catalpa", 4)],
      inventory: { "prod-catalpa": 2 }
    });
    assert.equal(result.plans[0].status, "manual_review");
    assert.equal(result.resultingInventory["prod-catalpa"], 2);
  });

  it("duplicate replay cannot decrement the same Etsy transaction twice", () => {
    const transaction = orderTransaction(11);
    const result = planOrderInventoryForTesting({
      receipt: paidReceipt(),
      transactions: [transaction],
      mappings: [confirmedMapping(transaction)],
      inventory: { "prod-catalpa": 1 },
      processedTransactionIds: new Set([11])
    });
    assert.equal(result.plans[0].status, "duplicate");
    assert.equal(result.resultingInventory["prod-catalpa"], 1);
  });

  it("a retry after a partial failure skips committed transactions and processes the remainder", () => {
    const committed = orderTransaction(12);
    const retryable = orderTransaction(13, { product_id: 25002, sku: "BCN-TEST2-25" });
    const result = planOrderInventoryForTesting({
      receipt: paidReceipt(),
      transactions: [committed, retryable],
      mappings: [confirmedMapping(committed), confirmedMapping(retryable)],
      inventory: { "prod-catalpa": 1 },
      processedTransactionIds: new Set([12])
    });
    assert.deepEqual(result.plans.map((plan) => plan.status), ["duplicate", "processed"]);
    assert.equal(result.resultingInventory["prod-catalpa"], 0);
  });

  it("unpaid and canceled receipts do not decrement stock", () => {
    const transaction = orderTransaction(14);
    for (const receipt of [paidReceipt({ is_paid: false }), paidReceipt({ is_canceled: true })]) {
      const result = planOrderInventoryForTesting({
        receipt, transactions: [transaction], mappings: [confirmedMapping(transaction)], inventory: { "prod-catalpa": 2 }
      });
      assert.equal(result.plans[0].status, "ignored");
      assert.equal(result.resultingInventory["prod-catalpa"], 2);
    }
  });

  it("refunds require manual review and never restore or decrement stock automatically", () => {
    const transaction = orderTransaction(15);
    const result = planOrderInventoryForTesting({
      receipt: paidReceipt({ refunds: [{ created_timestamp: 1_788_000_020, reason: "refund", status: "processed" }] }),
      transactions: [transaction], mappings: [confirmedMapping(transaction)], inventory: { "prod-catalpa": 2 }
    });
    assert.equal(result.plans[0].status, "manual_review");
    assert.equal(result.resultingInventory["prod-catalpa"], 2);
  });

  it("stores only allowlisted receipt and variation audit fields", () => {
    const receipt = normalizeEtsyReceiptForStorage({
      receipt_id: 22,
      status: "paid",
      is_paid: true,
      refunds: [{ reason: "refund", status: "processed", created_timestamp: 1_788_000_020 }],
      ...({ buyer_email: "never-store@example.com", name: "Never Store" } as object)
    });
    const transaction = normalizeEtsyTransactionForStorage({
      transaction_id: 22,
      receipt_id: 22,
      listing_id: 33,
      product_id: 44,
      quantity: 1,
      paid_timestamp: 1_788_000_010,
      variations: [{ property_id: 54, formatted_name: "Personalization", formatted_value: "private text" }]
    });
    assert.equal(JSON.stringify(receipt).includes("never-store"), false);
    assert.equal(JSON.stringify(transaction).includes("private text"), false);
  });

  it("the migration enforces leases, atomic ledger references, RLS, and no baseline seed", async () => {
    const migration = await readFile(
      new URL("../supabase/migrations/20260902125852_bcn_etsy_order_sync.sql", import.meta.url),
      "utf8"
    );
    for (const table of ["etsy_order_sync_state", "etsy_order_sync_runs", "etsy_receipts", "etsy_transactions"]) {
      assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
      assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, "i"));
    }
    assert.match(migration, /lease_expires_at > now\(\)/i);
    assert.match(migration, /unique \(connection_id, shop_id, transaction_id\)/i);
    assert.match(migration, /format\('etsy:%s:%s', p_shop_id, pending_transaction\.transaction_id\)/i);
    assert.match(migration, /and inventory >= pending_transaction\.physical_packs_consumed/i);
    assert.match(migration, /manual_review_post_processing_change/i);
    assert.equal((migration.match(/insert into public\.etsy_order_sync_state/gi) || []).length, 1);
  });

  it("prevents concurrent order-sync attempts with a persistent database lease", async () => {
    const migration = await readFile(
      new URL("../supabase/migrations/20260902125852_bcn_etsy_order_sync.sql", import.meta.url),
      "utf8"
    );
    assert.match(migration, /active_run_id is not null[\s\S]*lease_expires_at > now\(\)/i);
    assert.match(migration, /raise exception 'Another Etsy order sync is already running\.'/i);
  });

  it("enforces one inventory-ledger entry per Etsy transaction", async () => {
    const migration = await readFile(
      new URL("../supabase/migrations/20260902125852_bcn_etsy_order_sync.sql", import.meta.url),
      "utf8"
    );
    assert.match(migration, /unique \(connection_id, shop_id, transaction_id\)/i);
    assert.match(migration, /format\('etsy:%s:%s', p_shop_id, pending_transaction\.transaction_id\)/i);
    assert.match(migration, /on conflict \(reference_key\) where reference_key is not null do nothing/i);
  });

  it("stops a failed run without advancing the successful-sync cursor", async () => {
    const source = await readFile(new URL("../lib/etsy/order-sync.ts", import.meta.url), "utf8");
    const processIndex = source.indexOf('supabase.rpc("process_etsy_order_receipt"');
    const finishIndex = source.indexOf('supabase.rpc("finish_etsy_order_sync"');
    const failIndex = source.indexOf('supabase.rpc("fail_etsy_order_sync"');
    assert.ok(processIndex >= 0);
    assert.ok(finishIndex > processIndex);
    assert.ok(failIndex > finishIndex);
    assert.match(source, /if \(processError \|\| !processData\) \{[\s\S]*throw new Error/i);
  });

  it("order sync performs Etsy GETs and generates a fresh proposal without applying it", async () => {
    const source = await readFile(new URL("../lib/etsy/order-sync.ts", import.meta.url), "utf8");
    const client = await readFile(new URL("../lib/etsy/client.ts", import.meta.url), "utf8");
    assert.match(source, /getEtsyShopReceiptsPage/);
    assert.match(source, /getEtsyReceiptTransactions/);
    assert.match(source, /idempotencyKey: `etsy-order-sync:\$\{activeRun\.run_id\}`/);
    assert.match(source, /processing_status", "manual_review_insufficient_stock"/);
    assert.doesNotMatch(source, /\.eq\("last_sync_run_id", activeRun\.run_id\)[\s\S]{0,160}manual_review_insufficient_stock/);
    assert.doesNotMatch(source, /applyEtsyInventoryProposal|updateEtsyListingInventory/);
    assert.match(client, /authorizedEtsyJson<EtsyReceiptPage>/);
    assert.match(client, /authorizedEtsyJson<EtsyReceiptTransactionPage>/);
  });
});

import type { SupabaseServiceClient } from "@/lib/admin-api";
import { EtsyConfig, ETSY_API_BASE_URL, ETSY_EXPECTED_SHOP_NAME, etsyApiKeyHeader, getEtsyConfig } from "./config";
import { loadEtsyConnection, isConnectedEtsyRow, saveRefreshedEtsyTokens } from "./connection-store";
import { openSecret, sealSecret } from "./crypto";
import { refreshEtsyAccessToken } from "./oauth";
import type {
  EtsyDashboardListing,
  EtsyDashboardShop,
  EtsyListing,
  EtsyListingPage,
  EtsySelf,
  EtsyShop
} from "./types";

const TOKEN_REFRESH_WINDOW_MS = 5 * 60 * 1000;
const LISTING_PAGE_SIZE = 100;

export class EtsyNotConnectedError extends Error {}

class EtsyHttpError extends Error {
  constructor(public readonly status: number) {
    super(`Etsy API request failed with status ${status}.`);
  }
}

export function assertReadOnlyEtsyMethod(method: string) {
  if (method.toUpperCase() !== "GET") {
    throw new Error("Phase 1 Etsy application requests are read only.");
  }
}

export function shouldRefreshEtsyToken(expiresAt: string, now = Date.now()) {
  const expirationTime = new Date(expiresAt).getTime();
  return !Number.isFinite(expirationTime) || expirationTime <= now + TOKEN_REFRESH_WINDOW_MS;
}

async function requestEtsyJson<T>(
  path: string,
  accessToken: string,
  config: EtsyConfig,
  fetchImplementation: typeof fetch = fetch
) {
  assertReadOnlyEtsyMethod("GET");
  const response = await fetchImplementation(`${ETSY_API_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      "x-api-key": etsyApiKeyHeader(config)
    },
    cache: "no-store"
  });

  if (!response.ok) throw new EtsyHttpError(response.status);
  return (await response.json()) as T;
}

export function fetchEtsySelfWithToken(accessToken: string, config: EtsyConfig, fetchImplementation?: typeof fetch) {
  return requestEtsyJson<EtsySelf>("/users/me", accessToken, config, fetchImplementation);
}

export function fetchEtsyShopWithToken(
  shopId: number,
  accessToken: string,
  config: EtsyConfig,
  fetchImplementation?: typeof fetch
) {
  return requestEtsyJson<EtsyShop>(`/shops/${shopId}`, accessToken, config, fetchImplementation);
}

async function refreshStoredConnection(
  supabase: SupabaseServiceClient,
  encryptedRefreshToken: string,
  config: EtsyConfig,
  fetchImplementation: typeof fetch
) {
  const refreshToken = openSecret(encryptedRefreshToken, config.encryptionKey);
  const tokenSet = await refreshEtsyAccessToken(config, refreshToken, fetchImplementation);

  await saveRefreshedEtsyTokens(supabase, {
    encryptedAccessToken: sealSecret(tokenSet.accessToken, config.encryptionKey),
    encryptedRefreshToken: sealSecret(tokenSet.refreshToken, config.encryptionKey),
    tokenSet
  });

  return tokenSet.accessToken;
}

async function authorizedEtsyJson<T>(
  supabase: SupabaseServiceClient,
  path: string,
  fetchImplementation: typeof fetch = fetch
) {
  const config = getEtsyConfig();
  const connection = await loadEtsyConnection(supabase);
  if (!isConnectedEtsyRow(connection)) throw new EtsyNotConnectedError("Etsy is not connected.");

  const shouldRefresh = shouldRefreshEtsyToken(connection.access_token_expires_at);
  let accessToken = shouldRefresh
    ? await refreshStoredConnection(supabase, connection.refresh_token_encrypted, config, fetchImplementation)
    : openSecret(connection.access_token_encrypted, config.encryptionKey);

  try {
    return await requestEtsyJson<T>(path, accessToken, config, fetchImplementation);
  } catch (error) {
    if (!(error instanceof EtsyHttpError) || error.status !== 401 || shouldRefresh) throw error;
    accessToken = await refreshStoredConnection(supabase, connection.refresh_token_encrypted, config, fetchImplementation);
    return requestEtsyJson<T>(path, accessToken, config, fetchImplementation);
  }
}

export function normalizeEtsyListing(listing: EtsyListing): EtsyDashboardListing {
  const divisor = Number(listing.price?.divisor) > 0 ? Number(listing.price.divisor) : 100;
  const updatedTimestamp = Number(listing.updated_timestamp);

  return {
    listingId: Number(listing.listing_id),
    title: listing.title,
    state: listing.state,
    quantity: Number(listing.quantity) || 0,
    price: Number(listing.price?.amount || 0) / divisor,
    currencyCode: listing.price?.currency_code || "USD",
    url: listing.url,
    lastUpdated: Number.isFinite(updatedTimestamp)
      ? new Date(updatedTimestamp * 1000).toISOString()
      : new Date(0).toISOString()
  };
}

export async function collectAllActiveEtsyListings(
  fetchPage: (offset: number, limit: number) => Promise<EtsyListingPage>
) {
  const listings: EtsyDashboardListing[] = [];

  for (let offset = 0; ; offset += LISTING_PAGE_SIZE) {
    const page = await fetchPage(offset, LISTING_PAGE_SIZE);
    const results = Array.isArray(page.results) ? page.results : [];
    listings.push(...results.filter((listing) => listing.state === "active").map(normalizeEtsyListing));

    if (results.length < LISTING_PAGE_SIZE || offset + results.length >= Number(page.count || 0)) break;
  }

  return listings;
}

function normalizeEtsyShop(shop: EtsyShop): EtsyDashboardShop {
  return {
    shopId: Number(shop.shop_id),
    shopName: shop.shop_name,
    title: shop.title || null,
    currencyCode: shop.currency_code || null,
    isVacation: Boolean(shop.is_vacation),
    activeListingCount: Number(shop.listing_active_count) || 0,
    url: shop.url || null,
    reviewCount: Number(shop.review_count) || 0,
    reviewAverage: Number.isFinite(Number(shop.review_average)) ? Number(shop.review_average) : null
  };
}

export async function getEtsyDashboard(supabase: SupabaseServiceClient) {
  const connection = await loadEtsyConnection(supabase);
  if (!isConnectedEtsyRow(connection)) return { connected: false as const };

  const self = await authorizedEtsyJson<EtsySelf>(supabase, "/users/me");
  if (Number(self.user_id) !== Number(connection.etsy_user_id) || Number(self.shop_id) !== Number(connection.shop_id)) {
    throw new Error("The authenticated Etsy account no longer matches the saved connection.");
  }

  const shop = await authorizedEtsyJson<EtsyShop>(supabase, `/shops/${self.shop_id}`);
  if (shop.shop_name !== ETSY_EXPECTED_SHOP_NAME) {
    throw new Error("The authenticated Etsy shop is not BaseCampNorthPA.");
  }

  const listings = await collectAllActiveEtsyListings((offset, limit) =>
    authorizedEtsyJson<EtsyListingPage>(
      supabase,
      `/shops/${self.shop_id}/listings?state=active&limit=${limit}&offset=${offset}`
    )
  );

  return {
    connected: true as const,
    connectedAt: connection.connected_at,
    shop: normalizeEtsyShop(shop),
    listings
  };
}

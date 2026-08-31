import {
  ETSY_AUTHORIZATION_URL,
  ETSY_READ_ONLY_SCOPES,
  ETSY_TOKEN_URL,
  type EtsyConfig
} from "./config";
import type { EtsyTokenSet } from "./types";

type EtsyTokenPayload = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
};

function parseGrantedScopes(scope: unknown) {
  return typeof scope === "string" ? scope.split(/\s+/).filter(Boolean) : [];
}

function parseTokenPayload(payload: EtsyTokenPayload, fallbackRefreshToken?: string): EtsyTokenSet {
  const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
  const refreshToken = typeof payload.refresh_token === "string" ? payload.refresh_token : fallbackRefreshToken ?? "";
  const expiresIn = Number(payload.expires_in);

  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error("Etsy returned an invalid OAuth token response.");
  }

  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    grantedScopes: parseGrantedScopes(payload.scope)
  };
}

async function requestToken(
  fields: Record<string, string>,
  fallbackRefreshToken: string | undefined,
  fetchImplementation: typeof fetch
) {
  const response = await fetchImplementation(ETSY_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Etsy OAuth token request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as EtsyTokenPayload;
  return parseTokenPayload(payload, fallbackRefreshToken);
}

export function buildEtsyAuthorizationUrl(config: EtsyConfig, state: string, codeChallenge: string) {
  const url = new URL(ETSY_AUTHORIZATION_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    redirect_uri: config.redirectUri,
    scope: ETSY_READ_ONLY_SCOPES.join(" "),
    client_id: config.apiKey,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256"
  }).toString();
  return url.toString();
}

export function exchangeEtsyAuthorizationCode(
  config: EtsyConfig,
  code: string,
  codeVerifier: string,
  fetchImplementation: typeof fetch = fetch
) {
  return requestToken(
    {
      grant_type: "authorization_code",
      client_id: config.apiKey,
      redirect_uri: config.redirectUri,
      code,
      code_verifier: codeVerifier
    },
    undefined,
    fetchImplementation
  );
}
export function refreshEtsyAccessToken(
  config: EtsyConfig,
  refreshToken: string,
  fetchImplementation: typeof fetch = fetch
) {
  return requestToken(
    {
      grant_type: "refresh_token",
      client_id: config.apiKey,
      refresh_token: refreshToken
    },
    refreshToken,
    fetchImplementation
  );
}

import type { SupabaseServiceClient } from "@/lib/admin-api";
import { ETSY_CONNECTION_ID } from "./config";
import type { EtsyConnectionRow, EtsyTokenSet } from "./types";

export async function loadEtsyConnection(supabase: SupabaseServiceClient) {
  const { data, error } = await supabase
    .from("etsy_connections")
    .select("*")
    .eq("id", ETSY_CONNECTION_ID)
    .maybeSingle();

  if (error) throw new Error(`Could not load the Etsy connection: ${error.message}`);
  return (data as EtsyConnectionRow | null) ?? null;
}

export async function saveOAuthAttempt(
  supabase: SupabaseServiceClient,
  input: {
    adminUserId: string;
    stateHash: string;
    encryptedCodeVerifier: string;
    stateExpiresAt: string;
  }
) {
  const { error } = await supabase.from("etsy_connections").upsert(
    {
      id: ETSY_CONNECTION_ID,
      admin_user_id: input.adminUserId,
      oauth_state_hash: input.stateHash,
      oauth_code_verifier_encrypted: input.encryptedCodeVerifier,
      oauth_state_expires_at: input.stateExpiresAt
    },
    { onConflict: "id" }
  );

  if (error) throw new Error(`Could not save the Etsy authorization attempt: ${error.message}`);
}

export async function clearOAuthAttempt(supabase: SupabaseServiceClient) {
  const { error } = await supabase
    .from("etsy_connections")
    .update({
      oauth_state_hash: null,
      oauth_code_verifier_encrypted: null,
      oauth_state_expires_at: null
    })
    .eq("id", ETSY_CONNECTION_ID);

  if (error) throw new Error(`Could not clear the Etsy authorization attempt: ${error.message}`);
}

export async function saveConnectedEtsyShop(
  supabase: SupabaseServiceClient,
  input: {
    adminUserId: string;
    etsyUserId: number;
    shopId: number;
    shopName: string;
    encryptedAccessToken: string;
    encryptedRefreshToken: string;
    tokenSet: EtsyTokenSet;
  }
) {
  const { error } = await supabase.from("etsy_connections").upsert(
    {
      id: ETSY_CONNECTION_ID,
      admin_user_id: input.adminUserId,
      etsy_user_id: input.etsyUserId,
      shop_id: input.shopId,
      shop_name: input.shopName,
      access_token_encrypted: input.encryptedAccessToken,
      refresh_token_encrypted: input.encryptedRefreshToken,
      access_token_expires_at: input.tokenSet.expiresAt,
      granted_scopes: input.tokenSet.grantedScopes,
      oauth_state_hash: null,
      oauth_code_verifier_encrypted: null,
      oauth_state_expires_at: null,
      connected_at: new Date().toISOString()
    },
    { onConflict: "id" }
  );

  if (error) throw new Error(`Could not save the Etsy connection: ${error.message}`);
}

export async function saveRefreshedEtsyTokens(
  supabase: SupabaseServiceClient,
  input: {
    encryptedAccessToken: string;
    encryptedRefreshToken: string;
    tokenSet: EtsyTokenSet;
  }
) {
  const { error } = await supabase
    .from("etsy_connections")
    .update({
      access_token_encrypted: input.encryptedAccessToken,
      refresh_token_encrypted: input.encryptedRefreshToken,
      access_token_expires_at: input.tokenSet.expiresAt,
      granted_scopes: input.tokenSet.grantedScopes
    })
    .eq("id", ETSY_CONNECTION_ID);

  if (error) throw new Error(`Could not save refreshed Etsy credentials: ${error.message}`);
}

export function isConnectedEtsyRow(row: EtsyConnectionRow | null): row is EtsyConnectionRow & {
  etsy_user_id: number;
  shop_id: number;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  access_token_expires_at: string;
} {
  return Boolean(
    row?.etsy_user_id &&
    row.shop_id &&
    row.access_token_encrypted &&
    row.refresh_token_encrypted &&
    row.access_token_expires_at
  );
}

import { NextResponse } from "next/server";
import { ETSY_EXPECTED_SHOP_NAME, ETSY_REQUIRED_SCOPES, getEtsyConfig } from "@/lib/etsy/config";
import {
  clearOAuthAttempt,
  loadEtsyConnection,
  saveConnectedEtsyShop
} from "@/lib/etsy/connection-store";
import { oauthStateMatches, openSecret, sealSecret } from "@/lib/etsy/crypto";
import { fetchEtsySelfWithToken, fetchEtsyShopWithToken } from "@/lib/etsy/client";
import { exchangeEtsyAuthorizationCode } from "@/lib/etsy/oauth";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const runtime = "nodejs";

function redirectToEtsyAdmin(request: Request, status: "connected" | "error", reason?: string) {
  const redirectUrl = new URL("/admin/etsy", request.url);
  redirectUrl.searchParams.set("etsy", status);
  if (reason) redirectUrl.searchParams.set("reason", reason);
  return NextResponse.redirect(redirectUrl, 303);
}

export async function GET(request: Request) {
  let validAttempt = false;
  const supabase = getSupabaseServiceClient();

  try {
    const config = getEtsyConfig();
    const callbackUrl = new URL(request.url);
    const state = callbackUrl.searchParams.get("state") ?? "";
    const code = callbackUrl.searchParams.get("code") ?? "";
    const oauthError = callbackUrl.searchParams.get("error");
    const connection = await loadEtsyConnection(supabase);

    const stateExpiresAt = connection?.oauth_state_expires_at
      ? new Date(connection.oauth_state_expires_at).getTime()
      : Number.NaN;
    validAttempt = Boolean(
      state &&
      connection?.oauth_state_hash &&
      connection.oauth_code_verifier_encrypted &&
      Number.isFinite(stateExpiresAt) &&
      stateExpiresAt > Date.now() &&
      oauthStateMatches(state, connection.oauth_state_hash)
    );

    if (!validAttempt || !connection?.admin_user_id || !connection.oauth_code_verifier_encrypted) {
      return redirectToEtsyAdmin(request, "error", "invalid_or_expired_state");
    }

    if (oauthError) {
      await clearOAuthAttempt(supabase);
      return redirectToEtsyAdmin(request, "error", "authorization_declined");
    }

    if (!code) {
      await clearOAuthAttempt(supabase);
      return redirectToEtsyAdmin(request, "error", "missing_code");
    }

    const { data: admin, error: adminError } = await supabase
      .from("bcn_admins")
      .select("user_id")
      .eq("user_id", connection.admin_user_id)
      .maybeSingle();
    if (adminError || !admin) throw new Error("The initiating BCN admin is no longer authorized.");

    const codeVerifier = openSecret(connection.oauth_code_verifier_encrypted, config.encryptionKey);
    const tokenSet = await exchangeEtsyAuthorizationCode(config, code, codeVerifier);
    const missingScope = ETSY_REQUIRED_SCOPES.find((scope) => !tokenSet.grantedScopes.includes(scope));
    if (missingScope) throw new Error("Etsy did not grant every required BCN Etsy scope.");

    const self = await fetchEtsySelfWithToken(tokenSet.accessToken, config);
    const shop = await fetchEtsyShopWithToken(Number(self.shop_id), tokenSet.accessToken, config);
    if (shop.shop_name !== ETSY_EXPECTED_SHOP_NAME) {
      await clearOAuthAttempt(supabase);
      return redirectToEtsyAdmin(request, "error", "wrong_shop");
    }

    await saveConnectedEtsyShop(supabase, {
      adminUserId: connection.admin_user_id,
      etsyUserId: Number(self.user_id),
      shopId: Number(self.shop_id),
      shopName: shop.shop_name,
      encryptedAccessToken: sealSecret(tokenSet.accessToken, config.encryptionKey),
      encryptedRefreshToken: sealSecret(tokenSet.refreshToken, config.encryptionKey),
      tokenSet
    });

    return redirectToEtsyAdmin(request, "connected");
  } catch (error) {
    console.error("Etsy authorization callback failed:", error instanceof Error ? error.message : "Unknown error");
    if (validAttempt) {
      try {
        await clearOAuthAttempt(supabase);
      } catch {
        // Preserve the original callback failure and avoid exposing storage details to the browser.
      }
    }
    return redirectToEtsyAdmin(request, "error", "callback_failed");
  }
}

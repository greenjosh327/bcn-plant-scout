import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/admin-api";
import { getEtsyConfig } from "@/lib/etsy/config";
import { saveOAuthAttempt } from "@/lib/etsy/connection-store";
import {
  createOAuthState,
  createPkceChallenge,
  createPkceVerifier,
  hashOAuthState,
  sealSecret
} from "@/lib/etsy/crypto";
import { buildEtsyAuthorizationUrl } from "@/lib/etsy/oauth";
import { getSupabaseServiceClient } from "@/lib/supabase-service";

export const runtime = "nodejs";

const OAUTH_ATTEMPT_LIFETIME_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();
    const admin = await requireAdmin(request, supabase);
    if ("error" in admin) {
      const message = typeof admin.error === "string" ? admin.error : "Admin authorization failed.";
      return jsonError(message, admin.status);
    }

    const config = getEtsyConfig();
    const state = createOAuthState();
    const codeVerifier = createPkceVerifier();

    await saveOAuthAttempt(supabase, {
      adminUserId: admin.user.id,
      stateHash: hashOAuthState(state),
      encryptedCodeVerifier: sealSecret(codeVerifier, config.encryptionKey),
      stateExpiresAt: new Date(Date.now() + OAUTH_ATTEMPT_LIFETIME_MS).toISOString()
    });

    return NextResponse.json(
      { authorizeUrl: buildEtsyAuthorizationUrl(config, state, createPkceChallenge(codeVerifier)) },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    console.error("Etsy authorization could not start:", error instanceof Error ? error.message : "Unknown error");
    return jsonError("Etsy authorization could not start. Check the server configuration and try again.", 500);
  }
}

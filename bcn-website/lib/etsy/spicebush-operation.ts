import { createHash, timingSafeEqual } from "crypto";
import type { SupabaseServiceClient } from "@/lib/admin-api";
import { SpicebushDraftError } from "./spicebush-draft";

const OPERATION_ID = "spicebush-2026-draft";
export const SPICEBUSH_OPERATION_HEADER = "x-bcn-draft-operation";

type OperationRow = {
  id: string;
  token_hash: string | null;
  status: "approved" | "creating" | "created" | "uploading" | "complete" | "failed";
  listing_id: number | null;
  image_ranks: number[];
  last_error: string | null;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function hashesMatch(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

async function loadOperation(supabase: SupabaseServiceClient) {
  const { data, error } = await supabase
    .from("etsy_one_time_draft_operations")
    .select("id, token_hash, status, listing_id, image_ranks, last_error")
    .eq("id", OPERATION_ID)
    .maybeSingle();
  if (error) throw new SpicebushDraftError(`The one-time Spicebush operation could not be loaded: ${error.message}`, 500);
  return data as OperationRow | null;
}

export async function authorizeSpicebushOperation(request: Request, supabase: SupabaseServiceClient) {
  const token = request.headers.get(SPICEBUSH_OPERATION_HEADER)?.trim() || "";
  if (!token) throw new SpicebushDraftError("The one-time Spicebush authorization is missing.", 401);
  const operation = await loadOperation(supabase);
  const tokenHash = hashToken(token);
  if (!operation?.token_hash || !hashesMatch(operation.token_hash, tokenHash)) {
    throw new SpicebushDraftError("The one-time Spicebush authorization is invalid or expired.", 401);
  }
  return { operation, tokenHash };
}

export async function claimSpicebushOperation(
  supabase: SupabaseServiceClient,
  authorization: Awaited<ReturnType<typeof authorizeSpicebushOperation>>
) {
  const { data, error } = await supabase
    .from("etsy_one_time_draft_operations")
    .update({ status: "creating", updated_at: new Date().toISOString(), last_error: null })
    .eq("id", OPERATION_ID)
    .eq("token_hash", authorization.tokenHash)
    .eq("status", "approved")
    .select("id")
    .maybeSingle();
  if (error) throw new SpicebushDraftError(`The one-time operation could not be claimed: ${error.message}`, 500);
  if (!data) throw new SpicebushDraftError("The one-time operation has already been claimed or stopped.", 409);
}

export async function recordSpicebushCreated(
  supabase: SupabaseServiceClient,
  authorization: Awaited<ReturnType<typeof authorizeSpicebushOperation>>,
  listingId: number
) {
  const { error } = await supabase
    .from("etsy_one_time_draft_operations")
    .update({ listing_id: listingId, status: "created", updated_at: new Date().toISOString(), last_error: null })
    .eq("id", OPERATION_ID)
    .eq("token_hash", authorization.tokenHash)
    .eq("status", "creating");
  if (error) throw new SpicebushDraftError(`The new draft audit record could not be saved: ${error.message}`, 500, listingId);
}

export async function recordSpicebushImage(
  supabase: SupabaseServiceClient,
  authorization: Awaited<ReturnType<typeof authorizeSpicebushOperation>>,
  listingId: number,
  rank: number
) {
  const current = await loadOperation(supabase);
  if (!current || Number(current.listing_id) !== listingId) {
    throw new SpicebushDraftError("The one-time operation does not own this Spicebush draft.", 409, listingId);
  }
  const imageRanks = [...new Set([...(current.image_ranks || []).map(Number), rank])].sort();
  const { error } = await supabase
    .from("etsy_one_time_draft_operations")
    .update({ image_ranks: imageRanks, status: "uploading", updated_at: new Date().toISOString(), last_error: null })
    .eq("id", OPERATION_ID)
    .eq("token_hash", authorization.tokenHash)
    .eq("listing_id", listingId);
  if (error) throw new SpicebushDraftError(`The image audit record could not be saved: ${error.message}`, 500, listingId);
}

export async function completeSpicebushOperation(
  supabase: SupabaseServiceClient,
  authorization: Awaited<ReturnType<typeof authorizeSpicebushOperation>>,
  listingId: number
) {
  const timestamp = new Date().toISOString();
  const { data, error } = await supabase
    .from("etsy_one_time_draft_operations")
    .update({
      status: "complete",
      token_hash: null,
      completed_at: timestamp,
      updated_at: timestamp,
      last_error: null
    })
    .eq("id", OPERATION_ID)
    .eq("token_hash", authorization.tokenHash)
    .eq("listing_id", listingId)
    .contains("image_ranks", [1, 2, 3, 4])
    .select("id")
    .maybeSingle();
  if (error) throw new SpicebushDraftError(`The one-time operation could not be finalized: ${error.message}`, 500, listingId);
  if (!data) throw new SpicebushDraftError("All four verified images are required before finalizing the operation.", 409, listingId);
}

export async function recordSpicebushFailure(
  supabase: SupabaseServiceClient,
  authorization: Awaited<ReturnType<typeof authorizeSpicebushOperation>> | null,
  error: unknown
) {
  if (!authorization) return;
  const listingId = error instanceof SpicebushDraftError ? error.listingId : null;
  const message = (error instanceof Error ? error.message : "Unknown error").replace(/\s+/g, " ").slice(0, 500);
  await supabase
    .from("etsy_one_time_draft_operations")
    .update({
      status: listingId ? "created" : "failed",
      ...(listingId ? { listing_id: listingId } : {}),
      last_error: message,
      updated_at: new Date().toISOString()
    })
    .eq("id", OPERATION_ID)
    .eq("token_hash", authorization.tokenHash);
}

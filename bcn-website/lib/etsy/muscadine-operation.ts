import { createHash, timingSafeEqual } from "crypto";
import type { SupabaseServiceClient } from "@/lib/admin-api";
import { requireAdmin } from "@/lib/admin-api";
import { MuscadineDraftError } from "./muscadine-draft";

const OPERATION_ID = "muscadine-2026-draft";
const OPERATION_HEADER = "x-bcn-draft-operation";

export type MuscadineOperationRow = {
  id: string;
  token_hash: string | null;
  status: "approved" | "creating" | "created" | "uploading" | "complete" | "failed";
  listing_id: number | null;
  image_ranks: number[];
  last_error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type MuscadineRequestAuthorization =
  | { mode: "admin"; adminUserId: string }
  | { mode: "operation"; operation: MuscadineOperationRow; tokenHash: string };

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
    .select("id, token_hash, status, listing_id, image_ranks, last_error, created_at, updated_at, completed_at")
    .eq("id", OPERATION_ID)
    .maybeSingle();
  if (error) throw new MuscadineDraftError(`The one-time Etsy operation could not be loaded: ${error.message}`, 500);
  return data as MuscadineOperationRow | null;
}

export async function authorizeMuscadineRequest(
  request: Request,
  supabase: SupabaseServiceClient
): Promise<MuscadineRequestAuthorization> {
  const token = request.headers.get(OPERATION_HEADER)?.trim() || "";
  if (token) {
    const operation = await loadOperation(supabase);
    const tokenHash = hashToken(token);
    if (!operation?.token_hash || !hashesMatch(operation.token_hash, tokenHash)) {
      throw new MuscadineDraftError("The one-time Etsy draft authorization is invalid or has expired.", 401);
    }
    return { mode: "operation", operation, tokenHash };
  }

  const admin = await requireAdmin(request, supabase);
  if ("error" in admin) throw new MuscadineDraftError(admin.error || "Admin authorization failed.", admin.status);
  return { mode: "admin", adminUserId: admin.user.id };
}

export async function claimMuscadineOperation(
  supabase: SupabaseServiceClient,
  authorization: MuscadineRequestAuthorization
) {
  if (authorization.mode === "admin") return null;
  const { data, error } = await supabase
    .from("etsy_one_time_draft_operations")
    .update({ status: "creating", updated_at: new Date().toISOString(), last_error: null })
    .eq("id", OPERATION_ID)
    .eq("token_hash", authorization.tokenHash)
    .eq("status", "approved")
    .select("id, token_hash, status, listing_id, image_ranks, last_error, created_at, updated_at, completed_at")
    .maybeSingle();
  if (error) throw new MuscadineDraftError(`The one-time Etsy operation could not be claimed: ${error.message}`, 500);
  if (data) return data as MuscadineOperationRow;

  const current = await loadOperation(supabase);
  if (current?.listing_id && ["created", "uploading", "complete"].includes(current.status)) return current;
  throw new MuscadineDraftError("The one-time Etsy draft operation has already been claimed or stopped.", 409);
}

export async function recordMuscadineDraftCreated(
  supabase: SupabaseServiceClient,
  authorization: MuscadineRequestAuthorization,
  listingId: number
) {
  if (authorization.mode === "admin") return;
  const { error } = await supabase
    .from("etsy_one_time_draft_operations")
    .update({ listing_id: listingId, status: "created", updated_at: new Date().toISOString(), last_error: null })
    .eq("id", OPERATION_ID)
    .eq("token_hash", authorization.tokenHash)
    .eq("status", "creating");
  if (error) throw new MuscadineDraftError(`The new Etsy draft audit record could not be saved: ${error.message}`, 500, listingId);
}

export async function recordMuscadineImageUploaded(
  supabase: SupabaseServiceClient,
  authorization: MuscadineRequestAuthorization,
  listingId: number,
  rank: number
) {
  if (authorization.mode === "admin") return;
  const current = await loadOperation(supabase);
  if (!current || Number(current.listing_id) !== listingId) {
    throw new MuscadineDraftError("The one-time operation does not own this Etsy draft.", 409, listingId);
  }
  const imageRanks = [...new Set([...(current.image_ranks || []).map(Number), rank])].sort();
  const { error } = await supabase
    .from("etsy_one_time_draft_operations")
    .update({ image_ranks: imageRanks, status: "uploading", updated_at: new Date().toISOString(), last_error: null })
    .eq("id", OPERATION_ID)
    .eq("token_hash", authorization.tokenHash)
    .eq("listing_id", listingId);
  if (error) throw new MuscadineDraftError(`The Etsy image audit record could not be saved: ${error.message}`, 500, listingId);
}

export async function completeMuscadineOperation(
  supabase: SupabaseServiceClient,
  authorization: MuscadineRequestAuthorization,
  listingId: number
) {
  if (authorization.mode === "admin") return;
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
    .contains("image_ranks", [1, 2, 3])
    .select("id")
    .maybeSingle();
  if (error) throw new MuscadineDraftError(`The Etsy draft operation could not be finalized: ${error.message}`, 500, listingId);
  if (!data) throw new MuscadineDraftError("All three verified images are required before finalizing the operation.", 409, listingId);
}

export async function recordMuscadineOperationFailure(
  supabase: SupabaseServiceClient,
  authorization: MuscadineRequestAuthorization,
  error: unknown
) {
  if (authorization.mode === "admin") return;
  const listingId = error instanceof MuscadineDraftError ? error.listingId : null;
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

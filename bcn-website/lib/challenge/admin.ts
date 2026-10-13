import { requireAdmin } from "../admin-api";
import { getSupabaseServiceClient } from "../supabase-service";
import { ChallengeError } from "./server";
export async function challengeAdmin(request: Request) {
  if (!request.headers.get("authorization")?.startsWith("Bearer ")) throw new ChallengeError("Admin session is missing.", 401);
  const db = getSupabaseServiceClient();
  const admin = await requireAdmin(request, db);
  if ("error" in admin) throw new ChallengeError(admin.error ?? "Admin access required.", admin.status ?? 403);
  return { db, user: admin.user };
}

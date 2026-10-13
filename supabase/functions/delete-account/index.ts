import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.108.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

function compactPaths(paths: Array<string | null>) {
  return Array.from(
    new Set(paths.map((path) => path?.trim()).filter((path): path is string => Boolean(path)))
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token || token === authHeader) {
    return jsonResponse({ error: "Missing authorization token" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Account deletion is not configured" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData.user;

  if (userError || !user) {
    return jsonResponse({ error: "Invalid session" }, 401);
  }

  const userId = user.id;

  try {
    const { data: observationRows, error: observationsError } = await admin
      .from("observations")
      .select("id, photo_storage_path")
      .eq("user_id", userId);

    if (observationsError) {
      throw observationsError;
    }

    const { data: photoRows, error: photosError } = await admin
      .from("observation_photos")
      .select("id, storage_path")
      .eq("user_id", userId);

    if (photosError) {
      throw photosError;
    }

    // Contest is optional. Missing-table errors are expected before its migration.
    // All other errors stop deletion so contest contact information cannot be orphaned silently.
    const { error: challengeError } = await admin
      .from("scout_challenge_progress")
      .select("id")
      .eq("user_id", userId);
    const challengeInstalled = !challengeError;
    if (challengeError && !["42P01", "PGRST205"].includes(challengeError.code)) {
      throw challengeError;
    }
    if (challengeInstalled) {
      const { error } = await admin.rpc("scout_challenge_account_cleanup", { p_user: userId });
      if (error) throw error;
    }

    const storagePaths = compactPaths([
      ...(observationRows ?? []).map((row) => row.photo_storage_path),
      ...(photoRows ?? []).map((row) => row.storage_path)
    ]);

    if (storagePaths.length > 0) {
      const { error: storageError } = await admin.storage
        .from("plant-photos")
        .remove(storagePaths);

      if (storageError) {
        throw storageError;
      }
    }

    const { error: deletePhotosError } = await admin
      .from("observation_photos")
      .delete()
      .eq("user_id", userId);

    if (deletePhotosError) {
      throw deletePhotosError;
    }

    const { error: deleteObservationsError } = await admin
      .from("observations")
      .delete()
      .eq("user_id", userId);

    if (deleteObservationsError) {
      throw deleteObservationsError;
    }

    const { error: deleteProfileError } = await admin.from("profiles").delete().eq("id", userId);

    if (deleteProfileError) {
      throw deleteProfileError;
    }

    const { error: deleteAdminError } = await admin
      .from("bcn_admins")
      .delete()
      .eq("user_id", userId);

    if (deleteAdminError) {
      throw deleteAdminError;
    }

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);

    if (deleteUserError) {
      throw deleteUserError;
    }

    return jsonResponse({
      deleted: true,
      observationsDeleted: observationRows?.length ?? 0,
      photoRowsDeleted: photoRows?.length ?? 0,
      storageObjectsDeleted: storagePaths.length
    });
  } catch (error) {
    console.error("delete-account failed", error);
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Unable to delete account"
      },
      500
    );
  }
});

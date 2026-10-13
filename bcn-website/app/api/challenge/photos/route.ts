import { challengeResponse } from "@/lib/challenge/http";
export const runtime = "nodejs";
export async function POST() { return challengeResponse({ error: "Giveaway progress uses saved plant records. Contest photo uploads are not accepted." }, 403); }

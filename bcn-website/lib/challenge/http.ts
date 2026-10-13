import { NextResponse } from "next/server";
import { ChallengeError } from "./server";
export function challengeResponse(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
export function challengeFailure(error: unknown) {
  return challengeResponse({ error: error instanceof ChallengeError ? error.message : "Challenge service is unavailable." }, error instanceof ChallengeError ? error.status : 503);
}

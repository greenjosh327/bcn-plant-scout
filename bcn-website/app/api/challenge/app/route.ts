import { appAction } from "@/lib/challenge/server";
import { challengeFailure, challengeResponse } from "@/lib/challenge/http";
export const runtime = "nodejs";
export async function POST(request: Request) { try { return challengeResponse(await appAction(request)); } catch (error) { return challengeFailure(error); } }

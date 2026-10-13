import { challengeFailure, challengeResponse } from "@/lib/challenge/http";
import { previewChallenge, submitPreview } from "@/lib/challenge/preview-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { try { return challengeResponse(await previewChallenge(request)); } catch (error) { return challengeFailure(error); } }
export async function POST(request: Request) { try { return challengeResponse(await submitPreview(request)); } catch (error) { return challengeFailure(error); } }

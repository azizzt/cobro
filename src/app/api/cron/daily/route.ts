import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual, createHash } from "node:crypto";
import { runDaily } from "@/lib/jobs";

export const maxDuration = 60;

/**
 * Cron diario. Vercel Cron envía "Authorization: Bearer <CRON_SECRET>".
 * También se puede llamar desde GitHub Actions o cron-job.org con el mismo header.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  const h = (s: string) => createHash("sha256").update(s).digest();
  if (!secret || !timingSafeEqual(h(auth), h(`Bearer ${secret}`))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const summary = await runDaily();
  return NextResponse.json({ ok: true, ...summary });
}

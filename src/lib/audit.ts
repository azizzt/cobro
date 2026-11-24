import "server-only";
import { db, t } from "@/db";

export async function audit(
  actor: "admin" | "participant" | "system",
  action: string,
  opts: { participantId?: number | null; entity?: string; entityId?: number; details?: unknown } = {},
) {
  try {
    await db.insert(t.auditLog).values({
      actor,
      action,
      participantId: opts.participantId ?? null,
      entity: opts.entity,
      entityId: opts.entityId,
      details: opts.details ?? null,
    });
  } catch (e) {
    console.error("audit failed", e);
  }
}

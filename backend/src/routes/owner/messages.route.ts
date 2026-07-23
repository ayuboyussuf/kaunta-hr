/**
 * Owner inbox. Notifications (appeals, system messages) are written by the
 * backend into owner_notifications and read here.
 *
 * GET  /api/owner/messages          → list messages + unread count.
 * POST /api/owner/messages/read     → mark all as read.
 * POST /api/owner/messages/:id/read → mark one as read.
 *
 * Org-scoped via req.owner.orgId (service client).
 */
import { Router } from "express";
import { z } from "zod";
import { requireOwner } from "../../lib/auth";
import { getServiceClient } from "../../lib/supabase";

const router = Router();

const SELECT = "id, kind, title, body, link, ref_id, read_at, created_at";

router.get("/", requireOwner, async (req, res) => {
  const db = getServiceClient();
  const { data, error } = await db
    .from("owner_notifications")
    .select(SELECT)
    .eq("org_id", req.owner!.orgId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return res.status(500).json({ error: error.message });

  const messages = data ?? [];
  const unread = messages.filter((m) => !m.read_at).length;
  res.json({ messages, unread });
});

router.post("/read", requireOwner, async (req, res) => {
  const db = getServiceClient();
  const { error } = await db
    .from("owner_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("org_id", req.owner!.orgId)
    .is("read_at", null);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

router.post("/:id/read", requireOwner, async (req, res) => {
  const idParse = z.string().uuid().safeParse(req.params.id);
  if (!idParse.success) return res.status(400).json({ error: "invalid id" });

  const db = getServiceClient();
  const { data, error } = await db
    .from("owner_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", idParse.data)
    .eq("org_id", req.owner!.orgId)
    .select("id")
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: "message not found" });
  res.json({ ok: true });
});

export default { basePath: "/api/owner/messages", router };

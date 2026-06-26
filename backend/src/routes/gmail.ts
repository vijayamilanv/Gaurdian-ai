/**
 * Sub-Phase E: Gmail Sync
 *
 * OAuth2 flow:
 *   1. GET  /api/gmail/auth-url      → returns Google consent URL
 *   2. GET  /api/gmail/callback?code → exchanges code for tokens, stores encrypted
 *   3. POST /api/gmail/sync          → fetches recent placement emails, classifies, saves
 *   4. GET  /api/gmail/inbox         → returns saved EmailLog rows
 *   5. GET  /api/gmail/status        → is connected?
 *   6. DELETE /api/gmail/disconnect  → revoke + delete credential
 *
 * Security:
 *   - Refresh + access tokens encrypted at rest with AES-256-GCM (GMAIL_ENCRYPTION_KEY)
 *   - Only gmail.readonly scope requested
 *   - State param validated to prevent CSRF on callback
 *   - Raw tokens never logged
 */

import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";
import crypto from "crypto";

// ── Config ────────────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const GOOGLE_REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI  ?? "http://localhost:3000/api/gmail/callback";
const ENCRYPTION_KEY_HEX   = process.env.GMAIL_ENCRYPTION_KEY ?? "";
const GMAIL_SCOPE          = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email";

// Keyword classifier — subjects/senders matching these get labelled
const LABEL_RULES: { label: string; patterns: RegExp[] }[] = [
  { label: "OA",     patterns: [/online.?test|assessment|hackerrank|codility|mettl|aptitude.?test/i] },
  { label: "OL",     patterns: [/offer.?letter|congratulations.*join|selected.*position|pleased.?to.?offer/i] },
  { label: "REJECT", patterns: [/not.?moving.?forward|regret|unfortunately|not.?selected|not.?proceed/i] },
  { label: "GHOST",  patterns: [] }, // assigned by age heuristic in sync
  { label: "INFO",   patterns: [/interview.?schedule|interview.?invite|round|shortlist/i] },
];

const PLACEMENT_KEYWORDS = /job|offer|placement|interview|internship|hiring|recruit|campus|drive|shortlist|assessment|oA|rejection/i;

// ── Crypto helpers ────────────────────────────────────────────────────────────
function getKey(): Buffer {
  if (!ENCRYPTION_KEY_HEX || ENCRYPTION_KEY_HEX.length < 64) {
    throw new Error("GMAIL_ENCRYPTION_KEY must be a 32-byte (64 hex chars) key in .env");
  }
  return Buffer.from(ENCRYPTION_KEY_HEX, "hex");
}

function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), enc.toString("hex"), tag.toString("hex")].join(".");
}

function decrypt(ciphertext: string): string {
  const [ivHex, encHex, tagHex] = ciphertext.split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(Buffer.from(encHex, "hex")).toString("utf8") + decipher.final("utf8");
}

// ── Gmail API helpers ─────────────────────────────────────────────────────────
async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

async function gmailGet(path: string, accessToken: string): Promise<any> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Gmail API error: ${res.status} ${path}`);
  return res.json();
}

function classifyEmail(subject: string, sender: string): string {
  const text = `${subject} ${sender}`;
  for (const rule of LABEL_RULES) {
    if (rule.patterns.length && rule.patterns.some((p) => p.test(text))) return rule.label;
  }
  return "INFO";
}

function base64Decode(s: string): string {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function extractBody(payload: any, maxLen = 2000): string {
  if (!payload) return "";
  // Try plain text part first
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return base64Decode(part.body.data).slice(0, maxLen);
      }
    }
  }
  if (payload.body?.data) return base64Decode(payload.body.data).slice(0, maxLen);
  return "";
}

// ── In-memory state store (simple CSRF protection) ───────────────────────────
const pendingStates = new Set<string>();

// ── Route plugin ──────────────────────────────────────────────────────────────
export default async function gmailRoutes(fastify: FastifyInstance) {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  // ── GET /api/gmail/status ─────────────────────────────────────────────────
  server.get("/status", { preValidation: [server.authenticate] }, async (request, reply) => {
    const { id: userId } = request.user as { id: string };
    const cred = await server.db.emailSyncCredential.findUnique({ where: { userId } });
    return reply.send({
      connected: !!cred,
      email: cred?.email ?? null,
      lastSyncedAt: cred?.lastSyncedAt?.toISOString() ?? null,
    });
  });

  // ── GET /api/gmail/auth-url ───────────────────────────────────────────────
  server.get("/auth-url", { preValidation: [server.authenticate] }, async (request, reply) => {
    if (!GOOGLE_CLIENT_ID) return reply.status(503).send({ message: "GOOGLE_CLIENT_ID not configured" } as any);
    const { id: userId } = request.user as { id: string };

    const stateToken = crypto.randomBytes(16).toString("hex");
    const state      = `${stateToken}:${userId}`; // validated in callback
    pendingStates.add(stateToken);
    setTimeout(() => pendingStates.delete(stateToken), 10 * 60 * 1000);

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id",     GOOGLE_CLIENT_ID);
    url.searchParams.set("redirect_uri",  GOOGLE_REDIRECT_URI);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope",         GMAIL_SCOPE);
    url.searchParams.set("access_type",   "offline");
    url.searchParams.set("prompt",        "consent");
    url.searchParams.set("state",         state);

    return reply.send({ url: url.toString() });
  });

  // ── GET /api/gmail/callback?code=&state= ─────────────────────────────────
  // This endpoint is called by Google after the user grants permission.
  // We store the userId in the state by convention: state=<randomHex>:<userId>
  server.get(
    "/callback",
    {
      schema: {
        querystring: z.object({ code: z.string(), state: z.string(), error: z.string().optional() }),
      },
    },
    async (request, reply) => {
      const { code, state, error } = request.query;
      const FRONTEND = process.env.FRONTEND_URL ?? "http://localhost:5173";

      if (error) return reply.redirect(`${FRONTEND}/gmail?error=${encodeURIComponent(error)}`);

      // Validate state (format: "<randomHex>:<userId>")
      const [stateToken, userId] = state.split(":");
      if (!stateToken || !userId || !pendingStates.has(stateToken)) {
        return reply.redirect(`${FRONTEND}/gmail?error=invalid_state`);
      }
      pendingStates.delete(stateToken);

      // Exchange code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id:     GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri:  GOOGLE_REDIRECT_URI,
          grant_type:    "authorization_code",
        }),
      });

      if (!tokenRes.ok) return reply.redirect(`${FRONTEND}/gmail?error=token_exchange_failed`);

      const tokens = await tokenRes.json() as {
        access_token: string; refresh_token?: string;
        expires_in: number; scope: string;
      };

      if (!tokens.refresh_token) return reply.redirect(`${FRONTEND}/gmail?error=no_refresh_token`);

      // Fetch user's email address
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const userInfo = await userInfoRes.json() as { email: string };

      // Encrypt and upsert credential
      try {
        await server.db.emailSyncCredential.upsert({
          where:  { userId },
          create: {
            userId,
            email:           userInfo.email,
            accessTokenEnc:  encrypt(tokens.access_token),
            refreshTokenEnc: encrypt(tokens.refresh_token),
            tokenExpiry:     new Date(Date.now() + tokens.expires_in * 1000),
            scope:           tokens.scope,
          },
          update: {
            email:           userInfo.email,
            accessTokenEnc:  encrypt(tokens.access_token),
            refreshTokenEnc: encrypt(tokens.refresh_token),
            tokenExpiry:     new Date(Date.now() + tokens.expires_in * 1000),
            scope:           tokens.scope,
          },
        });
      } catch (err) {
        fastify.log.warn({ err }, "Encryption/DB error during Gmail callback — GMAIL_ENCRYPTION_KEY may not be set");
        return reply.redirect(`${FRONTEND}/gmail?error=encryption_not_configured`);
      }

      return reply.redirect(`${FRONTEND}/gmail?connected=1`);
    }
  );

  // ── POST /api/gmail/sync ──────────────────────────────────────────────────
  server.post("/sync", { preValidation: [server.authenticate] }, async (request, reply) => {
    const { id: userId } = request.user as { id: string };
    const cred = await server.db.emailSyncCredential.findUnique({ where: { userId } });
    if (!cred) return reply.status(400).send({ message: "Gmail not connected" } as any);

    // Refresh access token if expired or missing
    let accessToken: string;
    try {
      const refreshToken = decrypt(cred.refreshTokenEnc);
      if (!cred.accessTokenEnc || !cred.tokenExpiry || cred.tokenExpiry < new Date()) {
        const refreshed = await refreshAccessToken(refreshToken);
        accessToken = refreshed.access_token;
        await server.db.emailSyncCredential.update({
          where: { userId },
          data:  {
            accessTokenEnc: encrypt(accessToken),
            tokenExpiry:    new Date(Date.now() + refreshed.expires_in * 1000),
          },
        });
      } else {
        accessToken = decrypt(cred.accessTokenEnc!);
      }
    } catch (err) {
      return reply.status(400).send({ message: "Token error — please reconnect Gmail" } as any);
    }

    // Fetch message IDs matching placement keywords (last 60 days)
    const afterDate = Math.floor((Date.now() - 60 * 86400000) / 1000);
    const query = `(job OR offer OR placement OR interview OR internship OR hiring OR recruitment OR campus OR drive OR shortlist OR assessment OR rejection) after:${afterDate}`;
    const listData = await gmailGet(
      `/users/me/messages?maxResults=50&q=${encodeURIComponent(query)}`,
      accessToken
    ).catch(() => ({ messages: [] }));

    const messages: { id: string }[] = listData.messages ?? [];

    // Get existing gmail IDs to skip
    const existing = await server.db.emailLog.findMany({
      where: { userId },
      select: { gmailMessageId: true },
    });
    const existingIds = new Set(existing.map((e) => e.gmailMessageId));

    let synced = 0;
    for (const msg of messages) {
      if (existingIds.has(msg.id)) continue;
      try {
        const full = await gmailGet(`/users/me/messages/${msg.id}?format=full`, accessToken);
        const headers: { name: string; value: string }[] = full.payload?.headers ?? [];
        const getHeader = (n: string) => headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? "";

        const subject    = getHeader("Subject");
        const sender     = getHeader("From");
        const dateStr    = getHeader("Date");
        const receivedAt = dateStr ? new Date(dateStr) : null;
        const snippet    = full.snippet ?? "";
        const body       = extractBody(full.payload);

        // Keyword gate: skip emails not related to placements
        if (!PLACEMENT_KEYWORDS.test(`${subject} ${sender} ${snippet}`)) continue;

        const label = classifyEmail(subject, sender);
        const isImportant = ["OA", "OL"].includes(label);

        await server.db.emailLog.create({
          data: {
            userId, gmailMessageId: msg.id,
            sender, subject, snippet, body,
            receivedAt, isImportant, label,
            classifiedBy: "keyword",
          },
        });
        synced++;
      } catch { /* skip individual message errors */ }
    }

    // Update lastSyncedAt
    await server.db.emailSyncCredential.update({
      where: { userId },
      data:  { lastSyncedAt: new Date() },
    });

    return reply.send({ synced, total: messages.length });
  });

  // ── GET /api/gmail/inbox ──────────────────────────────────────────────────
  server.get(
    "/inbox",
    {
      preValidation: [server.authenticate],
      schema: {
        querystring: z.object({
          label:  z.string().optional(),
          limit:  z.coerce.number().min(1).max(100).default(50),
          offset: z.coerce.number().min(0).default(0),
        }),
      },
    },
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const { label, limit, offset } = request.query;

      const emails = await server.db.emailLog.findMany({
        where: { userId, ...(label ? { label } : {}) },
        orderBy: { receivedAt: "desc" },
        take: limit,
        skip: offset,
      });

      const total = await server.db.emailLog.count({
        where: { userId, ...(label ? { label } : {}) },
      });

      return reply.send({
        total,
        emails: emails.map((e) => ({
          id:            e.id,
          gmailMessageId: e.gmailMessageId,
          sender:        e.sender,
          subject:       e.subject,
          snippet:       e.snippet,
          body:          e.body,
          label:         e.label,
          isImportant:   e.isImportant,
          receivedAt:    e.receivedAt?.toISOString() ?? null,
        })),
      });
    }
  );

  // ── DELETE /api/gmail/disconnect ──────────────────────────────────────────
  server.delete("/disconnect", { preValidation: [server.authenticate] }, async (request, reply) => {
    const { id: userId } = request.user as { id: string };
    const cred = await server.db.emailSyncCredential.findUnique({ where: { userId } });
    if (!cred) return reply.send({ ok: true });

    // Best-effort revoke
    try {
      const accessToken = cred.accessTokenEnc ? decrypt(cred.accessTokenEnc) : null;
      if (accessToken) {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, { method: "POST" });
      }
    } catch { /* ignore revoke errors */ }

    await server.db.emailSyncCredential.delete({ where: { userId } });
    return reply.send({ ok: true });
  });
}

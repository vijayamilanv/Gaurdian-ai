/**
 * Phase 6a: Health & Diet Routes
 *
 * Security model:
 *   - Consent gate: HealthConsent MUST exist before any data is written
 *   - All sensitive fields (dataEnc, metricsEnc, planEnc) are AES-256-GCM encrypted
 *   - Raw health text is encrypted immediately on receipt — never stored in plaintext
 *   - Raw text is never returned in API responses
 *   - HEALTH_ENCRYPTION_KEY (32-byte hex) required in backend/.env
 *
 * Routes:
 *   GET    /api/health/consent        → check consent status
 *   POST   /api/health/consent        → grant consent
 *   DELETE /api/health/consent        → revoke consent + delete all health data
 *
 *   POST   /api/health/reports        → upload + analyze report text (stored encrypted)
 *   GET    /api/health/reports        → list reports (metadata only, no raw data)
 *   GET    /api/health/reports/:id/metrics → decrypt + return structured metrics (no raw text)
 *
 *   POST   /api/health/diet-plan      → generate diet plan from latest report
 *   GET    /api/health/diet-plan      → get latest decrypted diet plan
 */

import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";
import crypto from "crypto";

const AI_URL = process.env.AI_SERVICE_URL ?? "http://localhost:8000";

// ── Encryption helpers ─────────────────────────────────────────────────────────
const ENC_KEY_HEX = process.env.HEALTH_ENCRYPTION_KEY ?? "";

function getKey(): Buffer {
  if (!ENC_KEY_HEX || ENC_KEY_HEX.length < 64) {
    throw new Error("HEALTH_ENCRYPTION_KEY must be a 32-byte (64 hex chars) key in .env");
  }
  return Buffer.from(ENC_KEY_HEX, "hex");
}

function encrypt(text: string): string {
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc    = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return [iv.toString("hex"), enc.toString("hex"), tag.toString("hex")].join(".");
}

function decrypt(ciphertext: string): string {
  const [ivHex, encHex, tagHex] = ciphertext.split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(Buffer.from(encHex, "hex")).toString("utf8") + decipher.final("utf8");
}

// ── Consent text (shown to user before data collection) ───────────────────────
const CONSENT_TEXT = `Guardian AI Health & Diet Module — Informed Consent

By clicking "I Agree", you consent to:
1. Storing your medical report text in encrypted form (AES-256-GCM) on Guardian AI servers.
2. Sending anonymised health metrics (values only, no personal identifiers) to the Guardian AI model for diet plan generation.
3. Generating a personalised diet plan based on your uploaded health data.

You may revoke this consent at any time. All health data will be permanently deleted on revocation.
Raw medical text is never accessible to any human operator.
This module does not provide medical advice — consult a qualified doctor for diagnosis or treatment.`;

// ── Route plugin ───────────────────────────────────────────────────────────────
export default async function healthRoutes(fastify: FastifyInstance) {
  const s = fastify.withTypeProvider<ZodTypeProvider>();

  // ── GET /consent ─────────────────────────────────────────────────────────
  s.get("/consent", { preValidation: [s.authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const consent = await s.db.healthConsent.findUnique({ where: { userId } });
    return reply.send({
      hasConsent: !!(consent && !consent.revokedAt),
      agreedAt:   consent?.agreedAt?.toISOString() ?? null,
      consentText: CONSENT_TEXT,
    });
  });

  // ── POST /consent ─────────────────────────────────────────────────────────
  s.post("/consent", { preValidation: [s.authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    await s.db.healthConsent.upsert({
      where:  { userId },
      create: { userId, consentText: CONSENT_TEXT, agreedAt: new Date() },
      update: { agreedAt: new Date(), revokedAt: null, consentText: CONSENT_TEXT },
    });
    return reply.send({ ok: true, message: "Consent recorded." });
  });

  // ── DELETE /consent ───────────────────────────────────────────────────────
  s.delete("/consent", { preValidation: [s.authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    // Hard-delete all health data — GDPR right to erasure
    await s.db.dietPlan.deleteMany({ where: { userId } });
    await s.db.healthReport.deleteMany({ where: { userId } });
    await s.db.healthConsent.update({
      where: { userId },
      data:  { revokedAt: new Date() },
    }).catch(() => {});
    return reply.send({ ok: true, message: "Consent revoked and all health data deleted." });
  });

  // ── Consent middleware for all subsequent routes ────────────────────────────
  async function requireConsent(userId: string, reply: any) {
    const c = await (reply as any).server.db.healthConsent.findUnique({ where: { userId } });
    if (!c || c.revokedAt) {
      await reply.status(403).send({
        message: "Health consent required. Please grant consent first.",
        requiresConsent: true,
      });
      return false;
    }
    return true;
  }

  // ── POST /reports ─────────────────────────────────────────────────────────
  s.post(
    "/reports",
    {
      preValidation: [s.authenticate],
      schema: {
        body: z.object({
          reportText:  z.string().min(10).max(10000),
          reportType:  z.enum(["blood_test", "full_body_checkup", "ecg", "other"]).default("blood_test"),
          label:       z.string().optional(),
          // Optional anthropometrics for better diet plan
          weightKg:    z.number().optional(),
          heightCm:    z.number().optional(),
          age:         z.number().optional(),
          activityLevel: z.enum(["sedentary", "light", "moderate", "active"]).default("moderate"),
        }),
        response: {
          200: z.object({
            reportId:     z.string(),
            summary:      z.string(),
            flags:        z.array(z.string()),
            dietaryNotes: z.array(z.string()),
          }),
        },
      },
    },
    async (req, reply) => {
      const { id: userId } = req.user as { id: string };
      const { reportText, reportType, label, weightKg, heightCm, age, activityLevel } = req.body;

      // Consent gate
      const c = await s.db.healthConsent.findUnique({ where: { userId } });
      if (!c || c.revokedAt)
        return reply.status(403).send({ message: "Health consent required.", requiresConsent: true } as any);

      // Encrypt raw text immediately
      let dataEnc: string;
      try {
        dataEnc = encrypt(reportText);
      } catch {
        return reply.status(503).send({ message: "HEALTH_ENCRYPTION_KEY not configured in backend/.env" } as any);
      }

      // Send to AI (anonymised — just the text, not the user ID)
      const aiRes = await fetch(`${AI_URL}/health/analyze-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_text: reportText, report_type: reportType }),
      });
      if (!aiRes.ok)
        return reply.status(502).send({ message: "AI analysis failed. Please try again." } as any);

      const metrics = await aiRes.json() as {
        reportType: string; keyMetrics: Record<string, any>;
        flags: string[]; dietaryNotes: string[]; summary: string;
      };

      // Encrypt structured metrics
      const metricsEnc = encrypt(JSON.stringify(metrics));

      // Persist (encrypted only)
      const report = await s.db.healthReport.create({
        data: {
          userId,
          label:      label ?? `${reportType} — ${new Date().toLocaleDateString()}`,
          dataEnc,
          metricsEnc,
        },
      });

      // Raw text is no longer needed — discarded
      return reply.send({
        reportId:     report.id,
        summary:      metrics.summary,
        flags:        metrics.flags,
        dietaryNotes: metrics.dietaryNotes,
      });
    }
  );

  // ── GET /reports ──────────────────────────────────────────────────────────
  s.get("/reports", { preValidation: [s.authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const c = await s.db.healthConsent.findUnique({ where: { userId } });
    if (!c || c.revokedAt) return reply.send({ reports: [] });

    const reports = await s.db.healthReport.findMany({
      where:   { userId },
      select:  { id: true, label: true, uploadedAt: true },
      orderBy: { uploadedAt: "desc" },
    });
    return reply.send({
      reports: reports.map((r) => ({
        id:         r.id,
        label:      r.label,
        uploadedAt: r.uploadedAt.toISOString(),
      })),
    });
  });

  // ── GET /reports/:id/metrics ──────────────────────────────────────────────
  s.get(
    "/reports/:id/metrics",
    {
      preValidation: [s.authenticate],
      schema: { params: z.object({ id: z.string() }) },
    },
    async (req, reply) => {
      const { id: userId } = req.user as { id: string };
      const { id }         = req.params;

      const report = await s.db.healthReport.findFirst({ where: { id, userId } });
      if (!report) return reply.status(404).send({ message: "Report not found" } as any);
      if (!report.metricsEnc) return reply.status(404).send({ message: "No metrics available yet" } as any);

      try {
        const metrics = JSON.parse(decrypt(report.metricsEnc));
        return reply.send({ reportId: id, label: report.label, ...metrics });
      } catch {
        return reply.status(500).send({ message: "Failed to decrypt metrics" } as any);
      }
    }
  );

  // ── POST /diet-plan ───────────────────────────────────────────────────────
  s.post(
    "/diet-plan",
    {
      preValidation: [s.authenticate],
      schema: {
        body: z.object({
          reportId:      z.string().optional(),
          weightKg:      z.number().optional(),
          heightCm:      z.number().optional(),
          age:           z.number().optional(),
          activityLevel: z.enum(["sedentary", "light", "moderate", "active"]).default("moderate"),
          goal:          z.enum(["balanced", "weight_loss", "muscle_gain", "therapeutic"]).default("balanced"),
        }),
        response: {
          200: z.object({
            planId:      z.string(),
            summaryText: z.string(),
            tdee:        z.number(),
            goal:        z.string(),
            weeklyTips:  z.array(z.string()),
            foodsToAvoid: z.array(z.string()),
            days:        z.array(z.record(z.unknown())),
          }),
        },
      },
    },
    async (req, reply) => {
      const { id: userId } = req.user as { id: string };
      const { reportId, weightKg, heightCm, age, activityLevel, goal } = req.body;

      // Consent gate
      const c = await s.db.healthConsent.findUnique({ where: { userId } });
      if (!c || c.revokedAt)
        return reply.status(403).send({ message: "Health consent required.", requiresConsent: true } as any);

      // Load metrics from report if provided
      let flags: string[] = [];
      let dietaryNotes: string[] = [];
      let healthSummary = "";
      let sourceReportId = reportId ?? null;

      if (reportId) {
        const report = await s.db.healthReport.findFirst({ where: { id: reportId, userId } });
        if (report?.metricsEnc) {
          try {
            const m = JSON.parse(decrypt(report.metricsEnc));
            flags        = m.flags ?? [];
            dietaryNotes = m.dietaryNotes ?? [];
            healthSummary = m.summary ?? "";
          } catch {}
        }
      } else {
        // Use latest report
        const latest = await s.db.healthReport.findFirst({
          where: { userId }, orderBy: { uploadedAt: "desc" },
        });
        if (latest?.metricsEnc) {
          sourceReportId = latest.id;
          try {
            const m = JSON.parse(decrypt(latest.metricsEnc));
            flags        = m.flags ?? [];
            dietaryNotes = m.dietaryNotes ?? [];
            healthSummary = m.summary ?? "";
          } catch {}
        }
      }

      // Call diet AI
      const aiRes = await fetch(`${AI_URL}/health/generate-diet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flags, dietary_notes: dietaryNotes, summary: healthSummary,
          weight_kg: weightKg, height_cm: heightCm, age,
          activity_level: activityLevel, goal,
        }),
      });
      if (!aiRes.ok)
        return reply.status(502).send({ message: "Diet plan generation failed. Please try again." } as any);

      const plan = await aiRes.json() as {
        tdee: number; goal: string; days: any[];
        weeklyTips: string[]; foodsToAvoid: string[]; summaryText: string;
      };

      // Encrypt and persist plan
      let planEnc: string;
      try { planEnc = encrypt(JSON.stringify(plan)); }
      catch { return reply.status(503).send({ message: "HEALTH_ENCRYPTION_KEY not configured." } as any); }

      const dietPlan = await s.db.dietPlan.create({
        data: {
          userId,
          reportId:    sourceReportId,
          planEnc,
          summaryText: plan.summaryText,
        },
      });

      return reply.send({
        planId:       dietPlan.id,
        summaryText:  plan.summaryText,
        tdee:         plan.tdee,
        goal:         plan.goal,
        weeklyTips:   plan.weeklyTips,
        foodsToAvoid: plan.foodsToAvoid,
        days:         plan.days,
      });
    }
  );

  // ── GET /diet-plan ────────────────────────────────────────────────────────
  s.get("/diet-plan", { preValidation: [s.authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const c = await s.db.healthConsent.findUnique({ where: { userId } });
    if (!c || c.revokedAt) return reply.send({ plan: null });

    const dp = await s.db.dietPlan.findFirst({
      where: { userId }, orderBy: { generatedAt: "desc" },
    });
    if (!dp) return reply.send({ plan: null });

    try {
      const plan = JSON.parse(decrypt(dp.planEnc));
      return reply.send({
        plan: {
          planId:       dp.id,
          summaryText:  dp.summaryText,
          generatedAt:  dp.generatedAt.toISOString(),
          tdee:         plan.tdee,
          goal:         plan.goal,
          weeklyTips:   plan.weeklyTips,
          foodsToAvoid: plan.foodsToAvoid,
          days:         plan.days,
        },
      });
    } catch {
      return reply.status(500).send({ message: "Failed to decrypt diet plan" } as any);
    }
  });
}

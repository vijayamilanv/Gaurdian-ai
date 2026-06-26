/**
 * Phase 6b Extensions — Escalation, Notification Settings, Adaptive Recalibration
 *
 * Routes:
 *   GET    /api/guardian/escalations              → unacknowledged escalations
 *   POST   /api/guardian/escalations/:id/ack      → acknowledge an escalation
 *   POST   /api/guardian/escalations/run          → run escalation engine now (manual trigger)
 *   GET    /api/guardian/notifications            → get notification settings
 *   PUT    /api/guardian/notifications            → update notification settings
 *   POST   /api/guardian/recalibrate              → force adaptive recalibration
 */

import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";

const AI_URL = process.env.AI_SERVICE_URL ?? "http://localhost:8000";

// Counsellor / mental-health resource link (non-commercial, always shown on red escalations)
const SUPPORT_LINK = "https://www.iitb.ac.in/students-affairs/en/health-centre";

// ── Escalation Engine ─────────────────────────────────────────────────────────
// Runs checks against live data and logs GuardianEscalation rows when thresholds are breached.
// Called: (a) manually, (b) from GET /briefing, (c) future cron

interface EscalationRule {
  trigger:    string;
  severity:   "yellow" | "orange" | "red";
  check:      (ctx: any) => boolean;
  message:    (ctx: any) => string;
  addSupport: boolean;
}

const RULES: EscalationRule[] = [
  {
    trigger:    "low_schedule_completion",
    severity:   "orange",
    check:      (ctx) => ctx.missed_days >= 3 && ctx.schedule_completion !== null && ctx.schedule_completion < 0.5,
    message:    (ctx) => `You've completed less than 50% of your scheduled tasks for ${ctx.missed_days} consecutive days. Your Guardian has recalibrated today's plan to shorter, lighter blocks. Try to hit 70%+ today.`,
    addSupport: false,
  },
  {
    trigger:    "low_schedule_completion",
    severity:   "red",
    check:      (ctx) => ctx.missed_days >= 7,
    message:    (ctx) => `Critical: ${ctx.missed_days} consecutive days of very low task completion. This pattern strongly predicts placement risk. Let's talk — open Guardian Chat now.`,
    addSupport: true,
  },
  {
    trigger:    "no_applications",
    severity:   "orange",
    check:      (ctx) => ctx.active_apps === 0 && ctx.days_since_last_app !== null && ctx.days_since_last_app > 10,
    message:    (ctx) => `You have 0 active applications and haven't applied in ${ctx.days_since_last_app} days. Placement season is competitive — apply to at least 3 companies this week.`,
    addSupport: false,
  },
  {
    trigger:    "high_burnout_score",
    severity:   "red",
    check:      (ctx) => ctx.burnout_score !== null && ctx.burnout_score > 75,
    message:    (ctx) => `Your AI-assessed burnout risk is ${Math.round(ctx.burnout_score)}% — in the critical zone. Take a planned 1-day break and consider speaking to a counsellor.`,
    addSupport: true,
  },
  {
    trigger:    "placement_critical",
    severity:   "red",
    check:      (ctx) => ctx.placement_score !== null && ctx.placement_score < 25,
    message:    (ctx) => `Your placement probability has dropped to ${Math.round(ctx.placement_score)}%. This needs immediate attention — open Guardian Chat to build a recovery plan.`,
    addSupport: true,
  },
];

async function buildCompanionContext(db: any, userId: string) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);

  const [latestPrediction, applications, scheduleBlocks] = await Promise.all([
    db.prediction.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
    db.application.findMany({ where: { userId } }),
    db.scheduleBlock.findMany({
      where: { day: { userId, date: { gte: sevenDaysAgo } } },
      include: { day: { select: { date: true } } },
    }),
  ]);

  const totalBlocks  = scheduleBlocks.length;
  const doneBlocks   = scheduleBlocks.filter((b: any) => b.isDone).length;
  const schedComp    = totalBlocks > 0 ? doneBlocks / totalBlocks : null;

  const blocksByDay  = scheduleBlocks.reduce((acc: any, b: any) => {
    const d = b.day.date.toISOString().split("T")[0];
    if (!acc[d]) acc[d] = { total: 0, done: 0 };
    acc[d].total++;
    if (b.isDone) acc[d].done++;
    return acc;
  }, {});

  let missedDays = 0;
  for (const d of Object.keys(blocksByDay).sort().reverse()) {
    const { total, done } = blocksByDay[d];
    if (total === 0 || done / total < 0.5) missedDays++;
    else break;
  }

  const activeApps = applications.filter(
    (a: any) => !["rejected", "ghosted", "withdrawn"].includes(a.status)
  ).length;
  const lastApp = applications.sort((a: any, b: any) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime())[0];
  const daysSinceLastApp = lastApp
    ? Math.floor((now.getTime() - new Date(lastApp.appliedAt).getTime()) / 86_400_000)
    : null;

  return {
    userId,
    missed_days:         missedDays,
    schedule_completion: schedComp,
    active_apps:         activeApps,
    days_since_last_app: daysSinceLastApp,
    burnout_score:       latestPrediction?.burnoutScore ?? null,
    placement_score:     latestPrediction?.placementProbability ?? null,
  };
}

async function runEscalationEngine(db: any, userId: string) {
  const ctx = await buildCompanionContext(db, userId);
  const fired: any[] = [];

  for (const rule of RULES) {
    if (!rule.check(ctx)) continue;

    // Deduplicate: don't re-fire same trigger+severity within 24h
    const recent = await db.guardianEscalation.findFirst({
      where: {
        userId,
        trigger:   rule.trigger,
        severity:  rule.severity,
        createdAt: { gte: new Date(Date.now() - 86_400_000) },
      },
    });
    if (recent) continue;

    const esc = await db.guardianEscalation.create({
      data: {
        userId,
        trigger:     rule.trigger,
        severity:    rule.severity,
        message:     rule.message(ctx),
        supportLink: rule.addSupport ? SUPPORT_LINK : null,
      },
    });
    fired.push(esc);
  }

  // Adaptive recalibration: if missed_days >= 2 and no recalibration today → auto-regenerate with fewer blocks
  if (ctx.missed_days >= 2) {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const todayDay = await db.scheduleDay.findFirst({
      where: { userId, date: todayStart },
      include: { blocks: true },
    });

    const alreadyRecalibrated = todayDay?.generatedReason?.includes("Recalibrated");
    if (!alreadyRecalibrated) {
      // Auto-regenerate (fire-and-forget) — call AI with recalibration flag
      const profile = await db.profile.findUnique({ where: { userId } });
      const prediction = await db.prediction.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });

      fetch(`${AI_URL}/schedule/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interview_weak_areas: prediction?.weakAreas ?? [],
          missed_task_days:     ctx.missed_days,
          target_date:          new Date().toISOString().slice(0, 10),
          cgpa:                 profile?.cgpa ?? null,
          dsa_solved:           profile?.dsaSolved ?? 0,
          recalibrate:          true,
        }),
      })
        .then(async (r) => {
          if (!r.ok) return;
          const { schedule } = await r.json() as { schedule: any };
          const date = todayStart;

          // Delete existing today blocks and replace
          if (todayDay) {
            await db.scheduleBlock.deleteMany({ where: { dayId: todayDay.id } });
            await db.scheduleDay.update({
              where: { id: todayDay.id },
              data: { generatedReason: `Recalibrated after ${ctx.missed_days} low-completion days — lighter, shorter blocks` },
            });
            const blockData = (schedule.blocks ?? []).map((b: any) => ({
              dayId:      todayDay.id,
              startTime:  b.startTime ?? b.start,
              endTime:    b.endTime   ?? b.end,
              activity:   b.activity,
              category:   b.category ?? "weak_area_practice",
              sourceType: "recalibration",
            }));
            await db.scheduleBlock.createMany({ data: blockData });
          }
        })
        .catch(() => {}); // silent — don't block response
    }
  }

  return fired;
}

// ── Route Plugin ───────────────────────────────────────────────────────────────
export default async function guardianRoutes(fastify: FastifyInstance) {
  const s = fastify.withTypeProvider<ZodTypeProvider>();

  // ── GET /escalations ────────────────────────────────────────────────────────
  s.get("/escalations", { preValidation: [s.authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };

    // Run engine first — logs any new escalations
    await runEscalationEngine(s.db, userId);

    const escalations = await s.db.guardianEscalation.findMany({
      where:   { userId, acknowledgedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ escalations });
  });

  // ── POST /escalations/:id/ack ───────────────────────────────────────────────
  s.post("/escalations/:id/ack", { preValidation: [s.authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id }         = req.params as any;
    await s.db.guardianEscalation.updateMany({
      where: { id, userId },
      data:  { acknowledgedAt: new Date() },
    });
    return reply.send({ ok: true });
  });

  // ── POST /escalations/run ───────────────────────────────────────────────────
  s.post("/escalations/run", { preValidation: [s.authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const fired = await runEscalationEngine(s.db, userId);
    return reply.send({ fired: fired.length, escalations: fired });
  });

  // ── GET /notifications ──────────────────────────────────────────────────────
  s.get("/notifications", { preValidation: [s.authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const settings = await s.db.notificationSettings.upsert({
      where:  { userId },
      create: { userId },
      update: {},
    });
    return reply.send({ settings });
  });

  // ── PUT /notifications ──────────────────────────────────────────────────────
  s.put(
    "/notifications",
    {
      preValidation: [s.authenticate],
      schema: {
        body: z.object({
          scheduleNudges:        z.boolean().optional(),
          placementNudges:       z.boolean().optional(),
          examNudges:            z.boolean().optional(),
          healthNudges:          z.boolean().optional(),
          accountabilitySummary: z.boolean().optional(),
          accountabilityEmail:   z.string().email().optional().nullable(),
        }),
      },
    },
    async (req, reply) => {
      const { id: userId } = req.user as { id: string };
      const settings = await s.db.notificationSettings.upsert({
        where:  { userId },
        create: { userId, ...req.body },
        update: req.body,
      });
      return reply.send({ settings });
    }
  );

  // ── POST /recalibrate ──────────────────────────────────────────────────────
  // Manual force-recalibration (also called automatically from engine)
  s.post("/recalibrate", { preValidation: [s.authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const ctx = await buildCompanionContext(s.db, userId);

    const profile    = await s.db.profile.findUnique({ where: { userId } });
    const prediction = await s.db.prediction.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const aiRes = await fetch(`${AI_URL}/schedule/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        interview_weak_areas: prediction?.weakAreas ?? [],
        missed_task_days:     ctx.missed_days,
        target_date:          new Date().toISOString().slice(0, 10),
        cgpa:                 profile?.cgpa ?? null,
        dsa_solved:           profile?.dsaSolved ?? 0,
        recalibrate:          true,
      }),
    });

    if (!aiRes.ok) return reply.status(502).send({ message: "AI service unavailable" } as any);
    const { schedule } = await aiRes.json() as { schedule: any };

    const todayDay = await s.db.scheduleDay.findFirst({ where: { userId, date: todayStart }, include: { blocks: true } });
    if (todayDay) {
      await s.db.scheduleBlock.deleteMany({ where: { dayId: todayDay.id } });
      await s.db.scheduleDay.update({
        where: { id: todayDay.id },
        data:  { generatedReason: `Manually recalibrated — lighter sessions (${ctx.missed_days} low days)` },
      });
      const blocks = (schedule.blocks ?? []).map((b: any) => ({
        dayId:      todayDay.id,
        startTime:  b.startTime ?? b.start,
        endTime:    b.endTime   ?? b.end,
        activity:   b.activity,
        category:   b.category ?? "weak_area_practice",
        sourceType: "recalibration",
      }));
      await s.db.scheduleBlock.createMany({ data: blocks });
    }

    return reply.send({
      ok:       true,
      message:  `Schedule recalibrated — today's plan has been updated with lighter blocks.`,
      missedDays: ctx.missed_days,
    });
  });
}

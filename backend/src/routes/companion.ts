/**
 * Phase 6b: Guardian Companion Routes
 *
 * Aggregates context from every module, calls the AI companion,
 * and streams back structured briefings + chat responses.
 *
 * Routes:
 *   GET  /api/companion/briefing  → daily structured briefing
 *   POST /api/companion/chat      → guardian mentor chat
 *   GET  /api/companion/nudges    → nudge-only endpoint (lightweight, for dashboard widget)
 */

import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";

const AI_URL = process.env.AI_SERVICE_URL ?? "http://localhost:8000";

/** Gathers the full CompanionContext snapshot for the given user. */
async function buildContext(db: any, userId: string) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const todayStart   = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);

  const [
    profile,
    latestPrediction,
    applications,
    emailLogs,
    scheduleBlocks,
    todayDay,
    healthConsent,
    subjects,
    sessions,
  ] = await Promise.all([
    db.profile.findUnique({ where: { userId } }),
    db.prediction.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
    db.application.findMany({ where: { userId }, include: { interviewRounds: true } }),
    db.emailLog.findMany({ where: { userId } }),
    // Last 7 days of schedule blocks
    db.scheduleBlock.findMany({
      where: { day: { userId, date: { gte: sevenDaysAgo } } },
      include: { day: { select: { date: true } } },
    }),
    // Today's schedule day
    db.scheduleDay.findFirst({
      where: { userId, date: todayStart },
      include: { blocks: true },
    }),
    db.healthConsent.findUnique({ where: { userId } }),
    db.subject.findMany({ where: { userId }, include: { tests: { take: 1 } } }),
    db.mockInterviewSession.findMany({
      where: { userId }, orderBy: { startedAt: "desc" }, take: 1,
    }),
  ]);

  // ── Schedule signals ─────────────────────────────────────────────────────
  const totalBlocks     = scheduleBlocks.length;
  const doneBlocks      = scheduleBlocks.filter((b: any) => b.isDone).length;
  const scheduleCompletion = totalBlocks > 0 ? doneBlocks / totalBlocks : null;

  // Count consecutive days with <50% completion
  const blocksByDay = scheduleBlocks.reduce((acc: any, b: any) => {
    const d = b.day.date.toISOString().split("T")[0];
    if (!acc[d]) acc[d] = { total: 0, done: 0 };
    acc[d].total++;
    if (b.isDone) acc[d].done++;
    return acc;
  }, {} as Record<string, { total: number; done: number }>);

  const sortedDays = Object.keys(blocksByDay).sort().reverse();
  let missedDays = 0;
  for (const d of sortedDays) {
    const { total, done } = blocksByDay[d];
    if (total === 0 || done / total < 0.5) missedDays++;
    else break;
  }

  // ── Application signals ───────────────────────────────────────────────────
  const activeApps = applications.filter(
    (a: any) => !["rejected", "ghosted", "withdrawn"].includes(a.status)
  ).length;

  const lastApp = applications.sort(
    (a: any, b: any) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime()
  )[0];
  const daysSinceLastApp = lastApp
    ? Math.floor((now.getTime() - new Date(lastApp.appliedAt).getTime()) / 86_400_000)
    : null;

  // ── Email signals ─────────────────────────────────────────────────────────
  const pendingOA       = emailLogs.filter((e: any) => e.label === "OA" && e.isImportant).length;
  const offerLetters    = emailLogs.filter((e: any) => e.label === "OL").length;
  const recentRejections = emailLogs.filter((e: any) => {
    if (e.label !== "REJECT") return false;
    const recv = e.receivedAt ? new Date(e.receivedAt).getTime() : 0;
    return recv > sevenDaysAgo.getTime();
  }).length;

  // ── Health signals ────────────────────────────────────────────────────────
  let healthFlags: string[] = [];
  if (healthConsent && !healthConsent.revokedAt) {
    // We don't decrypt here — just count whether there are any health reports
    const hCount = await db.healthReport.count({ where: { userId } });
    if (hCount > 0) healthFlags = ["See Health module for details"]; // privacy: no raw flags here
  }

  // ── Exam prep signals ─────────────────────────────────────────────────────
  const examSubjectsNoTest = subjects.filter((s: any) => s.tests.length === 0).length;

  // ── Prediction / risk signals ─────────────────────────────────────────────
  const placementScore = latestPrediction
    ? (latestPrediction.placementProbability ?? null)
    : null;
  const burnoutScore = latestPrediction
    ? (latestPrediction.burnoutScore ?? null)
    : null;
  const topRisks: string[] = latestPrediction?.topRisks
    ? (Array.isArray(latestPrediction.topRisks)
        ? latestPrediction.topRisks
        : Object.values(latestPrediction.topRisks as any))
    : [];

  // ── Today blocks ──────────────────────────────────────────────────────────
  const todayBlocks = todayDay?.blocks?.length ?? 0;
  const doneToday   = todayDay?.blocks?.filter((b: any) => b.isDone).length ?? 0;

  return {
    student_name:        profile?.cgpa ? `Student` : "Student", // name not in profile, use generic
    placement_score:     placementScore,
    burnout_score:       burnoutScore,
    schedule_completion: scheduleCompletion,
    missed_days:         missedDays,
    active_apps:         activeApps,
    days_since_last_app: daysSinceLastApp,
    pending_oa:          pendingOA,
    offer_letters:       offerLetters,
    rejections_recent:   recentRejections,
    exam_subjects:       examSubjectsNoTest,
    health_flags:        healthFlags,
    top_risks:           topRisks.slice(0, 3),
    today_blocks:        todayBlocks,
    done_today:          doneToday,
    current_time_hour:   now.getUTCHours() + 5, // IST offset approx
    extra_context:       "",
  };
}

export default async function companionRoutes(fastify: FastifyInstance) {
  const s = fastify.withTypeProvider<ZodTypeProvider>();

  // ── GET /api/companion/briefing ──────────────────────────────────────────
  s.get("/briefing", { preValidation: [s.authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };

    const ctx = await buildContext(s.db, userId);

    const aiRes = await fetch(`${AI_URL}/companion/briefing`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(ctx),
    });

    if (!aiRes.ok) {
      const text = await aiRes.text();
      return reply.status(502).send({ message: `AI error: ${text}` } as any);
    }

    const briefing = await aiRes.json();
    return reply.send({ ...briefing, _context: ctx });
  });

  // ── GET /api/companion/nudges ─────────────────────────────────────────────
  // Lightweight endpoint for dashboard widget — returns escalation + nudges only
  s.get("/nudges", { preValidation: [s.authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const ctx = await buildContext(s.db, userId);

    // Derive nudges locally (fast, no AI call)
    const nudges: { type: string; severity: string; message: string }[] = [];

    if (ctx.missed_days >= 3)
      nudges.push({ type: "schedule", severity: "orange", message: `${ctx.missed_days} days of low task completion — consider regenerating your schedule.` });

    if (ctx.active_apps === 0)
      nudges.push({ type: "placement", severity: "orange", message: "No active applications. Apply to at least 3 companies this week." });
    else if (ctx.days_since_last_app !== null && ctx.days_since_last_app > 7)
      nudges.push({ type: "placement", severity: "yellow", message: `${ctx.days_since_last_app} days since your last application. Keep the momentum going.` });

    if (ctx.pending_oa > 0)
      nudges.push({ type: "email", severity: "red", message: `${ctx.pending_oa} unactioned OA invite(s) in your inbox!` });

    if (ctx.offer_letters > 0)
      nudges.push({ type: "email", severity: "green", message: `🎉 You have ${ctx.offer_letters} offer letter(s). Review and respond.` });

    if (ctx.exam_subjects > 0)
      nudges.push({ type: "exam", severity: "yellow", message: `${ctx.exam_subjects} subject(s) with no practice test yet. Start exam prep.` });

    const escalation = ctx.missed_days > 5 || (ctx.placement_score ?? 50) < 30
      ? "red"
      : ctx.missed_days > 2 || ctx.active_apps === 0
      ? "orange"
      : (ctx.schedule_completion ?? 1) < 0.7 || (ctx.days_since_last_app ?? 0) > 7
      ? "yellow"
      : "green";

    return reply.send({ nudges, escalation, context: ctx });
  });

  // ── POST /api/companion/chat ──────────────────────────────────────────────
  s.post(
    "/chat",
    {
      preValidation: [s.authenticate],
      schema: {
        body: z.object({
          message:   z.string().min(1).max(2000),
          history:   z.array(z.object({
            role:    z.enum(["user", "assistant"]),
            content: z.string(),
          })).default([]),
        }),
        response: {
          200: z.object({ reply: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const { id: userId } = req.user as { id: string };
      const { message, history } = req.body;

      const ctx = await buildContext(s.db, userId);

      const aiRes = await fetch(`${AI_URL}/companion/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message, history, context: ctx }),
      });

      if (!aiRes.ok) return reply.send({ reply: "I'm having trouble connecting right now. Please try again." });

      const data = await aiRes.json() as { reply: string };
      return reply.send({ reply: data.reply });
    }
  );
}

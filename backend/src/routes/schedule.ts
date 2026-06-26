import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

const BlockSchema = z.object({
  id:          z.string(),
  startTime:   z.string(),
  endTime:     z.string(),
  activity:    z.string(),
  category:    z.string(),
  sourceType:  z.string().nullable(),
  sourceId:    z.string().nullable(),
  isDone:      z.boolean(),
  completedAt: z.string().nullable(),
});

const DaySchema = z.object({
  id:              z.string(),
  date:            z.string(),
  generatedReason: z.string().nullable(),
  createdAt:       z.string(),
  blocks:          z.array(BlockSchema),
  completionPct:   z.number(),
});

/** Normalise a Date to midnight UTC for a given YYYY-MM-DD string */
function toUtcMidnight(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Compute today's date as YYYY-MM-DD in UTC */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Map a DB day row → API shape */
function formatDay(day: any): z.infer<typeof DaySchema> {
  const total = day.blocks.length;
  const done  = day.blocks.filter((b: any) => b.isDone).length;
  return {
    id:              day.id,
    date:            day.date.toISOString().slice(0, 10),
    generatedReason: day.generatedReason ?? null,
    createdAt:       day.createdAt.toISOString(),
    completionPct:   total ? Math.round((done / total) * 100) : 0,
    blocks: day.blocks.map((b: any) => ({
      id:          b.id,
      startTime:   b.startTime,
      endTime:     b.endTime,
      activity:    b.activity,
      category:    b.category,
      sourceType:  b.sourceType ?? null,
      sourceId:    b.sourceId  ?? null,
      isDone:      b.isDone,
      completedAt: b.completedAt?.toISOString() ?? null,
    })),
  };
}

/** Persist a structuredSchedule object from the Planner into ScheduleDay + ScheduleBlock */
async function persistSchedule(
  db: any,
  userId: string,
  schedule: { date: string; generatedReason?: string; blocks: any[] }
): Promise<void> {
  const dateVal = toUtcMidnight(schedule.date);

  // Upsert the day (delete existing blocks first on update)
  const existing = await db.scheduleDay.findUnique({
    where: { userId_date: { userId, date: dateVal } },
  });

  if (existing) {
    await db.scheduleBlock.deleteMany({ where: { dayId: existing.id } });
    await db.scheduleDay.update({
      where: { id: existing.id },
      data: { generatedReason: schedule.generatedReason ?? null },
    });
    await db.scheduleBlock.createMany({
      data: schedule.blocks.map((b: any) => ({
        dayId:      existing.id,
        startTime:  b.startTime ?? b.start,
        endTime:    b.endTime   ?? b.end,
        activity:   b.activity,
        category:   b.category,
        sourceType: b.sourceType ?? null,
        sourceId:   b.sourceId  ?? null,
      })),
    });
  } else {
    await db.scheduleDay.create({
      data: {
        userId,
        date:            dateVal,
        generatedReason: schedule.generatedReason ?? null,
        blocks: {
          create: schedule.blocks.map((b: any) => ({
            startTime:  b.startTime ?? b.start,
            endTime:    b.endTime   ?? b.end,
            activity:   b.activity,
            category:   b.category,
            sourceType: b.sourceType ?? null,
            sourceId:   b.sourceId  ?? null,
          })),
        },
      },
    });
  }
}

export { persistSchedule };

export default async function scheduleRoutes(fastify: FastifyInstance) {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  // ── GET /api/schedule/today ────────────────────────────────────────────────
  server.get(
    "/today",
    {
      preValidation: [server.authenticate],
      schema: { response: { 200: z.object({ day: DaySchema.nullable() }) } },
    },
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const dateVal = toUtcMidnight(todayUtc());

      const day = await server.db.scheduleDay.findUnique({
        where: { userId_date: { userId, date: dateVal } },
        include: { blocks: { orderBy: { startTime: "asc" } } },
      });

      return reply.send({ day: day ? formatDay(day) : null });
    }
  );

  // ── GET /api/schedule?from=&to= ────────────────────────────────────────────
  server.get(
    "/",
    {
      preValidation: [server.authenticate],
      schema: {
        querystring: z.object({
          from: z.string().optional(),
          to:   z.string().optional(),
        }),
        response: { 200: z.object({ days: z.array(DaySchema) }) },
      },
    },
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const { from, to } = request.query;

      const days = await server.db.scheduleDay.findMany({
        where: {
          userId,
          ...(from || to ? {
            date: {
              ...(from ? { gte: toUtcMidnight(from) } : {}),
              ...(to   ? { lte: toUtcMidnight(to)   } : {}),
            },
          } : {}),
        },
        include: { blocks: { orderBy: { startTime: "asc" } } },
        orderBy: { date: "asc" },
        take: 30,
      });

      return reply.send({ days: days.map(formatDay) });
    }
  );

  // ── PATCH /api/schedule/blocks/:id/complete ────────────────────────────────
  server.patch(
    "/blocks/:id/complete",
    {
      preValidation: [server.authenticate],
      schema: {
        params: z.object({ id: z.string() }),
        body:   z.object({ isDone: z.boolean() }),
        response: { 200: z.object({ block: BlockSchema }) },
      },
    },
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const { id } = request.params;
      const { isDone } = request.body;

      // Verify ownership through the day relation
      const existing = await server.db.scheduleBlock.findFirst({
        where: { id, day: { userId } },
      });
      if (!existing) return reply.status(404).send({ message: "Block not found" } as any);

      const block = await server.db.scheduleBlock.update({
        where: { id },
        data: {
          isDone,
          completedAt: isDone ? new Date() : null,
        },
      });

      return reply.send({
        block: {
          id: block.id, startTime: block.startTime, endTime: block.endTime,
          activity: block.activity, category: block.category,
          sourceType: block.sourceType ?? null, sourceId: block.sourceId ?? null,
          isDone: block.isDone, completedAt: block.completedAt?.toISOString() ?? null,
        },
      });
    }
  );

  // ── POST /api/schedule/regenerate ─────────────────────────────────────────
  // Re-runs the Planner via the AI service and persists a fresh schedule.
  server.post(
    "/regenerate",
    {
      preValidation: [server.authenticate],
      schema: {
        body: z.object({
          targetDate: z.string().optional(), // defaults to today
        }).optional(),
        response: { 200: z.object({ day: DaySchema }) },
      },
    },
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const targetDate = request.body?.targetDate ?? todayUtc();

      // Compute missed_task_days from recent completion history
      const recentDays = await server.db.scheduleDay.findMany({
        where: { userId, date: { lt: toUtcMidnight(targetDate) } },
        include: { blocks: true },
        orderBy: { date: "desc" },
        take: 7,
      });

      let missedTaskDays = 0;
      for (const d of recentDays) {
        if (d.blocks.length === 0) break;
        const pct = d.blocks.filter((b) => b.isDone).length / d.blocks.length;
        if (pct < 0.4) missedTaskDays++;
        else break;
      }

      // Fetch latest interview weak areas for this user
      const latestSession = await server.db.mockInterviewSession.findFirst({
        where: { userId, status: "completed" },
        orderBy: { completedAt: "desc" },
      });
      const interviewWeakAreas: string[] = latestSession?.weakAreas
        ? (latestSession.weakAreas as string[])
        : [];

      // Fetch user profile for the pipeline
      const profile = await server.db.profile.findUnique({ where: { userId } });

      try {
        const aiRes = await fetch(`${AI_SERVICE_URL}/schedule/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id:              userId,
            target_date:          targetDate,
            missed_task_days:     missedTaskDays,
            interview_weak_areas: interviewWeakAreas,
            cgpa:                 profile?.cgpa ?? null,
            dsa_solved:           profile?.dsaSolved ?? 0,
          }),
        });

        if (!aiRes.ok) throw new Error(`AI service: ${aiRes.status}`);
        const { schedule } = await aiRes.json() as { schedule: any };
        await persistSchedule(server.db, userId, schedule);
      } catch (err) {
        fastify.log.warn({ err }, "AI service unavailable — using fallback schedule");
        // Fallback: generate a minimal default schedule
        const fallback = {
          date: targetDate,
          generatedReason: missedTaskDays >= 2
            ? `Recalibrated after ${missedTaskDays} low-completion days — shorter sessions`
            : "Default schedule (AI service offline)",
          blocks: [
            { startTime: "07:00", endTime: "08:00", activity: "Study session", category: "weak_area_practice", sourceType: "manual" },
            { startTime: "13:00", endTime: "13:45", activity: "Lunch break", category: "rest", sourceType: "manual" },
            { startTime: "20:00", endTime: "21:00", activity: "Review & practice", category: "weak_area_practice", sourceType: "manual" },
          ],
        };
        await persistSchedule(server.db, userId, fallback);
      }

      const day = await server.db.scheduleDay.findUnique({
        where: { userId_date: { userId, date: toUtcMidnight(targetDate) } },
        include: { blocks: { orderBy: { startTime: "asc" } } },
      });

      return reply.send({ day: formatDay(day!) });
    }
  );
}

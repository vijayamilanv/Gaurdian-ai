import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

const HistoryItem = z.object({ role: z.enum(["user", "assistant"]), content: z.string() });

export default async function agentRoutes(fastify: FastifyInstance) {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  // ── POST /api/agent/mock-interview ──────────────────────────────────────────
  server.post(
    "/mock-interview",
    {
      preValidation: [server.authenticate],
      schema: {
        body: z.object({
          topic: z.string().min(1),
          previous_answer: z.string().optional(),
          history: z.array(HistoryItem).optional(),
        }),
        response: { 200: z.object({ response: z.string() }) },
      },
    },
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const { topic, previous_answer, history = [] } = request.body;

      try {
        const aiRes = await fetch(`${AI_SERVICE_URL}/agents/mock-interview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic, previous_answer, history }),
        });
        if (!aiRes.ok) throw new Error(`AI service error: ${aiRes.status}`);
        const data = await aiRes.json() as { response: string };
        const response: string = data.response;

        // Log to agent_logs
        await server.db.agentLog.create({
          data: {
            userId,
            type: "mock_interview",
            input: `Topic: ${topic}\nAnswer: ${previous_answer ?? "N/A"}`,
            output: response,
          },
        });

        return reply.send({ response });
      } catch (err: any) {
        fastify.log.error(err);
        return reply.status(500).send({ message: "Mock interview agent failed" } as any);
      }
    }
  );

  // ── POST /api/agent/prep ────────────────────────────────────────────────────
  server.post(
    "/prep",
    {
      preValidation: [server.authenticate],
      schema: {
        body: z.object({
          message: z.string().min(1),
          focus: z.enum(["aptitude", "coding"]).optional(),
          history: z.array(HistoryItem).optional(),
        }),
        response: { 200: z.object({ response: z.string() }) },
      },
    },
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const { message, focus = "aptitude", history = [] } = request.body;

      try {
        const aiRes = await fetch(`${AI_SERVICE_URL}/agents/prep`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, focus, history }),
        });
        if (!aiRes.ok) throw new Error(`AI service error: ${aiRes.status}`);
        const data = await aiRes.json() as { response: string };
        const response: string = data.response;

        await server.db.agentLog.create({
          data: {
            userId,
            type: "prep",
            input: `Focus: ${focus}\nMsg: ${message}`,
            output: response,
          },
        });

        return reply.send({ response });
      } catch (err: any) {
        fastify.log.error(err);
        return reply.status(500).send({ message: "Prep agent failed" } as any);
      }
    }
  );

  // ── POST /api/agent/resume-review ───────────────────────────────────────────
  server.post(
    "/resume-review",
    {
      preValidation: [server.authenticate],
      schema: {
        body: z.object({
          resumeText:  z.string().min(50, "Resume text too short"),
          targetRole:  z.string().optional(),
          fileAssetId: z.string().optional(),
        }),
        response: {
          200: z.object({
            summary:      z.string(),
            atsScore:     z.number(),
            strengths:    z.array(z.string()),
            improvements: z.array(z.string()),
            keywords:     z.array(z.string()),
            rawMarkdown:  z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const { resumeText, targetRole = "Software Engineer", fileAssetId } = request.body;

      try {
        const aiRes = await fetch(`${AI_SERVICE_URL}/agents/resume-review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resume_text: resumeText, target_role: targetRole }),
        });
        if (!aiRes.ok) throw new Error(`AI service error: ${aiRes.status}`);
        const data = await aiRes.json() as {
          summary: string; ats_score: number;
          strengths: string[]; improvements: string[];
          keywords: string[]; raw_markdown: string;
        };

        await server.db.agentLog.create({
          data: {
            userId,
            type:   "resume_review",
            input:  `Role: ${targetRole} | Chars: ${resumeText.length}${fileAssetId ? ` | File: ${fileAssetId}` : ""}`,
            output: data.raw_markdown,
          },
        });

        return reply.send({
          summary:      data.summary,
          atsScore:     data.ats_score,
          strengths:    data.strengths,
          improvements: data.improvements,
          keywords:     data.keywords,
          rawMarkdown:  data.raw_markdown,
        });
      } catch (err: any) {
        fastify.log.error(err);
        return reply.status(500).send({ message: "Resume review agent failed" } as any);
      }
    }
  );

  // ── GET /api/agent/logs ─────────────────────────────────────────────────────
  server.get(
    "/logs",
    {
      preValidation: [server.authenticate],
      schema: {
        response: {
          200: z.object({
            logs: z.array(z.object({
              id:        z.string(),
              type:      z.string(),
              input:     z.string().nullable(),
              output:    z.string().nullable(),
              createdAt: z.string(),
            })),
          }),
        },
      },
    },
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const logs = await server.db.agentLog.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      return reply.send({
        logs: logs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
      });
    }
  );

  // ── POST /api/agent/mock-interview/session ────────────────────────────────
  // Create a new MockInterviewSession (called when user starts an interview)
  server.post(
    "/mock-interview/session",
    {
      preValidation: [server.authenticate],
      schema: {
        body: z.object({ topic: z.string().min(1) }),
        response: { 200: z.object({ sessionId: z.string() }) },
      },
    },
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const { topic } = request.body;
      const session = await server.db.mockInterviewSession.create({
        data: { userId, topic, transcript: [], status: "in_progress" },
      });
      return reply.send({ sessionId: session.id });
    }
  );

  // ── PATCH /api/agent/mock-interview/:sessionId/transcript ─────────────────
  // Append a Q/A exchange to the session transcript
  server.patch(
    "/mock-interview/:sessionId/transcript",
    {
      preValidation: [server.authenticate],
      schema: {
        params: z.object({ sessionId: z.string() }),
        body: z.object({
          question: z.string(),
          answer:   z.string(),
          feedback: z.string().optional(),
        }),
        response: { 200: z.object({ ok: z.boolean() }) },
      },
    },
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const { sessionId } = request.params;
      const { question, answer, feedback = "" } = request.body;

      const session = await server.db.mockInterviewSession.findFirst({
        where: { id: sessionId, userId },
      });
      if (!session) return reply.status(404).send({ message: "Session not found" } as any);

      const transcript = Array.isArray(session.transcript) ? session.transcript as any[] : [];
      transcript.push({ question, answer, feedback });

      await server.db.mockInterviewSession.update({
        where: { id: sessionId },
        data:  { transcript },
      });
      return reply.send({ ok: true });
    }
  );

  // ── POST /api/agent/mock-interview/:sessionId/complete ────────────────────
  // Runs Critic → Planner, writes results, persists today's schedule
  server.post(
    "/mock-interview/:sessionId/complete",
    {
      preValidation: [server.authenticate],
      schema: {
        params: z.object({ sessionId: z.string() }),
        response: {
          200: z.object({
            overallScore: z.number(),
            weakAreas:    z.array(z.string()),
            summary:      z.string(),
            actionPlan:   z.record(z.unknown()),
          }),
        },
      },
    },
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const { sessionId } = request.params;

      const session = await server.db.mockInterviewSession.findFirst({
        where: { id: sessionId, userId },
      });
      if (!session) return reply.status(404).send({ message: "Session not found" } as any);
      if (session.status === "completed") {
        // Already completed — return cached result
        return reply.send({
          overallScore: session.overallScore ?? 0,
          weakAreas:    (session.weakAreas as string[]) ?? [],
          summary:      "",
          actionPlan:   (session.actionPlan as Record<string, unknown>) ?? {},
        });
      }

      const profile = await server.db.profile.findUnique({ where: { userId } });
      const transcript = Array.isArray(session.transcript) ? session.transcript as any[] : [];

      try {
        const aiRes = await fetch(`${AI_SERVICE_URL}/agents/interview-complete`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic:      session.topic,
            transcript,
            cgpa:       profile?.cgpa ?? null,
            dsa_solved: profile?.dsaSolved ?? 0,
          }),
        });
        if (!aiRes.ok) throw new Error(`AI service: ${aiRes.status}`);
        const data = await aiRes.json() as {
          overall_score: number; weak_areas: string[];
          summary: string; action_plan: Record<string, unknown>;
        };

        // Persist results on session
        await server.db.mockInterviewSession.update({
          where: { id: sessionId },
          data: {
            overallScore: data.overall_score,
            weakAreas:    data.weak_areas,
            actionPlan:   data.action_plan as any,
            status:       "completed",
            completedAt:  new Date(),
          },
        });

        // Persist today's schedule if the AI returned a structured one
        const structuredSchedule = (data.action_plan as any)?.structuredSchedule;
        if (structuredSchedule?.blocks?.length) {
          const { persistSchedule } = await import("./schedule.js");
          await persistSchedule(server.db, userId, structuredSchedule);
        }

        await server.db.agentLog.create({
          data: {
            userId,
            type:   "mock_interview_complete",
            input:  `Session: ${sessionId} | Topic: ${session.topic}`,
            output: JSON.stringify({ score: data.overall_score, weakAreas: data.weak_areas }),
          },
        });

        return reply.send({
          overallScore: data.overall_score,
          weakAreas:    data.weak_areas,
          summary:      data.summary,
          actionPlan:   data.action_plan,
        });
      } catch (err: any) {
        fastify.log.error(err);
        return reply.status(500).send({ message: "Completion failed" } as any);
      }
    }
  );

  // ── GET /api/agent/mock-interview/:sessionId/report ───────────────────────
  server.get(
    "/mock-interview/:sessionId/report",
    {
      preValidation: [server.authenticate],
      schema: {
        params: z.object({ sessionId: z.string() }),
        response: {
          200: z.object({
            id:          z.string(),
            topic:       z.string(),
            status:      z.string(),
            overallScore: z.number().nullable(),
            weakAreas:   z.array(z.string()).nullable(),
            actionPlan:  z.record(z.unknown()).nullable(),
            startedAt:   z.string(),
            completedAt: z.string().nullable(),
            transcriptLength: z.number(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const { sessionId }  = request.params;

      const session = await server.db.mockInterviewSession.findFirst({
        where: { id: sessionId, userId },
      });
      if (!session) return reply.status(404).send({ message: "Session not found" } as any);

      const transcript = Array.isArray(session.transcript) ? session.transcript : [];
      return reply.send({
        id:           session.id,
        topic:        session.topic,
        status:       session.status,
        overallScore: session.overallScore ?? null,
        weakAreas:    (session.weakAreas as string[] | null) ?? null,
        actionPlan:   (session.actionPlan as Record<string, unknown> | null) ?? null,
        startedAt:    session.startedAt.toISOString(),
        completedAt:  session.completedAt?.toISOString() ?? null,
        transcriptLength: transcript.length,
      });
    }
  );
}

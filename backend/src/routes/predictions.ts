import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";
import { aiService } from "../lib/aiService.js";

export default async function predictionsRoutes(fastify: FastifyInstance) {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  // POST /api/predictions/run — trigger full pipeline and save results
  server.post(
    "/run",
    {
      preValidation: [server.authenticate],
      schema: {
        response: {
          200: z.object({ result: z.record(z.unknown()) }),
          503: z.object({ message: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const payload = request.user as { id: string };
      const userId = payload.id;

      // Fetch user profile, skills, projects
      const [profile, skills, projects] = await Promise.all([
        server.db.profile.findUnique({ where: { userId } }),
        server.db.skill.findMany({ where: { userId } }),
        server.db.project.findMany({ where: { userId } }),
      ]);

      // Fetch last 14 days of activity
      const since = new Date();
      since.setDate(since.getDate() - 14);
      const activities = await server.db.activity.findMany({
        where: { userId, date: { gte: since } },
        orderBy: { date: "desc" },
      });

      // ── Sub-Phase D: application tracker signals ────────────────────────────
      const applications = await server.db.application.findMany({
        where: { userId },
        include: { interviewRounds: true },
        orderBy: { appliedAt: "desc" },
      });

      const activeApps = applications.filter(
        (a) => !["rejected", "ghosted", "withdrawn"].includes(a.status)
      ).length;

      // Count all interview rounds and passed rounds
      const allRounds = applications.flatMap((a) => a.interviewRounds);
      const roundsCompleted = allRounds.length;
      const passedRounds = allRounds.filter((r) => r.outcome === "pass").length;
      const roundPassRate = roundsCompleted > 0 ? passedRounds / roundsCompleted : null;

      // Days since last application submitted
      const lastApp = applications[0]; // already ordered by appliedAt desc
      const daysSinceLastApp = lastApp
        ? Math.floor((Date.now() - new Date(lastApp.appliedAt).getTime()) / 86_400_000)
        : null;
      // ── End Sub-Phase D ─────────────────────────────────────────────────────

      // Build pipeline request payload
      const pipelinePayload = {
        user_profile: {
          cgpa: profile?.cgpa ?? 0,
          attendance: profile?.attendance ?? 0,
          dsaSolved: profile?.dsaSolved ?? 0,
          skillCount: skills.length,
          skills: skills.map((s) => s.skillName),
          projectCount: projects.length,
          targetRoles: profile?.targetRoles ?? [],
        },
        activities: activities.map((a) => ({
          type: a.type,
          hours: a.hours,
          date: a.date.toISOString().split("T")[0],
        })),
        // Application signals
        active_apps:          activeApps,
        rounds_completed:     roundsCompleted || null,
        round_pass_rate:      roundPassRate,
        days_since_last_app:  daysSinceLastApp,
      };

      // Call AI service
      let result;
      try {
        result = await aiService.runPipeline(pipelinePayload);
      } catch (err) {
        server.log.error(err, "AI service unreachable");
        return reply.status(503).send({
          message: "AI service is unavailable. Please ensure it is running.",
        });
      }

      // Persist predictions to DB
      const predictions = result.predictions as Record<string, { probability?: number; score?: number }> | null;
      if (predictions) {
        const riskMap: Record<string, number> = {
          placement:      (predictions.placement?.probability ?? 0),
          backlog:        (predictions.backlog?.probability ?? 0),
          burnout:        (predictions.burnout?.score ?? 0) / 100,
          project_failure: (predictions.projectFailure?.probability ?? 0),
        };

        await Promise.all(
          Object.entries(riskMap).map(([riskType, probability]) =>
            server.db.prediction.create({
              data: { userId, riskType, probability },
            })
          )
        );
      }

      return reply.status(200).send({ result });
    }
  );

  // GET /api/predictions/latest — latest prediction per risk type
  server.get(
    "/latest",
    {
      preValidation: [server.authenticate],
      schema: {
        response: {
          200: z.object({
            predictions: z.array(
              z.object({
                riskType: z.string(),
                probability: z.number(),
                createdAt: z.string(),
              })
            ),
          }),
        },
      },
    },
    async (request, reply) => {
      const payload = request.user as { id: string };

      // Get the most recent prediction for each risk type
      const riskTypes = ["placement", "backlog", "burnout", "project_failure"];
      const predictions = await Promise.all(
        riskTypes.map((riskType) =>
          server.db.prediction.findFirst({
            where: { userId: payload.id, riskType },
            orderBy: { createdAt: "desc" },
          })
        )
      );

      return reply.status(200).send({
        predictions: predictions
          .filter(Boolean)
          .map((p) => ({
            riskType: p!.riskType,
            probability: p!.probability,
            createdAt: p!.createdAt.toISOString(),
          })),
      });
    }
  );

  // GET /api/predictions/history — all predictions over time (for trend chart)
  server.get(
    "/history",
    {
      preValidation: [server.authenticate],
      schema: {
        response: {
          200: z.object({
            history: z.array(
              z.object({
                id: z.string(),
                riskType: z.string(),
                probability: z.number(),
                createdAt: z.string(),
              })
            ),
          }),
        },
      },
    },
    async (request, reply) => {
      const payload = request.user as { id: string };

      const history = await server.db.prediction.findMany({
        where: { userId: payload.id },
        orderBy: { createdAt: "asc" },
      });

      return reply.status(200).send({
        history: history.map((p) => ({
          id: p.id,
          riskType: p.riskType,
          probability: p.probability,
          createdAt: p.createdAt.toISOString(),
        })),
      });
    }
  );
}

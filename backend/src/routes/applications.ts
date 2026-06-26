import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";

const ApplicationSchema = z.object({
  id: z.string(),
  companyName: z.string(),
  role: z.string().nullable(),
  status: z.string(),
  appliedDate: z.string().nullable(),
  package: z.string().nullable(),
  location: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export default async function applicationsRoutes(fastify: FastifyInstance) {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  // GET /api/applications — list all (optionally by status)
  server.get(
    "/",
    {
      preValidation: [server.authenticate],
      schema: {
        querystring: z.object({ status: z.string().optional() }),
        response: { 200: z.object({ applications: z.array(ApplicationSchema) }) },
      },
    },
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const { status } = request.query;
      const applications = await server.db.application.findMany({
        where: { userId, ...(status ? { status } : {}) },
        orderBy: { updatedAt: "desc" },
      });
      return reply.send({
        applications: applications.map((a) => ({
          ...a,
          appliedDate: a.appliedDate?.toISOString() ?? null,
          createdAt: a.createdAt.toISOString(),
          updatedAt: a.updatedAt.toISOString(),
        })),
      });
    }
  );

  // POST /api/applications — create application
  server.post(
    "/",
    {
      preValidation: [server.authenticate],
      schema: {
        body: z.object({
          companyName: z.string().min(1),
          role: z.string().optional(),
          status: z.enum(["applied", "interview", "offer", "rejected"]).optional(),
          appliedDate: z.string().optional(),
          package: z.string().optional(),
          location: z.string().optional(),
        }),
        response: { 201: z.object({ application: ApplicationSchema }) },
      },
    },
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const { companyName, role, status, appliedDate, package: pkg, location } = request.body;
      const app = await server.db.application.create({
        data: {
          userId,
          companyName,
          role: role ?? null,
          status: status ?? "applied",
          appliedDate: appliedDate ? new Date(appliedDate) : null,
          package: pkg ?? null,
          location: location ?? null,
        },
      });
      return reply.status(201).send({
        application: {
          ...app,
          appliedDate: app.appliedDate?.toISOString() ?? null,
          createdAt: app.createdAt.toISOString(),
          updatedAt: app.updatedAt.toISOString(),
        },
      });
    }
  );

  // PATCH /api/applications/:id
  server.patch(
    "/:id",
    {
      preValidation: [server.authenticate],
      schema: {
        params: z.object({ id: z.string() }),
        body: z.object({
          companyName: z.string().optional(),
          role: z.string().nullable().optional(),
          status: z.enum(["applied", "interview", "offer", "rejected"]).optional(),
          appliedDate: z.string().nullable().optional(),
          package: z.string().nullable().optional(),
          location: z.string().nullable().optional(),
        }),
        response: { 200: z.object({ application: ApplicationSchema }) },
      },
    },
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const { id } = request.params;
      const { companyName, role, status, appliedDate, package: pkg, location } = request.body;

      const existing = await server.db.application.findFirst({ where: { id, userId } });
      if (!existing) return reply.status(404).send({ message: "Application not found" } as any);

      const app = await server.db.application.update({
        where: { id },
        data: {
          ...(companyName !== undefined && { companyName }),
          ...(role !== undefined && { role }),
          ...(status !== undefined && { status }),
          ...(appliedDate !== undefined && { appliedDate: appliedDate ? new Date(appliedDate) : null }),
          ...(pkg !== undefined && { package: pkg }),
          ...(location !== undefined && { location }),
        },
      });
      return reply.send({
        application: {
          ...app,
          appliedDate: app.appliedDate?.toISOString() ?? null,
          createdAt: app.createdAt.toISOString(),
          updatedAt: app.updatedAt.toISOString(),
        },
      });
    }
  );

  // DELETE /api/applications/:id
  server.delete(
    "/:id",
    {
      preValidation: [server.authenticate],
      schema: {
        params: z.object({ id: z.string() }),
        response: { 200: z.object({ success: z.boolean() }) },
      },
    },
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const { id } = request.params;
      const existing = await server.db.application.findFirst({ where: { id, userId } });
      if (!existing) return reply.status(404).send({ message: "Application not found" } as any);
      await server.db.application.delete({ where: { id } });
      return reply.send({ success: true });
    }
  );

  // ── Interview Rounds ──────────────────────────────────────────────────────

  const RoundSchema = z.object({
    id: z.string(),
    applicationId: z.string(),
    roundName: z.string(),
    scheduledDate: z.string().nullable(),
    result: z.string().nullable(),
    feedback: z.string().nullable(),
    reminderSent: z.boolean(),
    createdAt: z.string(),
  });

  // POST /api/applications/:id/rounds
  server.post(
    "/:id/rounds",
    {
      preValidation: [server.authenticate],
      schema: {
        params: z.object({ id: z.string() }),
        body: z.object({
          roundName: z.string().min(1),
          scheduledDate: z.string().optional(),
          result: z.enum(["pending", "passed", "failed"]).optional(),
          feedback: z.string().optional(),
        }),
        response: { 201: z.object({ round: RoundSchema }) },
      },
    },
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const { id: applicationId } = request.params;
      const { roundName, scheduledDate, result, feedback } = request.body;

      const app = await server.db.application.findFirst({ where: { id: applicationId, userId } });
      if (!app) return reply.status(404).send({ message: "Application not found" } as any);

      const round = await server.db.interviewRound.create({
        data: {
          applicationId,
          roundName,
          scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
          result: result ?? "pending",
          feedback: feedback ?? null,
        },
      });
      return reply.status(201).send({
        round: {
          ...round,
          scheduledDate: round.scheduledDate?.toISOString() ?? null,
          createdAt: round.createdAt.toISOString(),
        },
      });
    }
  );

  // PATCH /api/rounds/:roundId (registered at root, handled here for simplicity)
  server.patch(
    "/rounds/:roundId",
    {
      preValidation: [server.authenticate],
      schema: {
        params: z.object({ roundId: z.string() }),
        body: z.object({
          roundName: z.string().optional(),
          scheduledDate: z.string().nullable().optional(),
          result: z.enum(["pending", "passed", "failed"]).nullable().optional(),
          feedback: z.string().nullable().optional(),
          reminderSent: z.boolean().optional(),
        }),
        response: { 200: z.object({ round: RoundSchema }) },
      },
    },
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const { roundId } = request.params;

      // Verify ownership via application
      const round = await server.db.interviewRound.findFirst({
        where: { id: roundId },
        include: { application: { select: { userId: true } } },
      });
      if (!round || round.application.userId !== userId) {
        return reply.status(404).send({ message: "Round not found" } as any);
      }

      const { roundName, scheduledDate, result, feedback, reminderSent } = request.body;
      const updated = await server.db.interviewRound.update({
        where: { id: roundId },
        data: {
          ...(roundName !== undefined && { roundName }),
          ...(scheduledDate !== undefined && { scheduledDate: scheduledDate ? new Date(scheduledDate) : null }),
          ...(result !== undefined && { result }),
          ...(feedback !== undefined && { feedback }),
          ...(reminderSent !== undefined && { reminderSent }),
        },
      });
      return reply.send({
        round: {
          ...updated,
          scheduledDate: updated.scheduledDate?.toISOString() ?? null,
          createdAt: updated.createdAt.toISOString(),
        },
      });
    }
  );

  // DELETE /api/rounds/:roundId
  server.delete(
    "/rounds/:roundId",
    {
      preValidation: [server.authenticate],
      schema: {
        params: z.object({ roundId: z.string() }),
        response: { 200: z.object({ success: z.boolean() }) },
      },
    },
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const { roundId } = request.params;
      const round = await server.db.interviewRound.findFirst({
        where: { id: roundId },
        include: { application: { select: { userId: true } } },
      });
      if (!round || round.application.userId !== userId) {
        return reply.status(404).send({ message: "Round not found" } as any);
      }
      await server.db.interviewRound.delete({ where: { id: roundId } });
      return reply.send({ success: true });
    }
  );
}

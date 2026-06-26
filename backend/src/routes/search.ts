import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";

export default async function searchRoutes(fastify: FastifyInstance) {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  // GET /api/search?q=
  server.get(
    "/",
    {
      preValidation: [server.authenticate],
      schema: {
        querystring: z.object({ q: z.string().optional() }),
        response: {
          200: z.object({
            applications: z.array(z.record(z.unknown())),
            notes: z.array(z.record(z.unknown())),
            files: z.array(z.record(z.unknown())),
            emails: z.array(z.record(z.unknown())),
          }),
        },
      },
    },
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const { q } = request.query;

      if (!q || !q.trim()) {
        return reply.send({ applications: [], notes: [], files: [], emails: [] });
      }

      const term = q.trim().toLowerCase();

      // All 4 searches run in parallel, all scoped to userId
      const [applications, notes, files, emails] = await Promise.all([
        server.db.application.findMany({
          where: {
            userId,
            OR: [
              { companyName: { contains: term, mode: "insensitive" } },
              { role: { contains: term, mode: "insensitive" } },
              { location: { contains: term, mode: "insensitive" } },
              { package: { contains: term, mode: "insensitive" } },
            ],
          },
          select: { id: true, companyName: true, role: true, status: true, location: true, package: true },
          orderBy: { updatedAt: "desc" },
          take: 10,
        }),

        server.db.note.findMany({
          where: {
            userId,
            OR: [
              { title: { contains: term, mode: "insensitive" } },
              { content: { contains: term, mode: "insensitive" } },
            ],
          },
          select: { id: true, title: true, content: true, applicationId: true },
          orderBy: { updatedAt: "desc" },
          take: 10,
        }),

        server.db.fileAsset.findMany({
          where: {
            userId,
            OR: [
              { label: { contains: term, mode: "insensitive" } },
              { folder: { contains: term, mode: "insensitive" } },
              { type: { contains: term, mode: "insensitive" } },
            ],
          },
          select: { id: true, label: true, type: true, folder: true, isShared: true, applicationId: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),

        server.db.emailLog.findMany({
          where: {
            userId,
            OR: [
              { sender: { contains: term, mode: "insensitive" } },
              { subject: { contains: term, mode: "insensitive" } },
              { snippet: { contains: term, mode: "insensitive" } },
            ],
          },
          select: { id: true, sender: true, subject: true, snippet: true, receivedAt: true },
          orderBy: { receivedAt: "desc" },
          take: 10,
        }),
      ]);

      return reply.send({
        applications,
        notes,
        files,
        emails: emails.map((e) => ({
          ...e,
          receivedAt: e.receivedAt?.toISOString() ?? null,
        })),
      });
    }
  );
}

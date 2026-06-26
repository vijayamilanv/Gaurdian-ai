import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";

const NoteSchema = z.object({
  id: z.string(),
  userId: z.string(),
  applicationId: z.string().nullable(),
  roundId: z.string().nullable(),
  title: z.string().nullable(),
  content: z.string(),
  companyName: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export default async function notesRoutes(fastify: FastifyInstance) {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  // GET /api/notes?applicationId=&roundId=
  server.get(
    "/",
    {
      preValidation: [server.authenticate],
      schema: {
        querystring: z.object({
          applicationId: z.string().optional(),
          roundId: z.string().optional(),
        }),
        response: { 200: z.object({ notes: z.array(NoteSchema) }) },
      },
    },
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const { applicationId, roundId } = request.query;

      const notes = await server.db.note.findMany({
        where: {
          userId,
          ...(applicationId !== undefined
            ? applicationId === "" ? { applicationId: null } : { applicationId }
            : {}),
          ...(roundId !== undefined
            ? roundId === "" ? { roundId: null } : { roundId }
            : {}),
        },
        include: { application: { select: { companyName: true } } },
        orderBy: { updatedAt: "desc" },
      });

      return reply.send({
        notes: notes.map((n) => ({
          id: n.id,
          userId: n.userId,
          applicationId: n.applicationId,
          roundId: n.roundId,
          title: n.title,
          content: n.content,
          companyName: n.application?.companyName ?? null,
          createdAt: n.createdAt.toISOString(),
          updatedAt: n.updatedAt.toISOString(),
        })),
      });
    }
  );

  // POST /api/notes
  server.post(
    "/",
    {
      preValidation: [server.authenticate],
      schema: {
        body: z.object({
          content: z.string().min(1),
          title: z.string().optional(),
          applicationId: z.string().optional(),
          roundId: z.string().optional(),
        }),
        response: { 201: z.object({ note: NoteSchema }) },
      },
    },
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const { content, title, applicationId, roundId } = request.body;

      const note = await server.db.note.create({
        data: {
          userId,
          content,
          title: title ?? null,
          applicationId: applicationId ?? null,
          roundId: roundId ?? null,
        },
        include: { application: { select: { companyName: true } } },
      });

      return reply.status(201).send({
        note: {
          id: note.id,
          userId: note.userId,
          applicationId: note.applicationId,
          roundId: note.roundId,
          title: note.title,
          content: note.content,
          companyName: note.application?.companyName ?? null,
          createdAt: note.createdAt.toISOString(),
          updatedAt: note.updatedAt.toISOString(),
        },
      });
    }
  );

  // PATCH /api/notes/:id
  server.patch(
    "/:id",
    {
      preValidation: [server.authenticate],
      schema: {
        params: z.object({ id: z.string() }),
        body: z.object({
          title: z.string().nullable().optional(),
          content: z.string().optional(),
          applicationId: z.string().nullable().optional(),
          roundId: z.string().nullable().optional(),
        }),
        response: { 200: z.object({ note: NoteSchema }) },
      },
    },
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const { id } = request.params;
      const { title, content, applicationId, roundId } = request.body;

      const existing = await server.db.note.findFirst({ where: { id, userId } });
      if (!existing) return reply.status(404).send({ message: "Note not found" } as any);

      const note = await server.db.note.update({
        where: { id },
        data: {
          ...(title !== undefined && { title }),
          ...(content !== undefined && { content }),
          ...(applicationId !== undefined && { applicationId }),
          ...(roundId !== undefined && { roundId }),
        },
        include: { application: { select: { companyName: true } } },
      });

      return reply.send({
        note: {
          id: note.id,
          userId: note.userId,
          applicationId: note.applicationId,
          roundId: note.roundId,
          title: note.title,
          content: note.content,
          companyName: note.application?.companyName ?? null,
          createdAt: note.createdAt.toISOString(),
          updatedAt: note.updatedAt.toISOString(),
        },
      });
    }
  );

  // DELETE /api/notes/:id
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
      const existing = await server.db.note.findFirst({ where: { id, userId } });
      if (!existing) return reply.status(404).send({ message: "Note not found" } as any);
      await server.db.note.delete({ where: { id } });
      return reply.send({ success: true });
    }
  );
}

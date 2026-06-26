import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";

export default async function activitiesRoutes(fastify: FastifyInstance) {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  // POST /api/activities — log a new activity
  server.post(
    "/",
    {
      preValidation: [server.authenticate],
      schema: {
        body: z.object({
          type: z.enum(["study", "coding", "sleep", "work", "exercise", "other"]),
          hours: z.number().min(0).max(24),
          date: z.string().datetime({ offset: true }).or(z.string().date()),
        }),
        response: {
          201: z.object({
            activity: z.object({
              id: z.string(),
              type: z.string(),
              hours: z.number(),
              date: z.string(),
            }),
          }),
        },
      },
    },
    async (request, reply) => {
      const payload = request.user as { id: string };
      const { type, hours, date } = request.body;

      const activity = await server.db.activity.create({
        data: {
          userId: payload.id,
          type,
          hours,
          date: new Date(date),
        },
      });

      return reply.status(201).send({
        activity: {
          id: activity.id,
          type: activity.type,
          hours: activity.hours,
          date: activity.date.toISOString(),
        },
      });
    }
  );

  // GET /api/activities — last 30 days of activity
  server.get(
    "/",
    {
      preValidation: [server.authenticate],
      schema: {
        response: {
          200: z.object({
            activities: z.array(
              z.object({
                id: z.string(),
                type: z.string(),
                hours: z.number(),
                date: z.string(),
              })
            ),
          }),
        },
      },
    },
    async (request, reply) => {
      const payload = request.user as { id: string };
      const since = new Date();
      since.setDate(since.getDate() - 30);

      const activities = await server.db.activity.findMany({
        where: {
          userId: payload.id,
          date: { gte: since },
        },
        orderBy: { date: "desc" },
      });

      return reply.status(200).send({
        activities: activities.map((a) => ({
          id: a.id,
          type: a.type,
          hours: a.hours,
          date: a.date.toISOString(),
        })),
      });
    }
  );
}

import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";

export default async function profileRoutes(fastify: FastifyInstance) {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  // GET /api/profile
  server.get(
    "/",
    {
      preValidation: [server.authenticate],
      schema: {
        response: {
          200: z.object({
            profile: z.object({
              cgpa: z.number().nullable(),
              attendance: z.number().nullable(),
              dsaSolved: z.number().nullable(),
              targetRoles: z.array(z.string()),
            }).nullable(),
            skills: z.array(
              z.object({
                id: z.string(),
                skillName: z.string(),
                proficiency: z.number(),
              })
            ),
            projects: z.array(
              z.object({
                id: z.string(),
                title: z.string(),
                description: z.string().nullable(),
                techStack: z.array(z.string()),
              })
            ),
          }),
        },
      },
    },
    async (request, reply) => {
      const payload = request.user as { id: string; email: string };
      const userId = payload.id;

      const profile = await server.db.profile.findUnique({
        where: { userId },
      });

      const skills = await server.db.skill.findMany({
        where: { userId },
      });

      const projects = await server.db.project.findMany({
        where: { userId },
      });

      return reply.status(200).send({
        profile: profile
          ? {
              cgpa: profile.cgpa,
              attendance: profile.attendance,
              dsaSolved: profile.dsaSolved,
              targetRoles: profile.targetRoles,
            }
          : null,
        skills: skills.map((s) => ({
          id: s.id,
          skillName: s.skillName,
          proficiency: s.proficiency,
        })),
        projects: projects.map((p) => ({
          id: p.id,
          title: p.title,
          description: p.description,
          techStack: p.techStack,
        })),
      });
    }
  );

  // PUT /api/profile
  server.put(
    "/",
    {
      preValidation: [server.authenticate],
      schema: {
        body: z.object({
          cgpa: z.number().min(0).max(10).optional(),
          attendance: z.number().min(0).max(100).optional(),
          dsaSolved: z.number().min(0).optional(),
          targetRoles: z.array(z.string()).optional(),
          skills: z
            .array(
              z.object({
                skillName: z.string(),
                proficiency: z.number().min(1).max(5),
              })
            )
            .optional(),
          projects: z
            .array(
              z.object({
                title: z.string(),
                description: z.string().optional(),
                techStack: z.array(z.string()),
              })
            )
            .optional(),
        }),
        response: {
          200: z.object({
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const payload = request.user as { id: string; email: string };
      const userId = payload.id;
      const { cgpa, attendance, dsaSolved, targetRoles, skills, projects } = request.body;

      // Upsert profile
      await server.db.profile.upsert({
        where: { userId },
        update: {
          cgpa: cgpa ?? undefined,
          attendance: attendance ?? undefined,
          dsaSolved: dsaSolved ?? undefined,
          targetRoles: targetRoles ?? undefined,
        },
        create: {
          userId,
          cgpa: cgpa ?? null,
          attendance: attendance ?? null,
          dsaSolved: dsaSolved ?? null,
          targetRoles: targetRoles || [],
        },
      });

      // Update skills (delete and recreate for simplicity)
      if (skills !== undefined) {
        await server.db.skill.deleteMany({ where: { userId } });
        if (skills.length > 0) {
          await server.db.skill.createMany({
            data: skills.map((s) => ({
              userId,
              skillName: s.skillName,
              proficiency: s.proficiency,
            })),
          });
        }
      }

      // Update projects (delete and recreate for simplicity)
      if (projects !== undefined) {
        await server.db.project.deleteMany({ where: { userId } });
        if (projects.length > 0) {
          await server.db.project.createMany({
            data: projects.map((p) => ({
              userId,
              title: p.title,
              description: p.description || null,
              techStack: p.techStack,
            })),
          });
        }
      }

      return reply.status(200).send({ message: "Profile updated successfully" });
    }
  );
}

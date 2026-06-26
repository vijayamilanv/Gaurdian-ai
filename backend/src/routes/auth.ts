import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";
import bcrypt from "bcryptjs";

export default async function authRoutes(fastify: FastifyInstance) {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  // POST /api/auth/signup
  server.post(
    "/signup",
    {
      schema: {
        body: z.object({
          name: z.string().min(2, "Name must be at least 2 characters"),
          email: z.string().email("Invalid email address"),
          password: z.string().min(6, "Password must be at least 6 characters"),
        }),
        response: {
          201: z.object({
            user: z.object({
              id: z.string(),
              name: z.string(),
              email: z.string(),
            }),
            token: z.string(),
          }),
          400: z.object({
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { name, email, password } = request.body;

      const existingUser = await server.db.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return reply.status(400).send({ message: "Email is already registered" });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const user = await server.db.user.create({
        data: {
          name,
          email,
          passwordHash,
        },
      });

      const token = server.jwt.sign({ id: user.id, email: user.email });

      return reply.status(201).send({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        token,
      });
    }
  );

  // POST /api/auth/login
  server.post(
    "/login",
    {
      schema: {
        body: z.object({
          email: z.string().email("Invalid email address"),
          password: z.string(),
        }),
        response: {
          200: z.object({
            user: z.object({
              id: z.string(),
              name: z.string(),
              email: z.string(),
            }),
            token: z.string(),
          }),
          401: z.object({
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;

      const user = await server.db.user.findUnique({
        where: { email },
      });

      if (!user) {
        return reply.status(401).send({ message: "Invalid email or password" });
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

      if (!isPasswordValid) {
        return reply.status(401).send({ message: "Invalid email or password" });
      }

      const token = server.jwt.sign({ id: user.id, email: user.email });

      return reply.status(200).send({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        token,
      });
    }
  );

  // GET /api/auth/me
  server.get(
    "/me",
    {
      preValidation: [server.authenticate],
      schema: {
        response: {
          200: z.object({
            user: z.object({
              id: z.string(),
              name: z.string(),
              email: z.string(),
            }),
          }),
          401: z.object({
            error: z.string(),
            message: z.string(),
          }),
          404: z.object({
            message: z.string(),
          }),
        },
      },
    },
    async (request, reply) => {
      const payload = request.user as { id: string; email: string };
      const user = await server.db.user.findUnique({
        where: { id: payload.id },
      });

      if (!user) {
        return reply.status(404).send({ message: "User not found" });
      }

      return reply.status(200).send({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      });
    }
  );
}

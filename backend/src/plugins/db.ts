import { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { PrismaClient } from "@prisma/client";

declare module "fastify" {
  interface FastifyInstance {
    db: PrismaClient;
  }
}

export default fp(async function prismaPlugin(fastify: FastifyInstance) {
  const prisma = new PrismaClient({
    log: process.env.NODE_ENV === "test" ? [] : ["error", "warn"],
  });

  try {
    await prisma.$connect();
    fastify.log.info("Database connected successfully");
  } catch (error) {
    fastify.log.error(error, "Failed to connect to database");
  }

  fastify.decorate("db", prisma);

  fastify.addHook("onClose", async (server) => {
    server.log.info("Disconnecting database...");
    await server.db.$disconnect();
  });
});

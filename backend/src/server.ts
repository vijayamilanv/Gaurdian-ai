import Fastify from "fastify";
import cors from "@fastify/cors";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import dbPlugin from "./plugins/db.js";
import authPlugin from "./plugins/auth.js";
import authRoutes from "./routes/auth.js";
import profileRoutes from "./routes/profile.js";
import activitiesRoutes from "./routes/activities.js";
import predictionsRoutes from "./routes/predictions.js";
import applicationsRoutes from "./routes/applications.js";
import notesRoutes from "./routes/notes.js";
import searchRoutes from "./routes/search.js";
import agentRoutes from "./routes/agent.js";
import filesRoutes from "./routes/files.js";
import scheduleRoutes from "./routes/schedule.js";
import gmailRoutes from "./routes/gmail.js";
import examRoutes from "./routes/exam.js";
import healthRoutes from "./routes/health.js";
import companionRoutes from "./routes/companion.js";
import guardianRoutes from "./routes/guardian.js";

const server = Fastify({
  logger: process.env.NODE_ENV === "test" ? false : {
    transport: {
      target: "pino-pretty",
      options: {
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      },
    },
  },
});

// Set Zod compiler
server.setValidatorCompiler(validatorCompiler);
server.setSerializerCompiler(serializerCompiler);

// CORS
server.register(cors, {
  origin: "*",
});

// Register custom plugins
server.register(dbPlugin);
server.register(authPlugin);

// Register routes
server.register(authRoutes, { prefix: "/api/auth" });
server.register(profileRoutes, { prefix: "/api/profile" });
server.register(activitiesRoutes, { prefix: "/api/activities" });
server.register(predictionsRoutes, { prefix: "/api/predictions" });
server.register(applicationsRoutes, { prefix: "/api/applications" });
server.register(notesRoutes, { prefix: "/api/notes" });
server.register(searchRoutes, { prefix: "/api/search" });
server.register(agentRoutes, { prefix: "/api/agent" });
server.register(filesRoutes,    { prefix: "/api/files" });
server.register(scheduleRoutes, { prefix: "/api/schedule" });
server.register(gmailRoutes,    { prefix: "/api/gmail" });
server.register(examRoutes,     { prefix: "/api/exam" });
server.register(healthRoutes,   { prefix: "/api/health" });
server.register(companionRoutes, { prefix: "/api/companion" });
server.register(guardianRoutes,  { prefix: "/api/guardian" });

// Health check
server.get("/health", async () => {
  return { status: "ok", service: "backend" };
});

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3000;
    const host = process.env.HOST || "0.0.0.0";
    if (process.env.NODE_ENV !== "test") {
      await server.listen({ port, host });
    }
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();

export { server };

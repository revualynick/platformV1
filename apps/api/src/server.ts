import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { authRoutes } from "./modules/auth/routes.js";
import { chatRoutes } from "./modules/chat/routes.js";
import { feedbackRoutes } from "./modules/feedback/routes.js";
import { usersRoutes } from "./modules/users/routes.js";
import { orgRoutes } from "./modules/org/routes.js";
import { engagementRoutes } from "./modules/engagement/routes.js";
import { kudosRoutes } from "./modules/kudos/routes.js";
import { escalationRoutes } from "./modules/escalation/routes.js";
import { relationshipsRoutes } from "./modules/relationships/routes.js";
import { calibrationRoutes } from "./modules/calibration/routes.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const HOST = process.env.HOST ?? "0.0.0.0";

async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
    },
  });

  // Plugins
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? "http://localhost:3001",
    credentials: true,
  });
  await app.register(cookie);

  // Health check
  app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  // API routes
  await app.register(authRoutes, { prefix: "/api/v1/auth" });
  await app.register(usersRoutes, { prefix: "/api/v1/users" });
  await app.register(feedbackRoutes, { prefix: "/api/v1" });
  await app.register(engagementRoutes, { prefix: "/api/v1" });
  await app.register(kudosRoutes, { prefix: "/api/v1/kudos" });
  await app.register(escalationRoutes, { prefix: "/api/v1/escalations" });
  await app.register(orgRoutes, { prefix: "/api/v1/admin" });
  await app.register(relationshipsRoutes, { prefix: "/api/v1" });
  await app.register(calibrationRoutes, { prefix: "/api/v1" });

  // Webhook routes
  await app.register(chatRoutes, { prefix: "/webhooks" });

  return app;
}

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Server running on ${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();

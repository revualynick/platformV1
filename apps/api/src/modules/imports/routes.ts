import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { parseBody, idParamSchema, importUploadSchema, importMappingSchema } from "../../lib/validation.js";
import { requireRole, getAuthenticatedUserId } from "../../lib/rbac.js";
import {
  ImportError,
  approveRun,
  commitRun,
  getImportRun,
  runView,
  setMappingAndDryRun,
  stageUpload,
} from "../../lib/imports/pipeline.js";

/**
 * Customer data imports (admin only): upload -> mapping/dry run -> approve
 * -> commit. See lib/imports/pipeline.ts. Registered at /api/v1/admin/imports.
 */
export const importRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireRole("admin"));

  // ImportError messages are written for the admin; send them as they are
  // (the global handler would reduce them to "Bad request").
  const handle = async (reply: FastifyReply, work: () => Promise<unknown>) => {
    try {
      return reply.send(await work());
    } catch (err) {
      if (err instanceof ImportError) {
        return reply.code(err.statusCode).send({ error: err.message, ...(err.details ? { details: err.details } : {}) });
      }
      throw err;
    }
  };

  // POST /admin/imports: Stage a file and propose a mapping (or read the org chart)
  app.post("/", { bodyLimit: 30 * 1024 * 1024 }, async (request, reply) => {
    const body = parseBody(importUploadSchema, request.body);
    const data = Buffer.from(body.dataBase64, "base64");
    if (data.length === 0) return reply.code(400).send({ error: "The file is empty" });
    reply.code(201);
    return handle(reply, async () =>
      runView(
        await stageUpload(request.tenant.db, request.server.llm, {
          kind: body.kind,
          fileName: body.fileName,
          contentType: body.contentType,
          data,
          sourceSystem: body.sourceSystem,
          createdBy: getAuthenticatedUserId(request),
        }, { logger: { warn: (...args: unknown[]) => request.log.warn(args.map(String).join(" ")) } }),
      ),
    );
  });

  // GET /admin/imports/:id: The run, its mapping and its report
  app.get("/:id", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    return handle(reply, async () => runView(await getImportRun(request.tenant.db, id)));
  });

  // PUT /admin/imports/:id/mapping: Set or confirm the mapping; runs the dry run
  app.put("/:id/mapping", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    const body = parseBody(importMappingSchema, request.body ?? {});
    return handle(reply, async () => runView(await setMappingAndDryRun(request.tenant.db, id, body)));
  });

  // POST /admin/imports/:id/approve: Approve the dry run (refused while it has blocking issues)
  app.post("/:id/approve", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    return handle(reply, async () => runView(await approveRun(request.tenant.db, id, getAuthenticatedUserId(request))));
  });

  // POST /admin/imports/:id/commit: Apply the approved plan
  app.post("/:id/commit", async (request, reply) => {
    const { id } = parseBody(idParamSchema, request.params);
    return handle(reply, async () =>
      runView(await commitRun(request.tenant.db, id, getAuthenticatedUserId(request), { logger: { error: (...a: unknown[]) => request.log.error(a) } })),
    );
  });
};

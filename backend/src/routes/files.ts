import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { randomUUID } from "crypto";
import z from "zod";
import {
  getPresignedPutUrl,
  getPresignedGetUrl,
  deleteR2Object,
  r2Configured,
} from "../lib/r2.js";

const FILE_TYPES = ["certificate", "resume", "offer_letter", "resource", "other"] as const;

const FileAssetSchema = z.object({
  id:            z.string(),
  userId:        z.string(),
  applicationId: z.string().nullable(),
  label:         z.string(),
  type:          z.string(),
  r2Key:         z.string(),
  mimeType:      z.string().nullable(),
  sizeBytes:     z.number().nullable(),
  isShared:      z.boolean(),
  folder:        z.string().nullable(),
  createdAt:     z.string(),
});

export default async function filesRoutes(fastify: FastifyInstance) {
  const server = fastify.withTypeProvider<ZodTypeProvider>();

  // ── GET /api/files — list user files ───────────────────────────────────────
  server.get(
    "/",
    {
      preValidation: [server.authenticate],
      schema: {
        querystring: z.object({
          applicationId: z.string().optional(),
          type:          z.string().optional(),
          folder:        z.string().optional(),
        }),
        response: {
          200: z.object({
            files:        z.array(FileAssetSchema),
            r2Configured: z.boolean(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const { applicationId, type, folder } = request.query;

      const files = await server.db.fileAsset.findMany({
        where: {
          userId,
          ...(applicationId ? { applicationId } : {}),
          ...(type   ? { type }   : {}),
          ...(folder ? { folder } : {}),
        },
        orderBy: { createdAt: "desc" },
      });

      return reply.send({
        files: files.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() })),
        r2Configured: r2Configured(),
      });
    }
  );

  // ── POST /api/files/init-upload — get a presigned PUT URL ─────────────────
  //    Client uploads directly to R2 with this URL, then calls /api/files/confirm
  server.post(
    "/init-upload",
    {
      preValidation: [server.authenticate],
      schema: {
        body: z.object({
          label:         z.string().min(1),
          type:          z.enum(FILE_TYPES),
          mimeType:      z.string(),
          sizeBytes:     z.number().positive().max(50 * 1024 * 1024), // 50 MB max
          applicationId: z.string().optional(),
          folder:        z.string().optional(),
          isShared:      z.boolean().optional(),
        }),
        response: {
          200: z.object({
            uploadUrl: z.string().nullable(),
            r2Key:     z.string(),
            message:   z.string().optional(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const { label, type, mimeType, sizeBytes, applicationId, folder, isShared } = request.body;

      // Generate a scoped R2 key: userId/type/uuid-label
      const ext = mimeType.split("/")[1]?.replace("+xml", "") ?? "bin";
      const r2Key = `${userId}/${type}/${randomUUID()}-${label.replace(/\s+/g, "_")}.${ext}`;

      const uploadUrl = await getPresignedPutUrl(r2Key, mimeType);

      // Pre-create the FileAsset record (without sizeBytes confirmed yet)
      await server.db.fileAsset.create({
        data: {
          userId,
          label,
          type,
          r2Key,
          mimeType,
          sizeBytes,
          applicationId: applicationId ?? null,
          folder:        folder ?? null,
          isShared:      isShared ?? false,
        },
      });

      return reply.send({
        uploadUrl,
        r2Key,
        message: uploadUrl ? undefined : "R2 not configured — file metadata saved but no upload URL generated",
      });
    }
  );

  // ── GET /api/files/:id/download — get a presigned GET URL ─────────────────
  server.get(
    "/:id/download",
    {
      preValidation: [server.authenticate],
      schema: {
        params:   z.object({ id: z.string() }),
        response: { 200: z.object({ downloadUrl: z.string().nullable() }) },
      },
    },
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const { id } = request.params;

      const file = await server.db.fileAsset.findFirst({
        where: {
          id,
          OR: [{ userId }, { isShared: true }],
        },
      });
      if (!file) return reply.status(404).send({ message: "File not found" } as any);

      const downloadUrl = await getPresignedGetUrl(file.r2Key);
      return reply.send({ downloadUrl });
    }
  );

  // ── PATCH /api/files/:id — update label, folder, isShared ─────────────────
  server.patch(
    "/:id",
    {
      preValidation: [server.authenticate],
      schema: {
        params: z.object({ id: z.string() }),
        body: z.object({
          label:    z.string().optional(),
          folder:   z.string().nullable().optional(),
          isShared: z.boolean().optional(),
          type:     z.enum(FILE_TYPES).optional(),
        }),
        response: { 200: z.object({ file: FileAssetSchema }) },
      },
    },
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const { id } = request.params;
      const existing = await server.db.fileAsset.findFirst({ where: { id, userId } });
      if (!existing) return reply.status(404).send({ message: "File not found" } as any);

      const { label, folder, isShared, type } = request.body;
      const file = await server.db.fileAsset.update({
        where: { id },
        data: {
          ...(label    !== undefined && { label }),
          ...(folder   !== undefined && { folder }),
          ...(isShared !== undefined && { isShared }),
          ...(type     !== undefined && { type }),
        },
      });
      return reply.send({ file: { ...file, createdAt: file.createdAt.toISOString() } });
    }
  );

  // ── DELETE /api/files/:id — delete from R2 + DB ───────────────────────────
  server.delete(
    "/:id",
    {
      preValidation: [server.authenticate],
      schema: {
        params:   z.object({ id: z.string() }),
        response: { 200: z.object({ success: z.boolean() }) },
      },
    },
    async (request, reply) => {
      const { id: userId } = request.user as { id: string };
      const { id } = request.params;
      const file = await server.db.fileAsset.findFirst({ where: { id, userId } });
      if (!file) return reply.status(404).send({ message: "File not found" } as any);

      await deleteR2Object(file.r2Key);
      await server.db.fileAsset.delete({ where: { id } });
      return reply.send({ success: true });
    }
  );
}

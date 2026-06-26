/**
 * Phase 5c: Semester Exam Prep Routes
 *
 * Subjects (CRUD) → Study Materials (link FileAsset) → Model Tests (AI-generated)
 * → Test Submissions (typed text or handwritten image → AI graded)
 *
 * Routes:
 *   POST   /api/exam/subjects
 *   GET    /api/exam/subjects
 *   DELETE /api/exam/subjects/:id
 *
 *   POST   /api/exam/subjects/:subjectId/materials
 *   DELETE /api/exam/materials/:id
 *
 *   POST   /api/exam/subjects/:subjectId/tests/generate
 *   GET    /api/exam/subjects/:subjectId/tests
 *
 *   POST   /api/exam/tests/:testId/submit
 *   GET    /api/exam/submissions/:id
 */

import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";

const AI_URL = process.env.AI_SERVICE_URL ?? "http://localhost:8000";

export default async function examRoutes(fastify: FastifyInstance) {
  const s = fastify.withTypeProvider<ZodTypeProvider>();

  // ── Subjects ───────────────────────────────────────────────────────────────

  s.post(
    "/subjects",
    {
      preValidation: [s.authenticate],
      schema: {
        body: z.object({ name: z.string().min(1), semester: z.string().optional() }),
        response: { 200: z.object({ id: z.string(), name: z.string(), semester: z.string().nullable() }) },
      },
    },
    async (req, reply) => {
      const { id: userId } = req.user as { id: string };
      const { name, semester } = req.body;
      const subject = await s.db.subject.upsert({
        where:  { userId_name: { userId, name } },
        create: { userId, name, semester: semester ?? null },
        update: { semester: semester ?? undefined },
      });
      return reply.send({ id: subject.id, name: subject.name, semester: subject.semester ?? null });
    }
  );

  s.get(
    "/subjects",
    {
      preValidation: [s.authenticate],
      schema: {
        response: {
          200: z.object({
            subjects: z.array(z.object({
              id:        z.string(),
              name:      z.string(),
              semester:  z.string().nullable(),
              materials: z.number(),
              tests:     z.number(),
              createdAt: z.string(),
            })),
          }),
        },
      },
    },
    async (req, reply) => {
      const { id: userId } = req.user as { id: string };
      const subjects = await s.db.subject.findMany({
        where:   { userId },
        include: { _count: { select: { materials: true, tests: true } } },
        orderBy: { createdAt: "desc" },
      });
      return reply.send({
        subjects: subjects.map((sub) => ({
          id:        sub.id,
          name:      sub.name,
          semester:  sub.semester ?? null,
          materials: sub._count.materials,
          tests:     sub._count.tests,
          createdAt: sub.createdAt.toISOString(),
        })),
      });
    }
  );

  s.delete(
    "/subjects/:id",
    { preValidation: [s.authenticate] },
    async (req, reply) => {
      const { id: userId } = req.user as { id: string };
      const { id } = (req.params as any);
      await s.db.subject.deleteMany({ where: { id, userId } });
      return reply.send({ ok: true });
    }
  );

  // ── Study Materials ────────────────────────────────────────────────────────

  s.post(
    "/subjects/:subjectId/materials",
    {
      preValidation: [s.authenticate],
      schema: {
        params: z.object({ subjectId: z.string() }),
        body: z.object({
          fileAssetId: z.string(),
          type:        z.enum(["notes", "pyq"]),
          label:       z.string().optional(),
        }),
        response: { 200: z.object({ id: z.string() }) },
      },
    },
    async (req, reply) => {
      const { id: userId } = req.user as { id: string };
      const { subjectId } = req.params;
      const { fileAssetId, type, label } = req.body;

      // Verify subject ownership
      const subject = await s.db.subject.findFirst({ where: { id: subjectId, userId } });
      if (!subject) return reply.status(404).send({ message: "Subject not found" } as any);

      const mat = await s.db.studyMaterial.create({
        data: { subjectId, fileAssetId, type, label: label ?? null },
      });
      return reply.send({ id: mat.id });
    }
  );

  s.delete(
    "/materials/:id",
    { preValidation: [s.authenticate] },
    async (req, reply) => {
      const { id: userId } = req.user as { id: string };
      const { id } = (req.params as any);
      // Verify ownership via subject
      const mat = await s.db.studyMaterial.findFirst({
        where: { id },
        include: { subject: { select: { userId: true } } },
      });
      if (!mat || mat.subject.userId !== userId)
        return reply.status(404).send({ message: "Not found" } as any);
      await s.db.studyMaterial.delete({ where: { id } });
      return reply.send({ ok: true });
    }
  );

  // ── Generate Model Test ────────────────────────────────────────────────────

  s.post(
    "/subjects/:subjectId/tests/generate",
    {
      preValidation: [s.authenticate],
      schema: {
        params: z.object({ subjectId: z.string() }),
        body: z.object({
          totalMarks:   z.number().min(10).max(200).default(50),
          numQuestions: z.number().min(3).max(30).default(10),
          difficulty:   z.enum(["easy", "medium", "hard", "mixed"]).default("mixed"),
        }),
        response: {
          200: z.object({
            testId:     z.string(),
            subject:    z.string(),
            totalMarks: z.number(),
            questions:  z.array(z.object({
              no:           z.number(),
              question:     z.string(),
              marks:        z.number(),
              model_answer: z.string(),
              type:         z.string(),
            })),
          }),
        },
      },
    },
    async (req, reply) => {
      const { id: userId } = req.user as { id: string };
      const { subjectId } = req.params;
      const { totalMarks, numQuestions, difficulty } = req.body;

      const subject = await s.db.subject.findFirst({
        where:   { id: subjectId, userId },
        include: {
          materials: {
            include: { /* we'll fetch the text from file or use placeholder */ },
            take: 5,
          },
        },
      });
      if (!subject) return reply.status(404).send({ message: "Subject not found" } as any);

      // Aggregate notes text from associated file assets (text files only)
      // For now: request generation without notes_text (AI generates general questions)
      // — file text extraction would need a separate pipeline
      const notesText = ""; // TODO: extract text from R2 assets

      // Call AI service
      const aiRes = await fetch(`${AI_URL}/exam/generate-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject:       subject.name,
          notes_text:    notesText,
          total_marks:   totalMarks,
          num_questions: numQuestions,
          difficulty,
        }),
      });
      if (!aiRes.ok) {
        const text = await aiRes.text();
        return reply.status(502).send({ message: `AI error: ${text}` } as any);
      }
      const data = await aiRes.json() as {
        subject: string; questions: any[]; totalMarks: number;
      };

      // Persist test
      const test = await s.db.modelTest.create({
        data: {
          subjectId,
          questions:  data.questions,
          totalMarks: data.totalMarks,
          status:     "ready",
        },
      });

      return reply.send({
        testId:     test.id,
        subject:    data.subject,
        totalMarks: data.totalMarks,
        questions:  data.questions,
      });
    }
  );

  s.get(
    "/subjects/:subjectId/tests",
    {
      preValidation: [s.authenticate],
      schema: {
        params: z.object({ subjectId: z.string() }),
        response: {
          200: z.object({
            tests: z.array(z.object({
              id:          z.string(),
              totalMarks:  z.number(),
              status:      z.string(),
              createdAt:   z.string(),
              submissions: z.number(),
            })),
          }),
        },
      },
    },
    async (req, reply) => {
      const { id: userId } = req.user as { id: string };
      const { subjectId } = req.params;

      const subject = await s.db.subject.findFirst({ where: { id: subjectId, userId } });
      if (!subject) return reply.status(404).send({ message: "Subject not found" } as any);

      const tests = await s.db.modelTest.findMany({
        where:   { subjectId },
        include: { _count: { select: { submissions: true } } },
        orderBy: { createdAt: "desc" },
      });

      return reply.send({
        tests: tests.map((t) => ({
          id:          t.id,
          totalMarks:  t.totalMarks,
          status:      t.status,
          createdAt:   t.createdAt.toISOString(),
          submissions: t._count.submissions,
        })),
      });
    }
  );

  // ── Submit & Evaluate ─────────────────────────────────────────────────────

  s.post(
    "/tests/:testId/submit",
    {
      preValidation: [s.authenticate],
      schema: {
        params: z.object({ testId: z.string() }),
        body: z.object({
          answerText:      z.string().optional(),
          answerImageB64:  z.string().optional(),  // base64 image of handwritten sheet
        }),
        response: {
          200: z.object({
            submissionId:    z.string(),
            totalAwarded:    z.number(),
            maxMarks:        z.number(),
            percentage:      z.number(),
            overallFeedback: z.string(),
            perQuestion:     z.array(z.object({
              no:       z.number(),
              awarded:  z.number(),
              feedback: z.string(),
            })),
          }),
        },
      },
    },
    async (req, reply) => {
      const { id: userId } = req.user as { id: string };
      const { testId } = req.params;
      const { answerText, answerImageB64 } = req.body;

      if (!answerText && !answerImageB64)
        return reply.status(400).send({ message: "Provide answerText or answerImageB64" } as any);

      // Load test + subject
      const test = await s.db.modelTest.findFirst({
        where:   { id: testId },
        include: { subject: { select: { userId: true, name: true } } },
      });
      if (!test || test.subject.userId !== userId)
        return reply.status(404).send({ message: "Test not found" } as any);

      const questions = test.questions as {
        no: number; question: string; marks: number; model_answer: string;
      }[];

      // Call AI grader
      const aiRes = await fetch(`${AI_URL}/exam/evaluate-submission`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject:          test.subject.name,
          questions:        questions.map((q) => ({
            no: q.no, question: q.question, marks: q.marks, model_answer: q.model_answer,
          })),
          answer_text:      answerText ?? "",
          answer_image_b64: answerImageB64 ?? "",
        }),
      });
      if (!aiRes.ok) {
        const text = await aiRes.text();
        return reply.status(502).send({ message: `Grading error: ${text}` } as any);
      }
      const grading = await aiRes.json() as {
        perQuestion: { no: number; awarded: number; feedback: string }[];
        totalAwarded: number; maxMarks: number; overallFeedback: string;
      };

      // Persist submission
      const submission = await s.db.testSubmission.create({
        data: {
          testId,
          userId,
          answerText:      answerText ?? null,
          totalScore:      grading.totalAwarded,
          maxScore:        grading.maxMarks,
          perQuestion:     grading.perQuestion,
          overallFeedback: grading.overallFeedback,
          status:          "evaluated",
          evaluatedAt:     new Date(),
        },
      });

      // Mark test as submitted
      await s.db.modelTest.update({ where: { id: testId }, data: { status: "evaluated" } });

      const pct = grading.maxMarks > 0
        ? Math.round((grading.totalAwarded / grading.maxMarks) * 100)
        : 0;

      return reply.send({
        submissionId:    submission.id,
        totalAwarded:    grading.totalAwarded,
        maxMarks:        grading.maxMarks,
        percentage:      pct,
        overallFeedback: grading.overallFeedback,
        perQuestion:     grading.perQuestion,
      });
    }
  );

  s.get(
    "/submissions/:id",
    {
      preValidation: [s.authenticate],
      schema: {
        params: z.object({ id: z.string() }),
      },
    },
    async (req, reply) => {
      const { id: userId } = req.user as { id: string };
      const { id } = req.params;
      const sub = await s.db.testSubmission.findFirst({
        where:   { id, userId },
        include: { test: { include: { subject: { select: { name: true } } } } },
      });
      if (!sub) return reply.status(404).send({ message: "Submission not found" } as any);
      return reply.send({
        id:              sub.id,
        subject:         sub.test.subject.name,
        totalScore:      sub.totalScore,
        maxScore:        sub.maxScore,
        percentage:      sub.maxScore
          ? Math.round(((sub.totalScore ?? 0) / sub.maxScore) * 100)
          : 0,
        perQuestion:     sub.perQuestion,
        overallFeedback: sub.overallFeedback,
        status:          sub.status,
        submittedAt:     sub.submittedAt.toISOString(),
        evaluatedAt:     sub.evaluatedAt?.toISOString() ?? null,
      });
    }
  );
}

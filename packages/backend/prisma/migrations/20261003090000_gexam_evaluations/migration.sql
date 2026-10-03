CREATE TYPE "GexamEvaluationStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

CREATE TABLE "GexamEvaluation" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "externalAttemptId" TEXT NOT NULL,
    "taskVersionId" TEXT NOT NULL,
    "workflowRevision" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "status" "GexamEvaluationStatus" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "GexamEvaluation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GexamEvaluation_idempotencyKey_key" ON "GexamEvaluation"("idempotencyKey");
CREATE INDEX "GexamEvaluation_status_createdAt_idx" ON "GexamEvaluation"("status", "createdAt");
CREATE INDEX "GexamEvaluation_externalAttemptId_idx" ON "GexamEvaluation"("externalAttemptId");

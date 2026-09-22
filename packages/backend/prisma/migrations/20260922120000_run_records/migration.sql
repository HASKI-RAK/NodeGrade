-- Run records (SPEC-0020). One row per completed or failed execution, written by the
-- socket run handler before the terminal event and read over REST (ADR-0009). The trace
-- stays ephemeral; only the answer, the emitted outputs and the derived review flag are
-- kept. Rows go with their workspace and their workflow.

-- CreateEnum
CREATE TYPE "RunOutcome" AS ENUM ('COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "outcome" "RunOutcome" NOT NULL,
    "answer" TEXT NOT NULL,
    "outputs" JSONB NOT NULL,
    "score" DOUBLE PRECISION,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,
    "errorMessage" TEXT,
    "submittedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Run_workflowId_startedAt_idx" ON "Run"("workflowId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "Run_workspaceId_idx" ON "Run"("workspaceId");

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

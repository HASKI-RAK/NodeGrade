-- Workflow version history (SPEC-0021). One row per captured past state of a workflow,
-- written before the state it holds is overwritten. Rows go with their workflow, and a
-- per-workflow cap keeps the table bounded.

-- CreateTable
CREATE TABLE "WorkflowVersion" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentSchema" INTEGER NOT NULL DEFAULT 2,
    "reason" TEXT NOT NULL DEFAULT 'save',
    "nodeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowVersion_workflowId_createdAt_idx" ON "WorkflowVersion"("workflowId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "WorkflowVersion" ADD CONSTRAINT "WorkflowVersion_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

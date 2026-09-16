-- A provider whose policy mode was never chosen must be distinguishable from one the
-- facilitator deliberately set to DENY_ALL, so the column loses its implicit default.
ALTER TABLE "ModelPolicy" ALTER COLUMN "mode" DROP NOT NULL;
ALTER TABLE "ModelPolicy" ALTER COLUMN "mode" DROP DEFAULT;

-- CreateTable
CREATE TABLE "ExecutionLimits" (
    "id" TEXT NOT NULL,
    "workspaceConcurrentRuns" INTEGER NOT NULL,
    "providerConcurrentRequests" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExecutionLimits_pkey" PRIMARY KEY ("id")
);

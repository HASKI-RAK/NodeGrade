-- Facilitator-owned deployment default model (SPEC-0016). One singleton row; the
-- service materializes it on first read, so no seed row is inserted here.
CREATE TABLE "DeploymentSettings" (
    "id" TEXT NOT NULL,
    "defaultProviderKey" TEXT,
    "defaultModelId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeploymentSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Graph" (
    "id" SERIAL NOT NULL,
    "path" TEXT NOT NULL,
    "version" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "lastNodeId" INTEGER NOT NULL DEFAULT 0,
    "lastLinkId" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Graph_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraphNode" (
    "id" INTEGER NOT NULL,
    "graphId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "posX" DOUBLE PRECISION NOT NULL,
    "posY" DOUBLE PRECISION NOT NULL,
    "sizeWidth" DOUBLE PRECISION,
    "sizeHeight" DOUBLE PRECISION,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "title" TEXT,
    "mode" INTEGER NOT NULL DEFAULT 0,
    "flags" JSONB NOT NULL DEFAULT '{}',
    "order" INTEGER,
    "color" TEXT,

    CONSTRAINT "GraphNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraphNodeInput" (
    "id" SERIAL NOT NULL,
    "nodeId" INTEGER NOT NULL,
    "graphId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "linkId" INTEGER,

    CONSTRAINT "GraphNodeInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraphNodeOutput" (
    "id" SERIAL NOT NULL,
    "nodeId" INTEGER NOT NULL,
    "graphId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "slotIndex" INTEGER,

    CONSTRAINT "GraphNodeOutput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraphLink" (
    "id" INTEGER NOT NULL,
    "graphId" INTEGER NOT NULL,
    "originId" INTEGER NOT NULL,
    "originSlot" INTEGER NOT NULL,
    "targetId" INTEGER NOT NULL,
    "targetSlot" INTEGER NOT NULL,
    "type" TEXT,
    "outputId" INTEGER,

    CONSTRAINT "GraphLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraphGroup" (
    "id" SERIAL NOT NULL,
    "graphId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "boundingX" DOUBLE PRECISION NOT NULL,
    "boundingY" DOUBLE PRECISION NOT NULL,
    "boundingW" DOUBLE PRECISION NOT NULL,
    "boundingH" DOUBLE PRECISION NOT NULL,
    "color" TEXT,

    CONSTRAINT "GraphGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" SERIAL NOT NULL,
    "path" TEXT NOT NULL,
    "modelUrl" TEXT NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LtiPlatform" (
    "id" SERIAL NOT NULL,
    "clientId" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "jwksUri" TEXT NOT NULL,
    "authorizationEndpoint" TEXT NOT NULL,
    "registrationEndpoint" TEXT NOT NULL,
    "scopesSupported" TEXT[],
    "responseTypesSupported" TEXT[],
    "subjectTypesSupported" TEXT[],
    "idTokenSigningAlgValuesSupported" TEXT[],
    "claimsSupported" TEXT[],
    "productFamilyCode" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "variables" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LtiPlatform_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LtiClientRegistration" (
    "id" SERIAL NOT NULL,
    "clientId" TEXT NOT NULL,
    "responseTypes" TEXT[],
    "jwksUri" TEXT NOT NULL,
    "initiateLoginUri" TEXT NOT NULL,
    "grantTypes" TEXT[],
    "redirectUris" TEXT[],
    "applicationType" TEXT NOT NULL,
    "tokenEndpointAuthMethod" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "logoUri" TEXT,
    "scope" TEXT NOT NULL,
    "ltiToolConfiguration" JSONB NOT NULL,
    "ltiPlatformId" INTEGER NOT NULL,

    CONSTRAINT "LtiClientRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Graph_path_key" ON "Graph"("path");

-- CreateIndex
CREATE UNIQUE INDEX "GraphNode_id_graphId_key" ON "GraphNode"("id", "graphId");

-- CreateIndex
CREATE UNIQUE INDEX "GraphLink_id_graphId_key" ON "GraphLink"("id", "graphId");

-- CreateIndex
CREATE UNIQUE INDEX "Settings_path_key" ON "Settings"("path");

-- CreateIndex
CREATE UNIQUE INDEX "LtiPlatform_clientId_key" ON "LtiPlatform"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "LtiClientRegistration_clientId_key" ON "LtiClientRegistration"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "LtiClientRegistration_ltiPlatformId_key" ON "LtiClientRegistration"("ltiPlatformId");

-- AddForeignKey
ALTER TABLE "GraphNode" ADD CONSTRAINT "GraphNode_graphId_fkey" FOREIGN KEY ("graphId") REFERENCES "Graph"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphNodeInput" ADD CONSTRAINT "GraphNodeInput_nodeId_graphId_fkey" FOREIGN KEY ("nodeId", "graphId") REFERENCES "GraphNode"("id", "graphId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphNodeInput" ADD CONSTRAINT "GraphNodeInput_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "GraphLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphNodeOutput" ADD CONSTRAINT "GraphNodeOutput_nodeId_graphId_fkey" FOREIGN KEY ("nodeId", "graphId") REFERENCES "GraphNode"("id", "graphId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphLink" ADD CONSTRAINT "GraphLink_graphId_fkey" FOREIGN KEY ("graphId") REFERENCES "Graph"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphLink" ADD CONSTRAINT "GraphLink_outputId_fkey" FOREIGN KEY ("outputId") REFERENCES "GraphNodeOutput"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraphGroup" ADD CONSTRAINT "GraphGroup_graphId_fkey" FOREIGN KEY ("graphId") REFERENCES "Graph"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LtiClientRegistration" ADD CONSTRAINT "LtiClientRegistration_ltiPlatformId_fkey" FOREIGN KEY ("ltiPlatformId") REFERENCES "LtiPlatform"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

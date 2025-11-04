/*
  Warnings:

  - You are about to drop the column `createdAt` on the `Graph` table. All the data in the column will be lost.
  - You are about to drop the column `lastLinkId` on the `Graph` table. All the data in the column will be lost.
  - You are about to drop the column `lastNodeId` on the `Graph` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Graph` table. All the data in the column will be lost.
  - You are about to drop the column `version` on the `Graph` table. All the data in the column will be lost.
  - You are about to drop the `GraphGroup` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `GraphLink` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `GraphNode` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `GraphNodeInput` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `GraphNodeOutput` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `graph` to the `Graph` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "GraphGroup" DROP CONSTRAINT "GraphGroup_graphId_fkey";

-- DropForeignKey
ALTER TABLE "GraphLink" DROP CONSTRAINT "GraphLink_graphId_fkey";

-- DropForeignKey
ALTER TABLE "GraphLink" DROP CONSTRAINT "GraphLink_outputId_fkey";

-- DropForeignKey
ALTER TABLE "GraphNode" DROP CONSTRAINT "GraphNode_graphId_fkey";

-- DropForeignKey
ALTER TABLE "GraphNodeInput" DROP CONSTRAINT "GraphNodeInput_linkId_fkey";

-- DropForeignKey
ALTER TABLE "GraphNodeInput" DROP CONSTRAINT "GraphNodeInput_nodeId_graphId_fkey";

-- DropForeignKey
ALTER TABLE "GraphNodeOutput" DROP CONSTRAINT "GraphNodeOutput_nodeId_graphId_fkey";

-- AlterTable
ALTER TABLE "Graph" DROP COLUMN "createdAt",
DROP COLUMN "lastLinkId",
DROP COLUMN "lastNodeId",
DROP COLUMN "updatedAt",
DROP COLUMN "version",
ADD COLUMN     "graph" TEXT NOT NULL;

-- DropTable
DROP TABLE "GraphGroup";

-- DropTable
DROP TABLE "GraphLink";

-- DropTable
DROP TABLE "GraphNode";

-- DropTable
DROP TABLE "GraphNodeInput";

-- DropTable
DROP TABLE "GraphNodeOutput";

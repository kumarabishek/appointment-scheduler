-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "vapiCallId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "data" TEXT NOT NULL,
    "decision" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Call_requestId_key" ON "Call"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "Call_vapiCallId_key" ON "Call"("vapiCallId");

-- CreateIndex
CREATE INDEX "Call_updatedAt_idx" ON "Call"("updatedAt");

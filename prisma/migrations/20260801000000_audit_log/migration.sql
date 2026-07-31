-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT,
    "branchId" TEXT,
    "deviceId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_log_branchId_action_createdAt_idx" ON "audit_log"("branchId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "audit_log_objectType_objectId_idx" ON "audit_log"("objectType", "objectId");

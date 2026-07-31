-- Phase 3: Auth RBAC & Branch-Scoping
-- Hand-authored to avoid shadow-DB collision on _health_probe SERIAL (Prisma flakiness note in plan).

-- CreateEnum: Role
CREATE TYPE "Role" AS ENUM ('QUAN_TRI_HQ', 'CHU_CHUOI', 'KE_TOAN_CHUOI', 'QUAN_LY_CN', 'THU_NGAN', 'THU_KHO');

-- CreateEnum: BranchStatus
CREATE TYPE "BranchStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateTable: branch
CREATE TABLE "branch" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(5) NOT NULL,
    "name" TEXT NOT NULL,
    "status" "BranchStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: branch code unique
CREATE UNIQUE INDEX "branch_code_key" ON "branch"("code");

-- CreateTable: app_user
CREATE TABLE "app_user" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "chainWide" BOOLEAN NOT NULL DEFAULT false,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "approvalPinHash" TEXT,
    "cashierPinHash" TEXT,
    "pinFailedCount" INTEGER NOT NULL DEFAULT 0,
    "pinLockedUntil" TIMESTAMPTZ(3),
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: app_user username unique
CREATE UNIQUE INDEX "app_user_username_key" ON "app_user"("username");

-- CreateTable: user_branch
CREATE TABLE "user_branch" (
    "userId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,

    CONSTRAINT "user_branch_pkey" PRIMARY KEY ("userId", "branchId")
);

-- CreateTable: device
CREATE TABLE "device" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "label" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: device deviceId unique
CREATE UNIQUE INDEX "device_deviceId_key" ON "device"("deviceId");

-- AddForeignKey: user_branch.userId -> app_user.id
ALTER TABLE "user_branch" ADD CONSTRAINT "user_branch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: user_branch.branchId -> branch.id
ALTER TABLE "user_branch" ADD CONSTRAINT "user_branch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: device.branchId -> branch.id
ALTER TABLE "device" ADD CONSTRAINT "device_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

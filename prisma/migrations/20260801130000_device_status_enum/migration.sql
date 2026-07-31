-- M3: Device.status String → DeviceStatus enum (mirrors BranchStatus pattern).
-- Hand-authored to avoid shadow-DB collision (plan note).

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- AlterTable: change status column from TEXT to DeviceStatus enum with USING cast
ALTER TABLE "device"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "DeviceStatus" USING (
    CASE "status"
      WHEN 'active'    THEN 'ACTIVE'::"DeviceStatus"
      WHEN 'suspended' THEN 'SUSPENDED'::"DeviceStatus"
      ELSE 'ACTIVE'::"DeviceStatus"
    END
  ),
  ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::"DeviceStatus";

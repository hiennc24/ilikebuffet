-- Dynamic RBAC (RBAC-01): DB-backed roles + role→capability assignments.
-- The 6 built-in roles are seeded (isSystem=true) with their current capability
-- sets so behavior is preserved; app_user.role changes from the "Role" enum to text.

-- 1. Role + RoleCapability tables.
CREATE TABLE "role" (
  "id"          TEXT NOT NULL,
  "code"        TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "isSystem"    BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "role_code_key" ON "role"("code");

CREATE TABLE "role_capability" (
  "roleId"     TEXT NOT NULL,
  "capability" TEXT NOT NULL,
  CONSTRAINT "role_capability_pkey" PRIMARY KEY ("roleId", "capability")
);
CREATE INDEX "role_capability_capability_idx" ON "role_capability"("capability");
ALTER TABLE "role_capability"
  ADD CONSTRAINT "role_capability_roleId_fkey" FOREIGN KEY ("roleId")
  REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Seed the 6 built-in roles (id = code for simplicity). isSystem=true.
INSERT INTO "role" ("id", "code", "name", "isSystem") VALUES
  ('QUAN_TRI_HQ',   'QUAN_TRI_HQ',   'Quản trị HQ',   true),
  ('CHU_CHUOI',     'CHU_CHUOI',     'Chủ chuỗi',     true),
  ('KE_TOAN_CHUOI', 'KE_TOAN_CHUOI', 'Kế toán chuỗi', true),
  ('QUAN_LY_CN',    'QUAN_LY_CN',    'Quản lý CN',    true),
  ('THU_NGAN',      'THU_NGAN',      'Thu ngân',      true),
  ('THU_KHO',       'THU_KHO',       'Thủ kho',       true);

-- 3. Seed capabilities, matching the code matrix (ROLE_CAPABILITIES) at this point.
INSERT INTO "role_capability" ("roleId", "capability") VALUES
  ('QUAN_TRI_HQ','chain:config:read'), ('QUAN_TRI_HQ','chain:config:write'),
  ('QUAN_TRI_HQ','chain:user:manage'), ('QUAN_TRI_HQ','chain:dashboard:read'),
  ('QUAN_TRI_HQ','branch:dashboard:read'), ('QUAN_TRI_HQ','cash:read'),
  ('QUAN_TRI_HQ','cash:create-voucher'), ('QUAN_TRI_HQ','inventory:read'),
  ('QUAN_TRI_HQ','purchase-order:create'), ('QUAN_TRI_HQ','purchase-order:approve'),

  ('CHU_CHUOI','chain:config:read'), ('CHU_CHUOI','chain:dashboard:read'),
  ('CHU_CHUOI','branch:dashboard:read'), ('CHU_CHUOI','cash:read'),
  ('CHU_CHUOI','cash:create-voucher'), ('CHU_CHUOI','inventory:read'),
  ('CHU_CHUOI','purchase-order:create'), ('CHU_CHUOI','purchase-order:approve'),

  ('KE_TOAN_CHUOI','chain:dashboard:read'), ('KE_TOAN_CHUOI','branch:dashboard:read'),
  ('KE_TOAN_CHUOI','cash:reconcile'), ('KE_TOAN_CHUOI','cash:close-book'),
  ('KE_TOAN_CHUOI','cash:read'), ('KE_TOAN_CHUOI','cash:create-voucher'),
  ('KE_TOAN_CHUOI','inventory:read'),

  ('QUAN_LY_CN','branch:dashboard:read'), ('QUAN_LY_CN','shift:assist'),
  ('QUAN_LY_CN','discount:approve'), ('QUAN_LY_CN','bill:cancel'),
  ('QUAN_LY_CN','cash:read'), ('QUAN_LY_CN','cash:create-voucher'),
  ('QUAN_LY_CN','purchase-order:create'), ('QUAN_LY_CN','purchase-order:approve'),

  ('THU_NGAN','shift:open-close'), ('THU_NGAN','cash:create-voucher'),

  ('THU_KHO','inventory:manage'), ('THU_KHO','inventory:read'),
  ('THU_KHO','purchase-order:create');

-- 4. app_user.role: enum "Role" → text (values preserved), then drop the enum type.
ALTER TABLE "app_user" ALTER COLUMN "role" TYPE TEXT USING "role"::text;
DROP TYPE "Role";

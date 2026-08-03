-- Dynamic RBAC (R2): add new capabilities and reconcile existing role grants
-- to match the updated ROLE_CAPABILITIES matrix in permissions.ts.
-- All inserts use ON CONFLICT DO NOTHING (idempotent re-runs).

-- ── New capabilities ──────────────────────────────────────────────────────────

-- report:view  (QUAN_TRI_HQ, CHU_CHUOI, KE_TOAN_CHUOI, QUAN_LY_CN)
INSERT INTO "role_capability" ("roleId","capability") VALUES
  ('QUAN_TRI_HQ',   'report:view'),
  ('CHU_CHUOI',     'report:view'),
  ('KE_TOAN_CHUOI', 'report:view'),
  ('QUAN_LY_CN',    'report:view')
ON CONFLICT DO NOTHING;

-- report:chain-view  (QUAN_TRI_HQ, CHU_CHUOI, KE_TOAN_CHUOI)
INSERT INTO "role_capability" ("roleId","capability") VALUES
  ('QUAN_TRI_HQ',   'report:chain-view'),
  ('CHU_CHUOI',     'report:chain-view'),
  ('KE_TOAN_CHUOI', 'report:chain-view')
ON CONFLICT DO NOTHING;

-- audit:view  (QUAN_TRI_HQ, QUAN_LY_CN)
INSERT INTO "role_capability" ("roleId","capability") VALUES
  ('QUAN_TRI_HQ', 'audit:view'),
  ('QUAN_LY_CN',  'audit:view')
ON CONFLICT DO NOTHING;

-- device:manage  (QUAN_TRI_HQ, QUAN_LY_CN)
INSERT INTO "role_capability" ("roleId","capability") VALUES
  ('QUAN_TRI_HQ', 'device:manage'),
  ('QUAN_LY_CN',  'device:manage')
ON CONFLICT DO NOTHING;

-- bank:reconcile  (QUAN_TRI_HQ, CHU_CHUOI, KE_TOAN_CHUOI)
INSERT INTO "role_capability" ("roleId","capability") VALUES
  ('QUAN_TRI_HQ',   'bank:reconcile'),
  ('CHU_CHUOI',     'bank:reconcile'),
  ('KE_TOAN_CHUOI', 'bank:reconcile')
ON CONFLICT DO NOTHING;

-- bill:manage  (QUAN_TRI_HQ, CHU_CHUOI, QUAN_LY_CN)
INSERT INTO "role_capability" ("roleId","capability") VALUES
  ('QUAN_TRI_HQ', 'bill:manage'),
  ('CHU_CHUOI',   'bill:manage'),
  ('QUAN_LY_CN',  'bill:manage')
ON CONFLICT DO NOTHING;

-- inventory:transfer  (QUAN_TRI_HQ, CHU_CHUOI, QUAN_LY_CN)
INSERT INTO "role_capability" ("roleId","capability") VALUES
  ('QUAN_TRI_HQ', 'inventory:transfer'),
  ('CHU_CHUOI',   'inventory:transfer'),
  ('QUAN_LY_CN',  'inventory:transfer')
ON CONFLICT DO NOTHING;

-- recipe:manage-chain  (QUAN_TRI_HQ, CHU_CHUOI)
INSERT INTO "role_capability" ("roleId","capability") VALUES
  ('QUAN_TRI_HQ', 'recipe:manage-chain'),
  ('CHU_CHUOI',   'recipe:manage-chain')
ON CONFLICT DO NOTHING;

-- recipe:manage-branch  (QUAN_TRI_HQ, CHU_CHUOI, QUAN_LY_CN)
INSERT INTO "role_capability" ("roleId","capability") VALUES
  ('QUAN_TRI_HQ', 'recipe:manage-branch'),
  ('CHU_CHUOI',   'recipe:manage-branch'),
  ('QUAN_LY_CN',  'recipe:manage-branch')
ON CONFLICT DO NOTHING;

-- ── Reconciled capabilities (existing rows were missing roles) ────────────────

-- chain:user:manage: add QUAN_LY_CN  (was HQ only)
INSERT INTO "role_capability" ("roleId","capability") VALUES
  ('QUAN_LY_CN', 'chain:user:manage')
ON CONFLICT DO NOTHING;

-- inventory:manage: add QUAN_TRI_HQ, CHU_CHUOI, QUAN_LY_CN  (was THU_KHO only)
INSERT INTO "role_capability" ("roleId","capability") VALUES
  ('QUAN_TRI_HQ', 'inventory:manage'),
  ('CHU_CHUOI',   'inventory:manage'),
  ('QUAN_LY_CN',  'inventory:manage')
ON CONFLICT DO NOTHING;

-- inventory:read: add QUAN_LY_CN  (was HQ, CHU_CHUOI, KE_TOAN_CHUOI, THU_KHO)
INSERT INTO "role_capability" ("roleId","capability") VALUES
  ('QUAN_LY_CN', 'inventory:read')
ON CONFLICT DO NOTHING;

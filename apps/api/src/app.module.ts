/**
 * Root application module.
 *
 * Global guards registered as APP_GUARD (Red Team H2 — fail-closed):
 *   1. JwtAuthGuard  — validates JWT + per-request token-version check (M4/V2).
 *   2. BranchScopeGuard — enforces branch membership; cross-branch → 403 + audit.
 *
 * Both guards apply to every route by default. Opt-out:
 *   @Public()   — skip auth entirely (login, health).
 *   @Unscoped() — auth required, branch scope skipped (HQ chain-wide config).
 */
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./health/health.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { RbacModule } from "./platform/rbac/rbac.module";
import { DeviceModule } from "./platform/devices/device.module";
import { BranchModule } from "./platform/branches/branch.module";
import { MasterDataModule } from "./platform/master-data/master-data.module";
import { ExcelImportModule } from "./platform/import/excel-import.module";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { BranchScopeGuard } from "./platform/rbac/branch-scope.guard";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    AuditModule,
    AuthModule,
    RbacModule,
    DeviceModule,
    BranchModule,
    MasterDataModule,
    ExcelImportModule,
  ],
  providers: [
    // Order matters: auth runs first, then scope check.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: BranchScopeGuard },
  ],
})
export class AppModule {}

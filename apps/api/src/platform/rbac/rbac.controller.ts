/**
 * RbacController — read-only view of the role→capability matrix for the admin
 * "Vai trò & phân quyền" screen. The matrix is defined in code (permissions.ts);
 * this endpoint just exposes it so admins can see what each role can do. There is
 * deliberately no write route — capabilities are a code-level config, not data.
 */
import { Controller, ForbiddenException, Get, Request } from "@nestjs/common";
import { Role, ROLE_LABELS } from "./role.enum";
import { ROLE_CAPABILITIES, type Capability } from "./permissions";
import type { ScopedRequest } from "./branch-scope.guard";

/** Who may view the matrix — the user-management roles (aligns with /settings/users). */
const RBAC_VIEW_ROLES = new Set<Role>([Role.QUAN_TRI_HQ, Role.QUAN_LY_CN]);

@Controller("rbac")
export class RbacController {
  @Get("capabilities")
  capabilities(@Request() req: ScopedRequest) {
    if (!RBAC_VIEW_ROLES.has(req.user.role as Role)) {
      throw new ForbiddenException("Không có quyền xem phân quyền");
    }

    const roles = Object.values(Role);
    const capabilities = [...new Set(roles.flatMap((r) => [...ROLE_CAPABILITIES[r]]))].sort() as Capability[];
    const matrix = Object.fromEntries(roles.map((r) => [r, [...ROLE_CAPABILITIES[r]]])) as Record<Role, Capability[]>;

    return {
      roles: roles.map((value) => ({ value, label: ROLE_LABELS[value] })),
      capabilities,
      matrix,
    };
  }
}

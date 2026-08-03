/**
 * PermissionService — resolves a role's capabilities from the DB (role_capability),
 * with a short-lived in-memory cache so per-request `can()` checks stay cheap while
 * edits take effect ~immediately. Writes (RoleService) call invalidate() for instant
 * effect; the TTL is a backstop. Fail-closed: an unknown role resolves to no caps.
 */
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { Capability } from "./permissions";

const TTL_MS = 30_000;

@Injectable()
export class PermissionService {
  private readonly cache = new Map<string, { caps: Set<string>; at: number }>();

  constructor(private readonly prisma: PrismaService) {}

  /** Capabilities granted to a role code (cached). Empty set if the role is unknown. */
  async capsOf(roleCode: string): Promise<Set<string>> {
    const hit = this.cache.get(roleCode);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.caps;

    const rows = await this.prisma.roleCapability.findMany({
      where: { role: { code: roleCode } },
      select: { capability: true },
    });
    const caps = new Set(rows.map((r) => r.capability));
    this.cache.set(roleCode, { caps, at: Date.now() });
    return caps;
  }

  /** Whether the role holds the capability. */
  async can(roleCode: string, capability: Capability): Promise<boolean> {
    return (await this.capsOf(roleCode)).has(capability);
  }

  /** Drop cached capabilities so the next check re-reads the DB. Call after writes. */
  invalidate(roleCode?: string): void {
    if (roleCode) this.cache.delete(roleCode);
    else this.cache.clear();
  }
}

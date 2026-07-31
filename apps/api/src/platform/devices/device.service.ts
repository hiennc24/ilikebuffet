/**
 * DeviceService — server-side device registry (Red Team H4).
 *
 * deviceId is SERVER-ISSUED (randomUUID), not client-chosen. The per-device
 * secret is returned exactly once at registration and argon2-hashed at rest.
 * PIN quick-login requires a valid (deviceId + deviceSecret) pair — unknown
 * or unregistered devices are denied before the PIN is even checked.
 *
 * Device.status uses the DeviceStatus enum (M3) — no bare string comparisons.
 */
import { ForbiddenException, Injectable } from "@nestjs/common";
import { DeviceStatus } from "@prisma/client";
import * as argon2 from "argon2";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";

export interface RegisterDeviceDto {
  branchId: string;
  label?: string;
}

export interface RegisterDeviceResponse {
  /** Server-issued deviceId — use in subsequent pin-login calls. */
  deviceId: string;
  /** One-time secret — store securely; never shown again. */
  secret: string;
  branchId: string;
}

@Injectable()
export class DeviceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Register a new POS device for a branch.
   * Caller must be HQ or QUAN_LY_CN of the target branch (enforced in controller).
   * Returns the deviceId + one-time secret; secret is hashed at rest immediately.
   */
  async register(dto: RegisterDeviceDto): Promise<RegisterDeviceResponse> {
    // Verify branch exists.
    const branch = await this.prisma.branch.findUnique({ where: { id: dto.branchId } });
    if (!branch) throw new ForbiddenException("Branch not found");

    // Generate server-issued identifiers. randomUUID() is Node 22 built-in (CJS-safe).
    const deviceId = randomUUID(); // server-issued, non-guessable
    const secret = randomBytes(32).toString("hex"); // 64-char hex, returned once
    const secretHash = await argon2.hash(secret);

    await this.prisma.device.create({
      data: {
        deviceId,
        branchId: dto.branchId,
        secretHash,
        label: dto.label,
        status: DeviceStatus.ACTIVE,
      },
    });

    return { deviceId, secret, branchId: dto.branchId };
  }

  /** Suspend a device (e.g. lost/stolen). PIN-login will be denied. */
  async suspend(deviceId: string): Promise<void> {
    await this.prisma.device.update({
      where: { deviceId },
      data: { status: DeviceStatus.SUSPENDED },
    });
  }
}

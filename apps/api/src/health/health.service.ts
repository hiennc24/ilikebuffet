import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface HealthStatus {
  status: "ok";
  db: "up";
  timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness + real DB round-trip. Throws if the DB is unreachable. */
  async check(): Promise<HealthStatus> {
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: "ok",
      db: "up",
      timestamp: new Date().toISOString(),
    };
  }
}

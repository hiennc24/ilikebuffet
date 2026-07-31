import { Controller, Get } from "@nestjs/common";
import { HealthService, HealthStatus } from "./health.service";
import { Public } from "../platform/rbac/decorators";

@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Health check is public — no auth required. */
  @Public()
  @Get()
  check(): Promise<HealthStatus> {
    return this.health.check();
  }
}

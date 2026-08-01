import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "./audit.service";
import { AUDITED_KEY, AuditedMeta } from "./audited.decorator";

/**
 * Request context the auth layer attaches to `request`. All optional here
 * so audited reads work before auth lands; auth layer populates actor/branch/device.
 */
interface AuditableRequest {
  auditActorId?: string;
  auditActorRole?: string;
  auditBranchId?: string;
  auditDeviceId?: string;
  params?: Record<string, string>;
}

/**
 * Writes one audit row after a `@Audited` handler succeeds, OUTSIDE a
 * transaction. For reads/auth events only. A logging failure must never break
 * the request, but this path is for already-committed/side-effect-free actions,
 * so a lost read-audit row is tolerable (unlike in-tx sensitive audits).
 *
 * NOT globally registered yet — wired in once auth populates the context.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditedMeta | undefined>(
      AUDITED_KEY,
      context.getHandler(),
    );
    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest<AuditableRequest>();
    return next.handle().pipe(
      tap({
        next: () => {
          void this.audit
            .record(this.prisma, {
              actorId: req.auditActorId ?? null,
              actorRole: req.auditActorRole ?? null,
              action: meta.action,
              objectType: meta.objectType,
              objectId: req.params?.id ?? null,
              branchId: req.auditBranchId ?? null,
              deviceId: req.auditDeviceId ?? null,
            })
            .catch((err) =>
              this.logger.error(`Failed to write read-audit for ${meta.action}`, err),
            );
        },
      }),
    );
  }
}

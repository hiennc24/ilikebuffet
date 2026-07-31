import { SetMetadata } from "@nestjs/common";

export const AUDITED_KEY = "audit:meta";

export interface AuditedMeta {
  action: string;
  objectType: string;
}

/**
 * Mark a route handler as audited. The {@link AuditInterceptor} writes one
 * audit_log row after the handler succeeds, OUTSIDE any transaction — use this
 * for reads and auth events (login failures). Sensitive mutations should audit
 * IN their own transaction via `AuditService.record(tx, ...)` instead, so the
 * log and the change commit or roll back together.
 */
export const Audited = (meta: AuditedMeta) => SetMetadata(AUDITED_KEY, meta);

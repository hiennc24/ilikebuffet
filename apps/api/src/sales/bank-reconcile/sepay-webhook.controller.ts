/**
 * SepayWebhookController — public ingress for Sepay bank-transfer webhooks.
 *
 * @Public skips JWT + branch-scope guards (the bank has no user session), so the
 * route authenticates itself with a shared secret: `Authorization: Apikey <key>`
 * compared (timing-safe) against SEPAY_API_KEY. Fail-closed — a missing/unset key
 * rejects every call. Returns 200 { success } which Sepay treats as acknowledged.
 */
import { timingSafeEqual } from "node:crypto";
import { Body, Controller, Headers, HttpCode, Post, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Public } from "../../platform/rbac/decorators";
import { BankReconcileService } from "./bank-reconcile.service";
import { SepayWebhookDto } from "./sepay-webhook.dto";

/** Constant-time string compare that never short-circuits on length. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

@Public()
@Controller("webhooks/sepay")
export class SepayWebhookController {
  constructor(
    private readonly service: BankReconcileService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @HttpCode(200)
  handle(@Body() dto: SepayWebhookDto, @Headers("authorization") auth?: string) {
    this.assertApiKey(auth);
    return this.service.ingest(dto);
  }

  private assertApiKey(auth?: string): void {
    const key = this.config.get<string>("SEPAY_API_KEY");
    if (!key) throw new UnauthorizedException("Webhook chưa được cấu hình");
    if (!auth || !safeEqual(auth, `Apikey ${key}`)) {
      throw new UnauthorizedException("API key không hợp lệ");
    }
  }
}

/**
 * BankReconcileModule — VietQR auto-reconcile: Sepay webhook ingest + matching
 * (V1) + admin review (V2). ConfigModule is global (AppModule), so ConfigService
 * is injectable here for the webhook secret.
 */
import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuditModule } from "../../audit/audit.module";
import { BankReconcileService } from "./bank-reconcile.service";
import { SepayWebhookController } from "./sepay-webhook.controller";

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [SepayWebhookController],
  providers: [BankReconcileService],
  exports: [BankReconcileService],
})
export class BankReconcileModule {}

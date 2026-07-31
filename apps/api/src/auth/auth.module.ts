/**
 * AuthModule — wires JWT strategy, guards, service, and revocation.
 * Exported so other modules (DeviceModule, PlatformModule) can inject
 * JwtAuthGuard and RevocationService without re-declaring them.
 */
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PrismaModule } from "../prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./jwt.strategy";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { RevocationService } from "./revocation.service";

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
    // JwtModule is registered async so ConfigService is available for the secret.
    // expiresIn cast: @nestjs/jwt v11 uses ms StringValue; our config values are
    // valid ms strings ("15m", "7d") so the cast is safe.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: config.get<string>("JWT_ACCESS_TTL", "15m") as "15m",
        },
      }),
    }),
    PrismaModule,
    AuditModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, RevocationService],
  exports: [AuthService, JwtAuthGuard, RevocationService],
})
export class AuthModule {}

import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { DeviceService } from "./device.service";
import { DeviceController } from "./device.controller";

@Module({
  imports: [PrismaModule],
  controllers: [DeviceController],
  providers: [DeviceService],
  exports: [DeviceService],
})
export class DeviceModule {}

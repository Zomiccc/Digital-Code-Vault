import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { SchemaRepairService } from './schema-repair.service';

@Module({
  controllers: [HealthController],
  providers: [SchemaRepairService],
})
export class HealthModule {}

import { Module } from '@nestjs/common';
import { EmergencyService } from './emergency.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

/**
 * Its own module so both the admin controls and the merchant-facing status can
 * use it without AdminModule and MerchantsModule importing each other.
 */
@Module({
  imports: [PrismaModule, AuditModule],
  providers: [EmergencyService],
  exports: [EmergencyService],
})
export class EmergencyModule {}

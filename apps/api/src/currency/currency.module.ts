import { Module } from '@nestjs/common';
import { CurrencyService } from './currency.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [CurrencyService],
  exports: [CurrencyService],
})
export class CurrencyModule {}

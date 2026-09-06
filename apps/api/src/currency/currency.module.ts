import { Module } from '@nestjs/common';
import { CurrencyService } from './currency.service';
import { SellingPriceService } from './selling-price.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [CurrencyService, SellingPriceService],
  exports: [CurrencyService, SellingPriceService],
})
export class CurrencyModule {}

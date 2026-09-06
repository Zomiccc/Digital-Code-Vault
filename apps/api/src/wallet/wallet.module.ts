import { Module, Global } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { MerchantWalletService } from './merchant-wallet.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { CurrencyModule } from '../currency/currency.module';

@Global()
@Module({
  imports: [PrismaModule, AuditModule, CurrencyModule],
  providers: [WalletService, MerchantWalletService],
  exports: [WalletService, MerchantWalletService],
})
export class WalletModule {}

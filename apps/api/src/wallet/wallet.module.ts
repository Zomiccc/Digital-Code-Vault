import { Module, Global } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Global()
@Module({
  imports: [PrismaModule, AuditModule],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}

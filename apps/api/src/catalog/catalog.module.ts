import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';
import { AuthModule } from '../auth/auth.module';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [AuthModule, CurrencyModule],
  providers: [CatalogService],
  controllers: [CatalogController],
  exports: [CatalogService],
})
export class CatalogModule {}

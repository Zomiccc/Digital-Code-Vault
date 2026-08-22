import { Module } from '@nestjs/common';
import { EssentialsService } from './essentials.service';

@Module({
  providers: [EssentialsService],
  exports: [EssentialsService],
})
export class EssentialsModule {}

import { Module } from '@nestjs/common';
import { CodesService } from './codes.service';

@Module({
  providers: [CodesService],
  exports: [CodesService],
})
export class CodesModule {}

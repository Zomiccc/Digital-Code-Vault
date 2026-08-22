import { Module, Global } from '@nestjs/common';
import { EmailService } from './email.service';
import { OrderDigestService } from './order-digest.service';
import { PrismaModule } from '../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [EmailService, OrderDigestService],
  exports: [EmailService, OrderDigestService],
})
export class EmailModule {}

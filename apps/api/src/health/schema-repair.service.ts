import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { REQUIRED_SCHEMA, REPAIR_STATEMENTS } from './schema-repair';

@Injectable()
export class SchemaRepairService implements OnModuleInit {
  private readonly logger = new Logger(SchemaRepairService.name);
  private missing: string[] = [];
  private checked = false;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    // Startup must never be blocked by this: a database that cannot be reached
    // or inspected is reported, not fatal.
    try {
      this.missing = await this.detectMissing();
      this.checked = true;
      if (!this.missing.length) return;

      this.logger.warn(
        `Database is missing ${this.missing.length} expected column(s): ${this.missing.join(', ')}`,
      );
      if (this.configService.get<string>('SCHEMA_AUTO_REPAIR') === 'false') {
        this.logger.warn('SCHEMA_AUTO_REPAIR=false — leaving the schema as it is');
        return;
      }
      await this.repair();
      this.missing = await this.detectMissing();
      if (this.missing.length) {
        this.logger.error(`Schema still incomplete after repair: ${this.missing.join(', ')}`);
      } else {
        this.logger.log('Schema repaired; all expected columns are present');
      }
    } catch (err) {
      this.logger.error(`Schema check could not run: ${(err as Error).message}`);
    }
  }

  /** Columns the code needs that the database does not have. */
  private async detectMissing(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = current_schema()
    `;
    const present = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
    return REQUIRED_SCHEMA
      .filter((required) => !present.has(`${required.table}.${required.column}`))
      .map((required) => `${required.table}.${required.column}`);
  }

  /**
   * Apply each statement independently. One failing does not stop the rest, so a
   * single problematic statement cannot leave the remaining columns missing.
   */
  private async repair() {
    for (const statement of REPAIR_STATEMENTS) {
      try {
        await this.prisma.$executeRawUnsafe(statement);
      } catch (err) {
        this.logger.error(
          `Repair statement failed: ${statement.split('\n')[0].trim()} — ${(err as Error).message}`,
        );
      }
    }
  }

  /** For the health endpoint. */
  getStatus(): { state: 'ok' | 'drift' | 'unknown'; missing: string[] } {
    if (!this.checked) return { state: 'unknown', missing: [] };
    return { state: this.missing.length ? 'drift' : 'ok', missing: this.missing };
  }
}

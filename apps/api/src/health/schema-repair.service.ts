import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { REQUIRED_SCHEMA, REPAIR_STATEMENTS } from './schema-repair';

@Injectable()
export class SchemaRepairService implements OnModuleInit {
  private readonly logger = new Logger(SchemaRepairService.name);
  private missing: string[] = [];
  private checked = false;
  private drift: { tables: string[]; columns: string[] } = { tables: [], columns: [] };

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
      this.drift = await this.auditDatamodel();
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
      this.drift = await this.auditDatamodel();
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
   * Everything the Prisma client expects that the database does not have.
   *
   * REQUIRED_SCHEMA above is a hand-kept list, and the one time it mattered most
   * it was incomplete: a new table shipped without being added to it, every
   * request touching that table returned 500, and health cheerfully reported
   * "ok". This reads the generated datamodel instead, so a missing table or
   * column shows up whether or not anyone remembered to list it.
   *
   * It only reports. Inventing DDL for an arbitrary missing column is how you
   * turn a broken page into a broken database, so repair stays explicit.
   */
  private async auditDatamodel(): Promise<{ tables: string[]; columns: string[] }> {
    try {
      const rows = await this.prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = current_schema()
      `;
      const present = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
      const tablesPresent = new Set(rows.map((row) => row.table_name));

      const tables: string[] = [];
      const columns: string[] = [];

      for (const model of Prisma.dmmf.datamodel.models) {
        const table = model.dbName || model.name;
        if (!tablesPresent.has(table)) {
          tables.push(table);
          // Every column of a missing table is missing; naming the table is enough.
          continue;
        }
        for (const field of model.fields) {
          // Relation fields are not columns of their own; the foreign key that
          // backs them is a separate scalar field and is checked on its turn.
          if (field.kind === 'object') continue;
          const column = field.dbName || field.name;
          if (!present.has(`${table}.${column}`)) {
            columns.push(`${table}.${column}`);
          }
        }
      }

      if (tables.length || columns.length) {
        this.logger.error(
          `Schema drift against the generated client — missing tables: ` +
          `${tables.join(', ') || 'none'}; missing columns: ${columns.join(', ') || 'none'}`,
        );
      }
      return { tables, columns };
    } catch (err) {
      this.logger.error(`Datamodel audit could not run: ${(err as Error).message}`);
      return { tables: [], columns: [] };
    }
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
  getStatus(): {
    state: 'ok' | 'drift' | 'unknown';
    missing: string[];
    drift: { tables: string[]; columns: string[] };
  } {
    if (!this.checked) return { state: 'unknown', missing: [], drift: this.drift };
    const adrift = this.missing.length || this.drift.tables.length || this.drift.columns.length;
    return { state: adrift ? 'drift' : 'ok', missing: this.missing, drift: this.drift };
  }
}

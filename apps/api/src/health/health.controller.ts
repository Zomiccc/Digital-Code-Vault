import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import * as fs from 'fs';
import * as path from 'path';

function loadVersion(): { commit: string; builtAt: string } {
  try {
    const vPath = path.join(__dirname, 'version.json');
    if (fs.existsSync(vPath)) {
      return JSON.parse(fs.readFileSync(vPath, 'utf-8'));
    }
  } catch (e) { /* ignore */ }
  return { commit: 'unknown', builtAt: 'unknown' };
}

/**
 * Columns and tables the running code depends on. The platform has twice shipped
 * code against a database missing one of these — Prisma reported each only as a
 * P2022 at the moment a user hit the feature — so the schema is checked directly
 * rather than trusted from the migration history.
 */
const REQUIRED_SCHEMA: { table: string; column: string }[] = [
  { table: 'CodeBatch', column: 'batchName' },
  { table: 'CodeBatch', column: 'priority' },
  { table: 'FulfillmentRequest', column: 'discountAmount' },
  { table: 'FulfillmentRequest', column: 'chargedCurrency' },
  { table: 'FulfillmentRequest', column: 'chargedAmount' },
  { table: 'FulfillmentRequest', column: 'fxRate' },
  { table: 'WalletTransaction', column: 'currency' },
  { table: 'ExchangeRate', column: 'unitsPerUsd' },
];

@Controller('health')
export class HealthController {
  // The schema only changes across a deploy, and a deploy restarts the process,
  // so the result is computed once and reused rather than queried per request.
  private schemaDrift: string[] | null = null;

  private async findSchemaDrift(): Promise<string[]> {
    if (this.schemaDrift) return this.schemaDrift;
    const rows = await this.prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = current_schema()
    `;
    const present = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
    this.schemaDrift = REQUIRED_SCHEMA
      .filter((required) => !present.has(`${required.table}.${required.column}`))
      .map((required) => `${required.table}.${required.column}`);
    return this.schemaDrift;
  }
  constructor(
    private prisma: PrismaService,
    private redisService: RedisService,
  ) {}

  @Get()
  async check() {
    const checks: Record<string, string> = {};

    // Check database
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
    }

    // Report the real Redis state. This previously always said "ok", which hid a
    // Redis outage completely: the platform silently ran on the in-memory
    // fallback while health claimed everything was fine.
    const redis = this.redisService.getStatus();
    checks.redis = !redis.configured
      ? 'not_configured'
      : redis.available
        ? 'ok'
        : 'degraded_in_memory_fallback';

    // Surface schema drift here so a database missing a migration is visible
    // immediately, instead of only when someone tries to upload codes.
    let missing: string[] = [];
    try {
      missing = await this.findSchemaDrift();
      checks.schema = missing.length ? 'drift' : 'ok';
    } catch {
      checks.schema = 'unknown';
    }

    const version = loadVersion();
    const allOk = Object.values(checks).every((v) => v === 'ok');
    return {
      status: allOk ? 'healthy' : 'degraded',
      checks,
      ...(missing.length ? { missing_schema: missing } : {}),
      version: version.commit,
      builtAt: version.builtAt,
      timestamp: new Date().toISOString(),
    };
  }
}

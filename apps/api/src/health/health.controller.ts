import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SchemaRepairService } from './schema-repair.service';
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

@Controller('health')
export class HealthController {
  constructor(
    private prisma: PrismaService,
    private redisService: RedisService,
    private schemaRepair: SchemaRepairService,
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

    // Resolved at startup, after any repair ran, so this reflects the schema the
    // application is actually running against.
    const schema = this.schemaRepair.getStatus();
    checks.schema = schema.state;
    const missing = schema.missing;
    // Named separately from `missing_schema`, which lists only the columns the
    // repair knows how to add. These are everything the generated client
    // expects and the database does not have — the thing that turns an admin
    // page into a bare 500 with nothing to go on.
    const driftTables = schema.drift.tables;
    const driftColumns = schema.drift.columns;

    const version = loadVersion();
    const allOk = Object.values(checks).every((v) => v === 'ok');
    return {
      status: allOk ? 'healthy' : 'degraded',
      checks,
      ...(missing.length ? { missing_schema: missing } : {}),
      ...(driftTables.length ? { missing_tables: driftTables } : {}),
      ...(driftColumns.length ? { missing_columns: driftColumns } : {}),
      version: version.commit,
      builtAt: version.builtAt,
      timestamp: new Date().toISOString(),
    };
  }
}

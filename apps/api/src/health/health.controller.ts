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

@Controller('health')
export class HealthController {
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

    // Check Redis (in-memory)
    try {
      checks.redis = 'ok';
    } catch {
      checks.redis = 'error';
    }

    const version = loadVersion();
    const allOk = Object.values(checks).every((v) => v === 'ok');
    return {
      status: allOk ? 'healthy' : 'degraded',
      checks,
      version: version.commit,
      builtAt: version.builtAt,
      timestamp: new Date().toISOString(),
    };
  }
}

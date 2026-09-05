// Run: node -r ts-node/register/transpile-only --test src/redis/rate-limit.spec.ts
// A rate limiter whose own storage is broken must not lock everyone out.
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RedisService } from './redis.service';

/** A RedisService wired to a fake ioredis whose pipeline behaves as told. */
function service(exec: () => Promise<any>) {
  const redis: any = {
    on: () => {},
    connect: async () => {},
    pipeline: () => ({
      zremrangebyscore: () => {}, zadd: () => {}, zcount: () => {}, pexpire: () => {},
      exec,
    }),
  };
  const sut = new RedisService({ get: (_k: string, fallback?: any) => fallback } as any);
  // Stand in for a connected client without going near a real server.
  (sut as any).redis = redis;
  (sut as any).connected = true;
  return sut;
}

test('a healthy pipeline enforces the limit', async () => {
  const sut = service(async () => [[null, 0], [null, 1], [null, 3], [null, 1]]);
  const result = await sut.rateLimit('k', 5, 60);
  assert.equal(result.allowed, true);
  assert.equal(result.remaining, 2);
});

test('a count over the limit is refused', async () => {
  const sut = service(async () => [[null, 0], [null, 1], [null, 9], [null, 1]]);
  assert.equal((await sut.rateLimit('k', 5, 60)).allowed, false);
});

test('a pipeline whose command errored falls back instead of blocking', async () => {
  // This is the shape Upstash returns once the request quota is exhausted:
  // exec resolves, but each command carries an error and no result.
  const sut = service(async () => [
    [new Error('ERR max requests limit exceeded'), null],
    [new Error('ERR max requests limit exceeded'), null],
    [new Error('ERR max requests limit exceeded'), null],
    [new Error('ERR max requests limit exceeded'), null],
  ]);
  const result = await sut.rateLimit('login', 500, 60);
  assert.equal(result.allowed, true, 'a broken Redis must not lock out logins');
});

test('a missing or non-numeric count falls back instead of blocking', async () => {
  for (const exec of [
    async () => [[null, 0], [null, 1], [null, undefined], [null, 1]],
    async () => [[null, 0], [null, 1], [null, null], [null, 1]],
    async () => [[null, 0], [null, 1]],
    async () => null,
  ]) {
    const sut = service(exec as any);
    assert.equal((await sut.rateLimit('login', 500, 60)).allowed, true);
  }
});

test('a pipeline that throws falls back instead of blocking', async () => {
  const sut = service(async () => { throw new Error('connection reset'); });
  assert.equal((await sut.rateLimit('login', 500, 60)).allowed, true);
});

test('the in-memory fallback still enforces the limit it is given', async () => {
  const sut = service(async () => { throw new Error('down'); });
  for (let attempt = 1; attempt <= 3; attempt++) {
    assert.equal((await sut.rateLimit('tight', 3, 60)).allowed, true, `attempt ${attempt}`);
  }
  assert.equal((await sut.rateLimit('tight', 3, 60)).allowed, false, 'fourth exceeds a limit of 3');
});

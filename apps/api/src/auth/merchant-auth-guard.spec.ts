// Run: node -r ts-node/register/transpile-only --test src/auth/merchant-auth-guard.spec.ts
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MerchantAuthGuard } from './guards/merchant-auth.guard';

const context = (user: any): any => ({
  switchToHttp: () => ({ getRequest: () => ({ user }) }),
});

test('a merchant token is allowed through', () => {
  assert.equal(new MerchantAuthGuard().canActivate(context({ merchantId: 'm1' })), true);
});

test('a token without a merchant is rejected as unauthorized, not a 500', () => {
  // An admin or customer token passes JwtAuthGuard but carries no merchantId.
  // Every handler then queried `where: { id: undefined }`, which Prisma rejects.
  for (const user of [{ id: 'admin-1' }, { id: 'c1', merchantId: null }, {}, null, undefined]) {
    assert.throws(
      () => new MerchantAuthGuard().canActivate(context(user)),
      (error: any) => {
        assert.equal(error.status, 401, 'must be 401 so the client re-authenticates');
        assert.match(error.response.message, /merchant login/i);
        return true;
      },
    );
  }
});

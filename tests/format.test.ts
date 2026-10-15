import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shownAmount } from '../src/shared/stats';

test('伤害飘字显示成整数，不带浮点误差', () => {
  assert.equal(shownAmount(20.00000000001), '20');
  assert.equal(shownAmount(19.6), '20');
  assert.equal(shownAmount(0.2), '1');
  assert.equal(shownAmount(-3.2), '-3');
  assert.equal(shownAmount(Number.NaN), '0');
});

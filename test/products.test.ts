import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchProducts, matchSymptom, normalize, productIdForLineItem } from '../src/products.ts';

test('normalize strips apostrophes and punctuation', () => {
  assert.equal(normalize("It won't turn on!"), 'it wont turn on');
  assert.equal(normalize('Order #1001'), 'order #1001');
});

test('matchProducts finds a product from everyday words, not from unrelated ones', () => {
  assert.deepEqual(matchProducts('my blender stopped working'), ['problend900']);
  assert.deepEqual(matchProducts('the headphones'), ['quietwave-h2']);
  assert.deepEqual(matchProducts('kettle'), ['swiftboil-k1']);
  assert.deepEqual(matchProducts('toaster'), []);
});

test('matchSymptom maps spoken symptoms to keys and ignores unknown ones', () => {
  assert.equal(matchSymptom('problend900', "it won't turn on"), 'wont-turn-on');
  assert.equal(matchSymptom('problend900', 'it is leaking from the base'), 'leaking');
  assert.equal(matchSymptom('quietwave-h2', 'no sound on one side'), 'no-sound-one-side');
  assert.equal(matchSymptom('swiftboil-k1', "the lid won't close"), 'lid-wont-close');
  assert.equal(matchSymptom('swiftboil-k1', 'it makes a whistling noise'), undefined);
  assert.equal(matchSymptom('nope', 'anything'), undefined);
});

test('productIdForLineItem prefers the handle, falls back to the title', () => {
  assert.equal(productIdForLineItem({ productHandle: 'swiftboil-k1', title: 'x' }), 'swiftboil-k1');
  assert.equal(productIdForLineItem({ title: 'ProBlend 900 Blender' }), 'problend900');
  assert.equal(productIdForLineItem({ title: 'Mystery Gadget' }), undefined);
});

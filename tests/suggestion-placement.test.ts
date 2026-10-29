import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestionPlacement } from '../src/lib/suggestionPlacement.ts';

test('suggestions use a large list above a bottom-docked input', () => {
  const p = suggestionPlacement({ left: 160, width: 960, top: 620, bottom: 674 }, { left: 0, top: 0, width: 1280, height: 720, layoutHeight: 720 });
  assert.equal(p.bottom, 106);
  assert.equal(p.maxHeight, 480);
  assert.equal(p.width, 960);
  assert.equal('top' in p, false);
});

test('suggestions open below a high input and clamp to the viewport edges', () => {
  const p = suggestionPlacement({ left: -20, width: 440, top: 70, bottom: 120 }, { left: 0, top: 0, width: 390, height: 844, layoutHeight: 844 });
  assert.equal(p.top, 126);
  assert.equal(p.left, 8);
  assert.equal(p.width, 374);
  assert.ok(p.top! + p.maxHeight <= 836);
});

test('mobile keyboard and viewport offsets constrain the list to the visible area', () => {
  const viewport = { left: 12, top: 120, width: 360, height: 300, layoutHeight: 844 };
  const p = suggestionPlacement({ left: 350, width: 500, top: 350, bottom: 400 }, viewport);
  assert.ok(p.left >= viewport.left + 8);
  assert.ok(p.left + p.width <= viewport.left + viewport.width - 8);
  const bottom = viewport.layoutHeight - p.bottom!;
  assert.ok(bottom <= viewport.top + viewport.height - 8);
  assert.ok(bottom - p.maxHeight >= viewport.top + 8);
  assert.ok(p.maxHeight >= 200);
});

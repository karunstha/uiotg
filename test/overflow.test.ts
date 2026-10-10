import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { createRenderer } from '../src/index.ts';
import { minimalData, stressData } from '../src/stress.ts';

// No template may clip, truncate, overflow or overlap text: not with its
// example, not with the bare minimum, not with very long text and huge
// numbers, and not when narrow.
const renderer = createRenderer({ browser: { allowNetwork: false, concurrency: 6 } });
after(() => renderer.close());

describe('overflow', () => {
  for (const t of renderer.registry.list()) {
    test(t.id, async () => {
      const stressed = stressData(t, renderer.registry);
      const runs = await Promise.all([
        renderer.audit(t.id, t.example),
        renderer.audit(t.id, minimalData(t, renderer.registry)),
        renderer.audit(t.id, stressed),
        renderer.audit(t.id, stressed, { width: 480 }),
      ]);
      const issues = runs.flat().map((i) => `${i.problem} ${i.element}: ${i.text}`);
      assert.deepEqual(issues, []);
    });
  }
});

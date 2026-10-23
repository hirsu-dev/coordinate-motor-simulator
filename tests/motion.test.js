import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMotion,
  sampleMotion,
  intersectsBox,
  skyToHorizontal,
} from "../web/motion-plan.js";
const c = {
  azMin: -270,
  azMax: 270,
  altMin: 5,
  altMax: 85,
  azRate: 20,
  altRate: 15,
};
test("wrap choice uses continuous motor angles within cable bounds", () => {
  const m = buildMotion({ az: 0, alt: 25 }, { az: 350, alt: 45 }, c);
  assert.equal(m.selected.to.az, -10);
  assert.deepEqual(
    sampleMotion(m.selected, m.selected.duration),
    m.selected.to,
  );
});
test("an exclusion box forces a valid alternative rather than a collision", () => {
  const z = { azMin: 40, azMax: 70, altMin: 0, altMax: 35 },
    m = buildMotion({ az: 0, alt: 25 }, { az: 110, alt: 45 }, c, [z]);
  assert.ok(m.candidates.some((p) => p.blocked));
  assert.ok(m.selected);
  for (const s of m.selected.segments)
    assert.equal(intersectsBox(s.from, s.to, z), false);
});
test("inclusive zone edges and invalid start or unreachable target are handled", () => {
  assert.equal(
    intersectsBox(
      { az: 0, alt: 20 },
      { az: 50, alt: 20 },
      { azMin: 50, azMax: 60, altMin: 20, altMax: 30 },
    ),
    true,
  );
  assert.throws(() => buildMotion({ az: 400, alt: 20 }, { az: 1, alt: 20 }, c));
  assert.equal(
    buildMotion({ az: 0, alt: 25 }, { az: 10, alt: -5 }, c).selected,
    null,
  );
});
test("quintic duration respects configured peak rates", () => {
  const m = buildMotion({ az: 0, alt: 25 }, { az: 110, alt: 45 }, c).selected;
  let prev = sampleMotion(m, 0),
    maxAz = 0,
    maxAlt = 0;
  const dt = m.duration / 10000;
  for (let i = 1; i <= 10000; i++) {
    const p = sampleMotion(m, i * dt);
    maxAz = Math.max(maxAz, Math.abs(p.az - prev.az) / dt);
    maxAlt = Math.max(maxAlt, Math.abs(p.alt - prev.alt) / dt);
    prev = p;
  }
  assert.ok(maxAz <= c.azRate + 1e-5);
  assert.ok(maxAlt <= c.altRate + 1e-5);
});
test("sky conversion preserves the analytic north-pole altitude", () => {
  for (const lat of [-60, 0, 35, 89])
    assert.ok(
      Math.abs(
        skyToHorizontal(4, 90, lat, -105, "2026-10-23T00:00:00Z").alt - lat,
      ) < 1e-6,
    );
});

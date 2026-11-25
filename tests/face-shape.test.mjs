import test from "node:test";
import assert from "node:assert/strict";
import * as FS from "../js/face-shape.js";

const shapeOf = (m) => FS.classify(m, { quality: 1, stability: 1 });

test("every prototype classifies as itself with high confidence", () => {
  for (const key of FS.SHAPE_KEYS) {
    const result = shapeOf({ ...FS.PROTOTYPES[key] });
    assert.equal(result.shape, key, `prototype ${key} should map to ${key}`);
    assert.equal(result.confidence, "high", `${key} should be high confidence`);
    assert.ok(result.fit > 0.9, `${key} fit ${result.fit}`);
  }
});

test("classification is stable with realistic measurement noise", () => {
  let checked = 0;
  for (const key of FS.SHAPE_KEYS) {
    const proto = FS.PROTOTYPES[key];
    for (const jitter of [-0.04, 0.04]) {
      const noisy = {
        ...proto,
        length: proto.length + jitter,
        forehead: proto.forehead + jitter,
        jaw: proto.jaw - jitter,
        jawAngle: proto.jawAngle + jitter * 60
      };
      assert.equal(shapeOf(noisy).shape, key, `${key} survives ${jitter} noise`);
      checked += 1;
    }
  }
  assert.equal(checked, 14);
});

test("confidence degrades honestly instead of inventing precision", () => {
  const proto = FS.PROTOTYPES.oval;
  const good = shapeOf(proto);
  const blurry = FS.classify(proto, { quality: 0.2, stability: 0.2 });
  const ambiguous = shapeOf({
    length: (FS.PROTOTYPES.oval.length + FS.PROTOTYPES.rect.length) / 2,
    forehead: 0.9,
    jaw: 0.8,
    jawAngle: 122,
    chin: 0.3
  });

  assert.equal(good.confidence, "high");
  assert.notEqual(blurry.confidence, "high");
  assert.notEqual(ambiguous.confidence, "high", "a face between two prototypes must not be high confidence");
  assert.ok(ambiguous.margin < good.margin, "ambiguous measurements leave a smaller margin");
  for (const r of [good, blurry, ambiguous]) {
    assert.ok(["high", "medium", "low"].includes(r.confidence));
  }
});

test("no measurements returns a low-confidence no-op", () => {
  const r = FS.classify(null);
  assert.equal(r.shape, null);
  assert.equal(r.confidence, "low");
  assert.equal(r.reason, "no-measurements");
});

test("measurements use the jaw angle and chin width they claim to", () => {
  const lm = FS.syntheticLandmarks({ length: 1.42, forehead: 0.88, jaw: 0.76, jawAngle: 128, chin: 0.3 });
  const m = FS.measureLandmarks(lm, { aspect: 1 });
  assert.ok(m, "measurement produced");
  assert.ok(m.length > 1.0 && m.length < 1.9, `face length ratio ${m.length}`);
  assert.ok(Math.abs(m.jaw - 0.76) < 0.02, `jaw ratio ${m.jaw}`);
  assert.ok(m.jawAngle > 60 && m.jawAngle < 180, `jaw angle ${m.jawAngle}`);
  assert.ok(m.chin > 0.2 && m.chin < 0.4, `chin ratio ${m.chin}`);
});

test("a wider jaw lowers the jaw angle (sharper corners)", () => {
  const narrow = FS.measureLandmarks(FS.syntheticLandmarks({ jaw: 0.6 }), { aspect: 1 });
  const wide = FS.measureLandmarks(FS.syntheticLandmarks({ jaw: 0.98 }), { aspect: 1 });
  assert.ok(wide.jawAngle < narrow.jawAngle, `${wide.jawAngle} < ${narrow.jawAngle}`);
});

test("aspect correction keeps ratios consistent for portrait photos", () => {
  const lm = FS.syntheticLandmarks({ aspect: 0.75 });
  const m = FS.measureLandmarks(lm, { aspect: 0.75 });
  assert.ok(m);
  assert.ok(Math.abs(m.jaw - 0.76) < 0.03, `jaw ratio ${m.jaw}`);
});

test("hairline from a hair mask replaces landmark 10", () => {
  const width = 100;
  const height = 100;
  const data = new Uint8Array(width * height);
  for (let y = 0; y < 30; y += 1) for (let x = 0; x < width; x += 1) data[y * width + x] = 1;
  const y = FS.hairlineFromMask({ data, width, height }, { left: 0.3, right: 0.7, top: 0.3, bottom: 0.8 });
  assert.ok(Math.abs(y - 0.3) < 0.02, `hairline ${y}`);

  const noHair = FS.hairlineFromMask({ data: new Uint8Array(width * height), width, height }, { left: 0.3, right: 0.7, top: 0.3, bottom: 0.8 });
  assert.equal(noHair, null);
});

test("averaging frames ignores a single bad frame", () => {
  const base = { length: 1.4, forehead: 0.9, cheek: 1, jaw: 0.78, jawAngle: 127, chin: 0.3 };
  const frames = [base, { ...base }, { ...base, length: 9.9, jaw: 0.1 }, { ...base }, { ...base }];
  const avg = FS.averageMeasurements(frames);
  assert.ok(avg);
  assert.ok(Math.abs(avg.length - 1.4) < 0.01, `median length ${avg.length}`);
  assert.equal(avg.frames, 5);
  assert.ok(avg.stability > 0.5);
});

test("stability drops when frames disagree", () => {
  const a = { length: 1.2, forehead: 0.8, cheek: 1, jaw: 0.7, jawAngle: 120, chin: 0.25 };
  const b = { length: 1.8, forehead: 1.0, cheek: 1, jaw: 0.95, jawAngle: 150, chin: 0.42 };
  const avg = FS.averageMeasurements([a, b]);
  assert.ok(avg.stability < 0.5, `stability ${avg.stability}`);
});

test("chin shape labels are limited to the documented set", () => {
  const allowed = new Set(["square", "pointed", "broad", "soft", "rounded", "unknown"]);
  for (const key of FS.SHAPE_KEYS) {
    assert.ok(allowed.has(FS.chinShape(FS.PROTOTYPES[key])));
  }
  assert.equal(FS.chinShape(null), "unknown");
});

test("landmark helpers reject incomplete meshes", () => {
  assert.equal(FS.landmarksToAnchors(null), null);
  assert.equal(FS.landmarksToAnchors(new Array(100).fill({ x: 0.5, y: 0.5 })), null);
  assert.equal(FS.measureLandmarks(new Array(100).fill({ x: 0.5, y: 0.5 })), null);
});

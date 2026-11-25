import test from "node:test";
import assert from "node:assert/strict";
import { CUTS, barberSpecs, fig, matchesAudience, styleScore } from "../js/catalog.js";

test("every catalog entry is complete and uniquely named", () => {
  assert.ok(CUTS.length >= 91, `expected the expanded library, got ${CUTS.length}`);
  const names = new Set();
  for (const cut of CUTS) {
    assert.equal(typeof cut[0], "string");
    assert.ok(cut[0].length > 2, `short name: ${cut[0]}`);
    assert.ok(!names.has(cut[0]), `duplicate style: ${cut[0]}`);
    names.add(cut[0]);
    assert.ok(["m", "f", "u"].includes(cut[1]), `audience: ${cut[0]}`);
    assert.ok(["s", "m", "l"].includes(cut[2]), `length: ${cut[0]}`);
    assert.ok(["c", "m"].includes(cut[3]), `era: ${cut[0]}`);
    assert.equal(cut[4].length, 8, `figure params: ${cut[0]}`);
    for (let i = 0; i < 7; i += 1) assert.ok(Number.isFinite(cut[4][i]), `figure param ${i}: ${cut[0]}`);
    assert.equal(typeof cut[4][7], "string");
    assert.ok(cut[5].length > 8, `description: ${cut[0]}`);
  }
});

test("every style renders an SVG preview", () => {
  for (const cut of CUTS) {
    const svg = fig(cut[4]);
    assert.match(svg, /^<svg class="fg"/, `figure: ${cut[0]}`);
    assert.ok(!svg.includes("NaN"), `NaN in figure: ${cut[0]}`);
    assert.ok(!svg.includes("undefined"), `undefined in figure: ${cut[0]}`);
  }
});

test("women's and men's styles are both well represented", () => {
  const women = CUTS.filter((c) => c[1] === "f");
  const men = CUTS.filter((c) => c[1] === "m");
  assert.ok(women.length >= 25, `women's styles: ${women.length}`);
  assert.ok(men.length >= 30, `men's styles: ${men.length}`);
  assert.ok(CUTS.some((c) => c[1] === "u"));
  assert.ok(matchesAudience(["X", "f"], "f"));
  assert.ok(matchesAudience(["X", "u"], "neutral"));
  assert.ok(!matchesAudience(["X", "m"], "f"));
});

test("barber specs and scores stay inside their ranges", () => {
  for (const cut of CUTS) {
    const specs = barberSpecs(cut, { texture: "curly", maintenance: "low" });
    assert.ok(specs.sides && specs.top && specs.fade && specs.finish && specs.upkeep);
    const score = styleScore(cut, { length: "short", maintenance: "low", vibe: "trendy" });
    assert.ok(score >= 61 && score <= 98, `score for ${cut[0]}: ${score}`);
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOverpassQuery,
  classifySalon,
  distanceKm,
  mapsSearchUrl,
  normaliseElement,
  sortByDistance
} from "../js/salons.js";

test("overpass query targets hair shops around the point", () => {
  const q = buildOverpassQuery(14.676, 121.0437, 3000);
  assert.match(q, /around:3000,14\.67600,121\.04370/);
  assert.match(q, /\["shop"="hairdresser"\]/);
  assert.match(q, /out center 60;/);
  assert.equal(buildOverpassQuery(1, 2).match(/hairdresser/g).length, 2);
});

test("distance is plausible and symmetric", () => {
  const d = distanceKm(14.676, 121.0437, 14.5995, 120.9842);
  assert.ok(d > 9 && d < 12, `expected about 10 km, got ${d}`);
  assert.ok(Math.abs(d - distanceKm(14.5995, 120.9842, 14.676, 121.0437)) < 1e-9);
});

test("classification prefers explicit tags over names", () => {
  assert.equal(classifySalon({ female: "yes" }, "Gents Barbers"), "women");
  assert.equal(classifySalon({ unisex: "no" }, "Bella Salon"), "barber");
  assert.equal(classifySalon({}, "District Barbers"), "barber");
  assert.equal(classifySalon({ shop: "beauty" }, "Glam Room"), "women");
  assert.equal(classifySalon({ shop: "hairdresser" }, "Hair 101"), "hair");
});

test("normaliseElement keeps usable fields and drops broken geometry", () => {
  const node = normaliseElement({
    type: "node",
    id: 42,
    lat: 14.7,
    lon: 121.0,
    tags: {
      name: "Sample Salon",
      "addr:housenumber": "12",
      "addr:street": "Rizal St",
      phone: "+639171234567",
      opening_hours: "9AM-8PM"
    }
  });
  assert.equal(node.name, "Sample Salon");
  assert.equal(node.address, "12 Rizal St");
  assert.equal(node.kind, "women");
  assert.equal(node.id, "node/42");
  assert.equal(normaliseElement({ tags: { name: "No geometry" } }), null);

  const way = normaliseElement({ type: "way", id: 7, center: { lat: 1, lon: 2 }, tags: {} });
  assert.equal(way.name, "Hair shop");
  assert.equal(way.kind, "hair");
});

test("sortByDistance dedupes and orders nearest first", () => {
  const from = { lat: 14.676, lon: 121.0437 };
  const items = [
    { id: "a", name: "Far", lat: 14.75, lon: 121.1, kind: "women" },
    { id: "b", name: "Near", lat: 14.677, lon: 121.044, kind: "barber" },
    { id: "c", name: "Near", lat: 14.677, lon: 121.044, kind: "barber" }
  ];
  const sorted = sortByDistance(items, from);
  assert.equal(sorted.length, 2);
  assert.equal(sorted[0].name, "Near");
  assert.ok(sorted[0].distance < sorted[1].distance);
});

test("maps fallback stays an encoded https link", () => {
  const url = mapsSearchUrl();
  assert.match(url, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
  assert.ok(!url.includes(" "));
});

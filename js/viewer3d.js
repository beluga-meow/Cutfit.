// Cutfit 3D head simulator.
// Three.js is imported only when the 3D tab is opened (that is the whole point
// of the lazy split). The head is built from the user's MediaPipe face mesh and
// their photo; the back of the skull is a fitted base mesh filled with a skin
// colour sampled from the photo, so it is not a cartoon mannequin.
//
// Hair comes from /assets/hair/manifest.json. If no licensed GLB is installed
// we say so in the UI instead of pretending a flat shape is hair.

import { meshConnections } from "./scan.js";
import { t } from "./i18n.js";

const THREE_VERSION = "0.187.0";
const MANIFEST_URL = new URL("../assets/hair/manifest.json", import.meta.url).href;

export function viewerSupported() {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    if (!gl) return { ok: false, reason: "webgl" };
    const weak =
      (navigator.deviceMemory && navigator.deviceMemory < 2) ||
      (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
    return { ok: !weak, reason: weak ? "weak" : null };
  } catch {
    return { ok: false, reason: "webgl" };
  }
}

/**
 * Alpha mask for the face patch, drawn from the MediaPipe face-oval edges.
 * It is mapped in photo UV space so the patch has an organic edge instead of a
 * visible rectangle.
 */
function ovalAlphaTexture(landmarks, oval, box, T) {
  const S = 512;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  const pts = (oval || []).map((cn) => landmarks[cn.start]).filter(Boolean);
  if (pts.length > 8) {
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x * S, p.y * S) : ctx.moveTo(p.x * S, p.y * S)));
    ctx.closePath();
  } else {
    ctx.ellipse(
      ((box.left + box.right) / 2) * S,
      ((box.top + box.bottom) / 2) * S,
      ((box.right - box.left) / 2) * S * 1.15,
      ((box.bottom - box.top) / 2) * S * 1.12,
      0, 0, Math.PI * 2
    );
  }
  ctx.fill();
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.NoColorSpace;
  return tex;
}

let THREE = null;
let GLTFLoader = null;
let OrbitControls = null;

// Pinned ES-module builds. jsDelivr's +esm output rewrites the addons' own
// `three` import to the same URL, so there is exactly one three.js instance.
const THREE_URL = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/+esm`;
const ADDONS = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm`;

async function loadThree() {
  if (THREE) return THREE;
  try {
    THREE = await import(/* @vite-ignore */ THREE_URL);
    const [gltf, orbit] = await Promise.all([
      import(/* @vite-ignore */ `${ADDONS}/loaders/GLTFLoader.js/+esm`),
      import(/* @vite-ignore */ `${ADDONS}/controls/OrbitControls.js/+esm`)
    ]);
    GLTFLoader = gltf.GLTFLoader;
    OrbitControls = orbit.OrbitControls;
    return THREE;
  } catch (err) {
    THREE = null;
    throw new Error("The 3D library could not be downloaded. Check your connection and try again.");
  }
}

// ------------------------------------------------------------------ helpers

function averageSkin(canvas, landmarks) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const points = [234, 454, 50, 280, 120, 350];
  let r = 0, g = 0, b = 0, n = 0;
  for (const id of points) {
    const p = landmarks[id];
    if (!p) continue;
    const d = ctx.getImageData(
      Math.max(0, Math.min(canvas.width - 4, Math.round(p.x * canvas.width) - 3)),
      Math.max(0, Math.min(canvas.height - 4, Math.round(p.y * canvas.height) - 3)),
      6, 6
    ).data;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n += 1; }
  }
  if (!n) return 0xd9b49a;
  return (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n);
}

function hairCardTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  // Many thin strands with soft alpha — a card, not a blob.
  for (let i = 0; i < 90; i += 1) {
    const x = Math.random() * c.width;
    const w = 0.5 + Math.random() * 1.6;
    const bend = (Math.random() - 0.5) * 12;
    const grad = ctx.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, "rgba(255,255,255,0.0)");
    grad.addColorStop(0.12, `rgba(255,255,255,${0.55 + Math.random() * 0.4})`);
    grad.addColorStop(0.85, `rgba(255,255,255,${0.5 + Math.random() * 0.4})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.strokeStyle = grad;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.quadraticCurveTo(x + bend, c.height * 0.5, x + bend * 1.6, c.height);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Alpha hair cards distributed over a scalp cap. */
function buildCards({ color, length = 0.5, fade = 0.5 }) {
  const group = new THREE.Group();
  const map = hairCardTexture();
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    map,
    alphaMap: map,
    transparent: true,
    alphaTest: 0.18,
    depthWrite: false,
    side: THREE.DoubleSide,
    roughness: 0.55,
    metalness: 0,
    anisotropy: 0.85,
    anisotropyRotation: Math.PI / 2,
    sheen: 0.4,
    sheenColor: new THREE.Color(color).offsetHSL(0, 0, 0.25)
  });

  const rings = 7;
  const perRing = 16;
  const lengthScale = 0.25 + length * 0.75;
  const sideTrim = 0.55 + (1 - fade) * 0.45;

  for (let ring = 0; ring < rings; ring += 1) {
    const phi = (ring / (rings - 1)) * 1.15; // from crown outward
    for (let i = 0; i < perRing; i += 1) {
      const theta = (i / perRing) * Math.PI * 2;
      // Skip the face opening: front-lower area below the hairline.
      const front = Math.cos(theta);
      const height = 1.0 - phi / 2.2;
      if (front > 0.35 && phi > 0.75) continue;

      const r = 1.0 + 0.03 * Math.sin(ring);
      const x = Math.sin(phi) * Math.cos(theta) * r;
      const y = Math.cos(phi) * r * 1.05;
      const z = -Math.sin(phi) * Math.sin(theta) * r;

      const isSide = Math.abs(x) > 0.55;
      const strand = 0.34 * lengthScale * (isSide ? sideTrim : 1) * (0.8 + (ring / rings) * 0.5);
      const geo = new THREE.PlaneGeometry(0.13, strand, 1, 4);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y - strand * 0.35, z);
      mesh.lookAt(0, y - strand * 0.2, 0);
      mesh.rotateX(Math.PI / 2);
      mesh.rotation.z = (Math.random() - 0.5) * 0.25;
      mesh.castShadow = false;
      group.add(mesh);
    }
  }
  group.userData.builtin = true;
  return group;
}

// --------------------------------------------------------------- main viewer

/**
 * Create the viewer inside `canvas`.
 * @returns {Promise<{ok:boolean, reason?:string, api?:object}>}
 */
export async function createViewer({ canvas, scan, hairStyle = null, onStatus = () => {} }) {
  const support = viewerSupported();
  if (!support.ok) return { ok: false, reason: support.reason };
  if (!scan?.landmarks) return { ok: false, reason: "no-photo" };

  onStatus(t("viewer.loading"));
  const T = await loadThree();

  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new T.Scene();
  scene.background = new T.Color(0x111111);

  const camera = new T.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0.15, 4.4);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 2.2;
  controls.maxDistance = 7;
  controls.target.set(0, 0.05, 0);

  // Lighting presets -------------------------------------------------------
  const hemi = new T.HemisphereLight(0xffffff, 0x333333, 1.1);
  const key = new T.DirectionalLight(0xffffff, 2.1);
  key.position.set(2.2, 3.2, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0006;
  key.shadow.radius = 4;
  const rim = new T.DirectionalLight(0xaabbff, 0.5);
  rim.position.set(-3, 1.5, -2.5);
  scene.add(hemi, key, rim);

  const LIGHTS = {
    studio: { hemi: 1.1, key: 2.1, rim: 0.5, bg: 0x111111, keyColor: 0xffffff },
    warm: { hemi: 0.9, key: 2.0, rim: 0.35, bg: 0x1a1310, keyColor: 0xffd9b0 },
    barbershop: { hemi: 0.7, key: 2.6, rim: 0.8, bg: 0x0d0d10, keyColor: 0xfff2e0 },
    soft: { hemi: 1.6, key: 1.1, rim: 0.25, bg: 0x151515, keyColor: 0xffffff }
  };
  function applyLight(name) {
    const l = LIGHTS[name] || LIGHTS.studio;
    hemi.intensity = l.hemi;
    key.intensity = l.key;
    key.color.setHex(l.keyColor);
    rim.intensity = l.rim;
    scene.background = new T.Color(l.bg);
    renderOnce();
  }

  // Head -------------------------------------------------------------------
  const skin = averageSkin(scan.canvas, scan.landmarks);
  const skinMat = new T.MeshStandardMaterial({ color: skin, roughness: 0.72, metalness: 0.02 });

  const head = new T.Group();
  scene.add(head);

  // Base skull: fills the back and sides behind the face mesh.
  const skullGeo = new T.SphereGeometry(1, 64, 48);
  skullGeo.scale(0.98, 1.12, 1.02);
  const skull = new T.Mesh(skullGeo, skinMat);
  skull.position.set(0, 0.02, -0.22);
  skull.castShadow = true;
  skull.receiveShadow = true;
  head.add(skull);

  // Face surface: a curved, photo-textured patch shaped by the MediaPipe mesh.
  // We use the mesh landmarks for the surface depth and the face-oval
  // connections as an alpha mask, so the patch follows the real face instead
  // of being a flat billboard.
  const { oval } = meshConnections();
  if (scan.landmarks) {
    const lm = scan.landmarks;
    const box = scan.faceBox;
    const w = Math.max(0.4, (box.right - box.left) * 2.0);
    const h = Math.max(0.5, (box.bottom - box.top) * 2.2);
    const faceGeo = new T.PlaneGeometry(w * 1.05, h * 1.05, 48, 64);
    const pos = faceGeo.attributes.position;
    const uv = faceGeo.attributes.uv;

    // Depth anchors taken from the mesh itself (nose, cheeks, forehead, chin).
    const anchors = [
      { p: lm[1], r: 0.22 },   // nose tip (most forward)
      { p: lm[10], r: 0.5 },   // forehead
      { p: lm[152], r: 0.5 },  // chin
      { p: lm[234], r: 0.45 }, // left cheek
      { p: lm[454], r: 0.45 }  // right cheek
    ].filter((a) => a.p);

    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const u = x / (w * 1.05) + 0.5;
      const v = 0.5 - y / (h * 1.05);
      const px = box.left + u * (box.right - box.left);
      const py = box.top + v * (box.bottom - box.top);

      let depth = 0, weight = 0;
      for (const a of anchors) {
        const d = Math.hypot(px - a.p.x, py - a.p.y);
        const k = Math.exp(-(d * d) / (a.r * a.r));
        depth += (a.p.z || 0) * k;
        weight += k;
      }
      depth = weight ? depth / weight : 0;
      // Gentle ellipsoid falloff so the cheeks wrap around the skull.
      const nx = Math.min(1, Math.abs(x) / (w / 2));
      const ny = Math.min(1, Math.abs(y) / (h / 2));
      pos.setZ(i, 0.62 + depth * 2.2 - 0.34 * nx * nx - 0.1 * ny * ny);

      uv.setXY(i, px, 1 - py); // photo UV in image space
    }
    faceGeo.computeVertexNormals();

    const tex = new T.CanvasTexture(scan.canvas);
    tex.colorSpace = T.SRGBColorSpace;
    tex.needsUpdate = true;

    const faceMat = new T.MeshStandardMaterial({
      map: tex,
      roughness: 0.8,
      metalness: 0.02,
      alphaMap: ovalAlphaTexture(scan.landmarks, oval, box, T),
      transparent: true,
      alphaTest: 0.35,
      side: T.FrontSide
    });

    const face = new T.Mesh(faceGeo, faceMat);
    face.position.set(0, (0.5 - (box.top + box.bottom) / 2) * 2.2, 0);
    face.castShadow = true;
    face.receiveShadow = true;
    head.add(face);
  }

  // Soft contact shadow under the chin (cheap AO-ish grounding).
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = shadowCanvas.height = 128;
  const sctx = shadowCanvas.getContext("2d");
  const grad = sctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, "rgba(0,0,0,.55)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 128, 128);
  const shadowTex = new T.CanvasTexture(shadowCanvas);
  const shadowPlane = new T.Mesh(
    new T.PlaneGeometry(2.4, 1.6),
    new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
  );
  shadowPlane.position.set(0, -1.75, 0.4);
  head.add(shadowPlane);

  // Hair -------------------------------------------------------------------
  const hairGroup = new T.Group();
  head.add(hairGroup);
  let hairInfo = { loaded: false };

  async function applyHair(style) {
    while (hairGroup.children.length) {
      const child = hairGroup.children.pop();
      child.traverse?.((o) => {
        o.geometry?.dispose?.();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
          else o.material.dispose?.();
        }
      });
    }
    const specs = style?.defaults || {};
    const color = specs.color || "#2b2320";
    const length = Number.isFinite(state.length) ? state.length : specs.length ?? 0.5;
    const fade = Number.isFinite(state.fade) ? state.fade : specs.fade ?? 0.5;

    if (style?.file) {
      try {
        const loader = new GLTFLoader();
        const gltf = await loader.loadAsync(new URL(`../assets/hair/${style.file}`, import.meta.url).href);
        const root = gltf.scene;
        const anchors = style.anchors || {};
        root.scale.setScalar(anchors.scale || 1);
        if (anchors.position) root.position.fromArray(anchors.position);
        if (anchors.rotation) root.rotation.fromArray(anchors.rotation);
        root.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of mats) {
              if (!m) continue;
              if (m.color) m.color.set(new T.Color(color));
              m.anisotropy = 0.8;
              m.needsUpdate = true;
            }
          }
        });
        hairGroup.add(root);
        hairInfo = { loaded: true, name: style.name, license: style.license };
        return hairInfo;
      } catch (err) {
        // Fall through to the built-in example rather than an empty head.
        hairInfo = { loaded: false, error: style.file };
      }
    }
    hairGroup.add(buildCards({ color, length, fade }));
    hairInfo = { loaded: false, builtin: Boolean(style?.builtin), name: style?.name };
    return hairInfo;
  }

  const state = { length: 0.5, fade: 0.5, color: "#2b2320", lighting: "studio" };
  await applyHair(hairStyle);
  applyLight("studio");

  // Resize / render ---------------------------------------------------------
  function resize() {
    const w = canvas.clientWidth || 320;
    const h = canvas.clientHeight || 420;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderOnce();
  }

  let raf = 0;
  let needsRender = true;
  function renderOnce() {
    needsRender = true;
  }
  function loop() {
    raf = requestAnimationFrame(loop);
    controls.update();
    if (needsRender) {
      needsRender = false;
      renderer.render(scene, camera);
    }
  }

  const observer = new ResizeObserver(() => resize());
  observer.observe(canvas);
  resize();
  loop();

  // Public API --------------------------------------------------------------
  const api = {
    info: hairInfo,
    async setHair(style) {
      if (style?.defaults?.color) state.color = style.defaults.color;
      return applyHair(style);
    },
    setLength(value) {
      state.length = Math.max(0, Math.min(1, value));
      return applyHair(hairStyle || { builtin: true, defaults: { color: state.color } });
    },
    setFade(value) {
      state.fade = Math.max(0, Math.min(1, value));
      return applyHair(hairStyle || { builtin: true, defaults: { color: state.color } });
    },
    setColor(value) {
      state.color = value;
      hairGroup.traverse((o) => {
        if (o.isMesh && o.material && o.material.color) o.material.color.set(new T.Color(value));
      });
      renderOnce();
    },
    setLighting(name) {
      state.lighting = name;
      applyLight(name);
    },
    view(preset) {
      const views = {
        front: { pos: [0, 0.05, 4.3], target: [0, 0.05, 0] },
        side: { pos: [4.0, 0.1, 0.35], target: [0, 0.05, 0] },
        back: { pos: [0, 0.1, -4.3], target: [0, 0.05, 0] },
        top: { pos: [0, 4.6, 0.9], target: [0, 0.3, 0] }
      };
      const v = views[preset] || views.front;
      camera.position.set(...v.pos);
      controls.target.set(...v.target);
      controls.update();
      renderOnce();
    },
    snapshot() {
      renderer.render(scene, camera);
      return canvas.toDataURL("image/png");
    },
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x?.dispose?.());
        else m?.dispose?.();
      });
    }
  };

  return { ok: true, api };
}

/** Load the hair manifest (missing/broken manifest is not fatal). */
export async function loadHairManifest() {
  try {
    const res = await fetch(MANIFEST_URL, { cache: "no-cache" });
    if (!res.ok) return { version: 0, styles: [], error: `manifest ${res.status}` };
    const data = await res.json();
    const styles = Array.isArray(data.styles) ? data.styles.filter((s) => s && s.id) : [];
    return { version: data.version || 1, styles };
  } catch (err) {
    return { version: 0, styles: [], error: "manifest-unreachable" };
  }
}

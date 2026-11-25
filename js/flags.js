// Cutfit feature flags.
//
// Every unfinished or risky part of the app sits behind one of these.
// Defaults can be overridden without a deploy:
//   ?flags=scanV2:0,viewer3d:0      (remembered in localStorage)
//   window.CUTFIT_FLAGS = {...}     (set before app.js loads)
// Turn a flag off here to hide a feature for everyone.

export const FLAG_DEFAULTS = {
  scanV2: true,   // MediaPipe landmarker + hair segmenter scan flow
  aiV2: true,     // mask-based fal.ai inpaint pipeline (try-on tab)
  viewer3d: true  // Three.js head simulator (lazy loaded)
};

const KEY = "cf_flags_v1";
const current = { ...FLAG_DEFAULTS };

function readStored() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readQuery() {
  const out = {};
  try {
    const raw = new URLSearchParams(location.search).get("flags");
    if (!raw) return out;
    for (const pair of raw.split(",")) {
      const [name, value] = pair.split(":");
      if (name) out[name.trim()] = !(value === "0" || value === "false");
    }
  } catch {
    /* ignore malformed query */
  }
  return out;
}

const query = readQuery();
if (Object.keys(query).length) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readStored(), ...query }));
  } catch {
    /* storage may be blocked */
  }
}

apply({
  ...readStored(),
  ...query,
  ...(typeof window !== "undefined" && window.CUTFIT_FLAGS ? window.CUTFIT_FLAGS : {})
});

function apply(values) {
  for (const [key, value] of Object.entries(values || {})) {
    if (key in FLAG_DEFAULTS) current[key] = Boolean(value);
  }
}

/** True when a flag is on. Unknown flags are off. */
export function flag(name) {
  return current[name] === true;
}

/** Toggle a flag at runtime (hidden debug panel) and remember it. */
export function setFlag(name, value) {
  if (!(name in FLAG_DEFAULTS)) return false;
  current[name] = Boolean(value);
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readStored(), [name]: current[name] }));
  } catch {
    /* ignore */
  }
  return true;
}

/** Snapshot for debugging. */
export function flagSnapshot() {
  return { ...current };
}

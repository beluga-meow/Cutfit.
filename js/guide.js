// Cutfit guide — a deterministic, offline helper chat.
// Answers are plain text inserted with textContent, so nothing here can inject
// markup. It is not an AI model and does not claim to be one.

import { t } from "./i18n.js";
import { SHAPE_COPY } from "./catalog.js";

const RULES = [
  [/studio|create|custom|mannequin|own (hair|style|cut)|build (a )?(hair|style)|3d/i,
    "Open the 3D tab to see your head in 3D, or tap + in Styles or My looks to design a custom style, save it, try it on your photo, or send it to AI."],
  [/photo|camera|selfie|upload|picture|oval|scan/i,
    "Open Scan and tap Take a photo for the guided live scan, or Upload a photo. The oval and the messages tell you when to move closer, look straight or add light. It captures automatically after about a second of good quality."],
  [/accura|how.*(work|measure)|ratio|confidence|landmark/i,
    "It measures face length, forehead, cheekbone and jaw width, plus the jaw angle and chin shape from 468 landmarks, averages several frames, and matches them to 7 shapes. You get High/Medium/Low confidence instead of a fake percentage."],
  [/barber|salon|price|rate|review|near|peso|₱/i,
    "Open Barbers for nearby shops with ratings, price levels and hours. Prices are listed in pesos. Confirm prices with the shop, and use the barber card to show the exact specs."],
  [/spin|roulette|game|random|fun/i,
    "Open Roulette and tap Spin to discover a haircut from the catalog."],
  [/try.on|preview|edit|credit|seed/i,
    "Open Try-on, add a photo in Scan, choose a cut and tap Generate AI. Your photo and a hair mask go to our worker and fal.ai; only the hair can change. Credits are checked on the server now, not in your browser."],
  [/style|library|old|classic|modern|trend|haircut|women|neutral/i,
    "Styles shows men’s, women’s and gender-neutral cuts with illustrations. Filter by era, length, style type, hair type or audience, then move between pages."],
  [/privacy|data|safe|store|terms|agree|delete/i,
    "Scanning and the 3D viewer run in your browser. Only an AI preview uploads one photo, and results are deleted automatically. Open Privacy for the plain-language notice, or use Delete my photos to clear everything on this device."],
  [/^(hi|hello|hey|kumusta)|help/i,
    "Hi! I can guide you through scanning, face shapes, the 3D viewer, the style library, the roulette, barbers and privacy. What would you like to know?"]
];

const SHAPE_WORDS = {
  oval: "oval", round: "round", square: "square", rect: "rect",
  oblong: "rect", heart: "heart", diamond: "diamond", triang: "tri", pear: "tri"
};

export function createGuide({ log, chips, input, send, button, onTerms }) {
  const say = (text, fromUser = false) => {
    if (!log) return;
    const d = document.createElement("div");
    d.className = "m " + (fromUser ? "u" : "b");
    d.textContent = text;
    log.append(d);
    log.scrollTop = log.scrollHeight;
  };

  const suggest = () => {
    if (!chips) return;
    chips.innerHTML = "";
    [
      "How do I take a photo?",
      "How accurate is it?",
      "Find a barber",
      "What is my shape?",
      "How do I use Try-on?"
    ].forEach((q) => {
      const b = document.createElement("button");
      b.className = "chip";
      b.type = "button";
      b.textContent = q;
      b.addEventListener("click", () => ask(q));
      chips.append(b);
    });
  };

  function ask(question, state = {}) {
    const q = String(question || "").trim().slice(0, 300);
    if (!q) return;
    say(q, true);
    const s = q.toLowerCase();
    let reply;
    if (/my (face )?shape|my result/.test(s)) {
      const shape = state.shape;
      reply = shape
        ? `Your closest shape is ${SHAPE_COPY[shape]?.n || shape}. ${SHAPE_COPY[shape]?.g || ""} Try ${(SHAPE_COPY[shape]?.r || []).slice(0, 3).join(", ")}.`
        : "Add a photo in Scan and tap Analyze my face, then I can tell you more.";
    } else {
      const key = s.match(/\b(oval|round|square|rect|oblong|heart|diamond|triang|pear)\b/);
      if (key) {
        const shape = SHAPE_WORDS[key[1]];
        reply = `${SHAPE_COPY[shape].n}: ${SHAPE_COPY[shape].g} Good picks: ${SHAPE_COPY[shape].r.slice(0, 3).join(", ")}.`;
      } else {
        const rule = RULES.find((r) => r[0].test(s));
        reply = rule
          ? rule[1]
          : "I can help with scanning, face shapes, the 3D viewer, the style library, the roulette, barbers and privacy. What would you like to know?";
      }
    }
    if (/terms|agree|privacy/.test(s)) onTerms?.();
    setTimeout(() => say(reply), 250);
  }

  const submit = () => {
    const value = input?.value?.trim();
    if (!value) return;
    input.value = "";
    ask(value);
  };

  button?.addEventListener("click", submit);
  send?.addEventListener("click", submit);
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  });

  return { ask, say, suggest, greeting: () => t("nav.scan") };
}

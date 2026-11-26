// Cutfit i18n — English + Filipino. Tiny, no dependencies.
// Only UI chrome, guidance and safety copy are translated; style names and the
// barbers' own descriptions stay in the language they were collected in.

const DICT = {
  en: {
    "app.tagline": "HAIRCUT STUDIO FOR EVERYONE",
    "nav.scan": "Scan",
    "nav.styles": "Styles",
    "nav.roulette": "Roulette",
    "nav.try": "Try-on",
    "nav.saved": "My looks",
    "nav.barbers": "Barbers",
    "brand.name": "Cutfit",

    "scan.h1": "Find the cut that fits your face",
    "scan.lead": "Scan your face, discover cuts that fit your features, then explore styles and reference videos. Your photo is processed in your browser.",
    "scan.tipsTitle": "For a better scan",
    "scan.tips": "Face the camera • keep your whole face visible • use even lighting • remove hats and heavy filters.",
    "scan.photo": "Take a photo",
    "scan.upload": "Upload a photo",
    "scan.capture": "Capture",
    "scan.cancel": "Cancel",
    "scan.liveStart": "Start live scan",
    "scan.liveStop": "Stop camera",
    "scan.retake": "Change photo",
    "scan.remove": "Remove",
    "scan.consentTitle": "Pause before we use your camera",
    "scan.guide": "Move your face inside the oval.",
    "scan.q.moveCloser": "Move a little closer.",
    "scan.q.tooFar": "Move back so your whole head fits.",
    "scan.q.center": "Center your face in the oval.",
    "scan.q.lookStraight": "Look straight at the camera.",
    "scan.q.tooDark": "Too dark — find brighter, even light.",
    "scan.q.overexposed": "Too bright — avoid a lamp or window behind you.",
    "scan.q.blurry": "Hold still — the photo is blurry.",
    "scan.q.holdStill": "Hold still…",
    "scan.q.glasses": "Glasses or hair may be covering your face. Adjust and try again.",
    "scan.q.ready": "Looks good. Hold still.",
    "scan.q.captured": "Got it. Analyzing your face…",
    "scan.q.noFace": "No face found. Face the camera in even light.",
    "scan.q.faceSmall": "Your face is too small in the frame.",
    "scan.q.uploadBad": "We could not measure this photo. Try a straight-on photo with your hair off your forehead.",
    "scan.status": "Face the camera, hair pulled back, even light.",
    "scan.panelTitle": "Your scan",
    "scan.panelAdjust": "Your face points",
    "scan.step": "01 / 02",
    "scan.help": "Contour and mesh only — no dots. Open Fine-tune if a point is off.",
    "scan.auto": "Auto-detect",
    "scan.reset": "Reset points",
    "scan.finetune": "Fine-tune",
    "scan.analyze": "Analyze my face & find my cuts",
    "scan.quality": "Scan quality",
    "scan.frames": "frames averaged",
    "scan.hairline": "Hairline from hair segmentation",
    "scan.consentRequired": "Agree to the photo notice before scanning.",

    "confidence.high": "High confidence",
    "confidence.medium": "Medium confidence",
    "confidence.low": "Low confidence",
    "confidence.retry": "Low confidence — take a clearer, straight-on photo for a better result.",

    "try.h1": "Find your next look.",
    "try.lead": "Choose a modern cut, generate a realistic AI preview, and compare real haircut references before visiting your barber.",
    "try.generate": "Generate AI",
    "try.regenerate": "Regenerate",
    "try.save": "Save",
    "try.before": "Original",
    "try.after": "AI preview",
    "try.compare": "Drag to compare",
    "try.seed": "Seed",
    "try.color": "Hair color",
    "try.beard": "Style the beard too",
    "try.views": "Views",
    "try.front": "Front",
    "try.side": "Side",
    "try.back": "Back",
    "try.needPhoto": "Add a photo in Scan first.",
    "try.needSide": "Add a side photo in Scan to generate a side view.",
    "try.progress1": "Preparing your photo…",
    "try.progress2": "Segmenting your hair…",
    "try.progress3": "Queued at the AI service…",
    "try.progress4": "Generating your haircut…",
    "try.progress5": "Finishing, preserving your face…",
    "try.done": "Your AI hairstyle preview is ready.",
    "try.disabled": "AI previews are turned off right now.",
    "try.needsDeploy": "AI preview is temporarily unavailable. Try again in a moment.",
    "try.unavailable": "AI preview is temporarily unavailable. Try again in a moment.",
    "try.credits": "AI credits: {n}",
    "try.creditsOffline": "AI credits: offline — tap to retry",
    "try.creditsLoading": "AI credits: …",
    "try.retry": "Retry",
    "filters.active": "{n} active",

    "flags.off": "This feature is turned off in this build.",

    "viewer.h1": "3D head simulator",
    "viewer.lead": "Lazy-loaded Three.js viewer built from your face mesh.",
    "viewer.open": "Open 3D simulator",
    "viewer.noWebGL": "3D needs WebGL, which this device or browser has turned off. Showing the AI photo preview instead.",
    "viewer.weak": "This device looks too slow for smooth 3D. Showing the AI photo preview instead.",
    "viewer.noPhoto": "Add a photo in Scan to build your 3D head.",
    "viewer.loading": "Loading the 3D viewer…",
    "viewer.hairMissing": "No licensed hair asset is installed, so the head shows a plain scalp.",
    "viewer.length": "Length",
    "viewer.fade": "Fade / taper",
    "viewer.light": "Lighting",
    "viewer.shot": "Save snapshot",
    "viewer.reset": "Reset view",

    "barbers.h1": "Barbers & salons near you",
    "barbers.dirTitle": "Barber directory",
    "barbers.lead": "Live hair shops from OpenStreetMap, plus the barber directory below. Confirm hours and prices before you travel.",
    "barbers.search": "Search shops or areas",
    "barbers.review": "Write a review",
    "barbers.openMaps": "Open in Maps",
    "barbers.call": "Call",
    "barbers.share": "Barber card",
    "barbers.price": "Price",
    "barbers.upkeep": "Upkeep",
    "barbers.sides": "SIDES",
    "barbers.top": "TOP",
    "barbers.fade": "FADE",
    "barbers.finish": "FINISH",
    "barbers.face": "FACE SHAPE",
    "barbers.cardTitle": "Your Cutfit barber card",

    "share.button": "Share",
    "share.copied": "Link copied.",
    "share.unsupported": "Sharing is not available here, so the image was downloaded instead.",

    "privacy.title": "Privacy",
    "privacy.open": "Privacy notice",
    "consent.title": "Your face data",
    "consent.body": "Photos and face measurements can count as biometric data. Cutfit scans in your browser. Nothing is uploaded until you press Generate AI, and then only the single photo you chose is sent to our worker and fal.ai to make the preview. Other photos stay on this device.",
    "consent.point1": "Face scanning and the 3D viewer run entirely in your browser.",
    "consent.point2": "AI previews send one photo + a hair mask to our worker and fal.ai, then the result is stored for a short time and deleted automatically.",
    "consent.point3": "We do not create an account, and we do not sell data.",
    "consent.point4": "You can delete every photo Cutfit holds with one button.",
    "consent.accept": "I understand and agree",
    "consent.decline": "Not now",
    "consent.delete": "Delete my photos",
    "consent.deleted": "Your photos and scan data were removed from this device.",

    "salons.eyebrow": "LIVE SALON FINDER",
    "salons.title": "Salons for women near you",
    "salons.lead": "OpenStreetMap data, no account needed. Coverage depends on local mapping, so call ahead to confirm services and prices.",
    "salons.locate": "Use my location",
    "salons.fallback": "Search on Google Maps",
    "salons.women": "Women’s salons",
    "salons.all": "All hair shops",
    "salons.idle": "Tap “Use my location” to see hair shops within about 4 km.",
    "salons.searching": "Finding hair shops near you…",
    "salons.results": "{n} shops found nearby, nearest first.",
    "salons.none": "No mapped shops within 4 km. Try the Google Maps search above, or move the search area.",
    "salons.noneWomen": "No women’s salons are mapped within 4 km. Switch to “All hair shops”, or use the Google Maps search above.",
    "salons.denied": "Location is blocked. You can allow it in your browser settings, or use the Google Maps search above.",
    "salons.unsupported": "This browser cannot share a location. Use the Google Maps search above.",
    "salons.insecure": "Location only works on a secure (https) page. Use the Google Maps search above.",
    "salons.busy": "OpenStreetMap is busy right now. Try again in a minute.",
    "salons.timeout": "Finding your location took too long. Try again or use the Google Maps search.",
    "salons.error": "The live salon search is unavailable right now. Use the Google Maps search above.",
    "salons.maps": "Maps",
    "salons.directions": "Directions",
    "salons.call": "Call",
    "salons.badge.women": "Salon",
    "salons.badge.barber": "Barber",
    "salons.badge.hair": "Hair shop",

    "common.close": "Close",
    "common.offline": "You are offline. Cached pages still work.",
    "common.error": "Something went wrong. Please try again.",
    "common.install": "Install app",
    "common.language": "Language",
    "common.loading": "Loading…",
    "common.retry": "Try again"
  },
  fil: {
    "app.tagline": "STUDYO NG GUPIT PARA SA LAHAT",
    "nav.scan": "Scan",
    "nav.styles": "Estilo",
    "nav.roulette": "Ruleta",
    "nav.try": "Subukan",
    "nav.saved": "Mga look ko",
    "nav.barbers": "Barbero",
    "brand.name": "Cutfit",

    "scan.h1": "Hanapin ang gupit na bagay sa mukha mo",
    "scan.lead": "I-scan ang mukha, tuklasin ang mga gupit na bagay sa features mo, pagkatapos tumingin ng estilo at reference na video. Pinoproseso ang litrato sa loob ng browser mo.",
    "scan.tipsTitle": "Para sa mas magandang scan",
    "scan.tips": "Humara sa camera • ipakita ang buong mukha • pantay na ilaw • alisin ang sumbrero at matinding filter.",
    "scan.photo": "Kumuha ng litrato",
    "scan.upload": "Mag-upload ng litrato",
    "scan.capture": "Kunan",
    "scan.cancel": "Kanselahin",
    "scan.liveStart": "Simulan ang live scan",
    "scan.liveStop": "Itigil ang camera",
    "scan.retake": "Palitan ang litrato",
    "scan.remove": "Alisin",
    "scan.consentTitle": "Bago gamitin ang camera",
    "scan.guide": "Ilagay ang mukha sa loob ng oval.",
    "scan.q.moveCloser": "Lumapit nang kaunti.",
    "scan.q.tooFar": "Bumalik nang kaunti para kasya ang buong ulo.",
    "scan.q.center": "Igitna ang mukha sa oval.",
    "scan.q.lookStraight": "Tumingin nang diretso sa camera.",
    "scan.q.tooDark": "Masyadong madilim — humanap ng mas maliwanag na ilaw.",
    "scan.q.overexposed": "Masyadong maliwanag — iwasan ang ilaw sa likod mo.",
    "scan.q.blurry": "Huminto — malabo ang litrato.",
    "scan.q.holdStill": "Huminto lang…",
    "scan.q.glasses": "May salamin o buhok na tumatakip sa mukha. Ayusin at subukan ulit.",
    "scan.q.ready": "Mukhang maayos. Huminto lang.",
    "scan.q.captured": "Nakuha. Sinusuri ang mukha…",
    "scan.q.noFace": "Walang nakitang mukha. Humara sa camera sa pantay na ilaw.",
    "scan.q.faceSmall": "Masyadong maliit ang mukha sa frame.",
    "scan.q.uploadBad": "Hindi namin masukat ang litratong ito. Subukan ang harapang litrato na nakataas ang buhok.",
    "scan.status": "Humara sa camera, nakataas ang buhok, pantay na ilaw.",
    "scan.panelTitle": "Iyong scan",
    "scan.panelAdjust": "Mga punto ng mukha",
    "scan.step": "01 / 02",
    "scan.help": "Contour at mesh lang — walang tuldok. Buksan ang Fine-tune kung mali ang isang punto.",
    "scan.auto": "Auto-detect",
    "scan.reset": "I-reset ang puntos",
    "scan.finetune": "Fine-tune",
    "scan.analyze": "Suriin ang mukha at hanapin ang gupit",
    "scan.quality": "Kalidad ng scan",
    "scan.frames": "mga frame na na-average",
    "scan.hairline": "Hairline mula sa hair segmentation",
    "scan.consentRequired": "Sumang-ayon muna sa paunawa ng litrato.",

    "confidence.high": "Mataas na kumpiyansa",
    "confidence.medium": "Katamtamang kumpiyansa",
    "confidence.low": "Mababang kumpiyansa",
    "confidence.retry": "Mababang kumpiyansa — kumuha ng mas malinaw at harapang litrato.",

    "try.h1": "Hanapin ang susunod na look mo.",
    "try.lead": "Pumili ng modernong gupit, gumawa ng realistic na AI preview, at ihambing sa totoong reference bago pumunta sa barbero.",
    "try.generate": "Gumawa gamit ang AI",
    "try.regenerate": "Gumawa ulit",
    "try.save": "I-save",
    "try.before": "Orihinal",
    "try.after": "AI preview",
    "try.compare": "I-drag para ihambing",
    "try.seed": "Seed",
    "try.color": "Kulay ng buhok",
    "try.beard": "Ayusin din ang balbas",
    "try.views": "Mga anggulo",
    "try.front": "Harap",
    "try.side": "Gilid",
    "try.back": "Likod",
    "try.needPhoto": "Maglagay muna ng litrato sa Scan.",
    "try.needSide": "Magdagdag ng gilid na litrato sa Scan para sa side view.",
    "try.progress1": "Inihahanda ang litrato…",
    "try.progress2": "Sinusuri ang buhok…",
    "try.progress3": "Nakapila sa AI service…",
    "try.progress4": "Ginagawa ang gupit…",
    "try.progress5": "Tinatapos, pinapanatili ang mukha mo…",
    "try.done": "Handa na ang AI preview mo.",
    "try.disabled": "Patay ang AI previews ngayon.",
    "try.needsDeploy": "Pansamantalang hindi available ang AI preview. Subukan ulit mamaya.",
    "try.unavailable": "Pansamantalang hindi available ang AI preview. Subukan ulit mamaya.",
    "try.credits": "AI credits: {n}",
    "try.creditsOffline": "AI credits: offline — pindutin para subukan ulit",
    "try.creditsLoading": "AI credits: …",
    "try.retry": "Subukan ulit",
    "filters.active": "{n} aktibo",

    "flags.off": "Nakapatay ang feature na ito sa build na ito.",

    "viewer.h1": "3D head simulator",
    "viewer.lead": "Three.js viewer na gawa sa face mesh mo, load lang kapag binuksan.",
    "viewer.open": "Buksan ang 3D",
    "viewer.noWebGL": "Kailangan ng WebGL ang 3D, na patay sa device o browser na ito. AI photo preview ang ipapakita.",
    "viewer.weak": "Masyadong mabagal ang device na ito para sa 3D. AI photo preview ang ipapakita.",
    "viewer.noPhoto": "Maglagay ng litrato sa Scan para mabuo ang 3D head mo.",
    "viewer.loading": "Naglo-load ang 3D viewer…",
    "viewer.hairMissing": "Walang lisensyadong hair asset na naka-install, kaya plain scalp ang nakikita.",
    "viewer.length": "Haba",
    "viewer.fade": "Fade / taper",
    "viewer.light": "Ilaw",
    "viewer.shot": "I-save ang snapshot",
    "viewer.reset": "I-reset ang view",

    "barbers.h1": "Mga barbero at salon malapit sa iyo",
    "barbers.dirTitle": "Direktoryo ng barbero",
    "barbers.lead": "Live na hair shop mula sa OpenStreetMap, kasama ang direktoryo ng barbero sa ibaba. Kumpirmahin ang oras at presyo bago pumunta.",
    "barbers.search": "Maghanap ng shop o lugar",
    "barbers.review": "Magbigay ng review",
    "barbers.openMaps": "Buksan sa Maps",
    "barbers.call": "Tumawag",
    "barbers.share": "Barber card",
    "barbers.price": "Presyo",
    "barbers.upkeep": "Maintenance",
    "barbers.sides": "GILID",
    "barbers.top": "TAAS",
    "barbers.fade": "FADE",
    "barbers.finish": "FINISH",
    "barbers.face": "HUGIS NG MUKHA",
    "barbers.cardTitle": "Ang Cutfit barber card mo",

    "share.button": "I-share",
    "share.copied": "Nakopya ang link.",
    "share.unsupported": "Walang sharing dito, kaya na-download na lang ang litrato.",

    "privacy.title": "Privacy",
    "privacy.open": "Paunawa sa privacy",
    "consent.title": "Data ng mukha mo",
    "consent.body": "Ang litrato at sukat ng mukha ay maaaring ituring na biometric data. Sa browser mo nangyayari ang scan. Walang ipapadala hangga't hindi mo pinindot ang Gumawa gamit ang AI, at isang litrato lang ang ipapadala sa worker at fal.ai para gawin ang preview. Nasa device mo lang ang ibang litrato.",
    "consent.point1": "Nasa browser mo ang face scanning at 3D viewer.",
    "consent.point2": "Isang litrato at hair mask ang ipinapadala para sa AI preview, tapos pansamantala lang itong itinatabi at awtomatikong binubura.",
    "consent.point3": "Walang account, at hindi kami nagbebenta ng data.",
    "consent.point4": "Puwede mong burahin lahat ng litrato ng Cutfit sa isang pindot.",
    "consent.accept": "Naiintindihan ko at sumasang-ayon",
    "consent.decline": "Mamaya na",
    "consent.delete": "Burahin ang mga litrato ko",
    "consent.deleted": "Nabura na ang litrato at scan data mo sa device na ito.",

    "salons.eyebrow": "LIVE NA SALON FINDER",
    "salons.title": "Mga salon para sa kababaihan malapit sa iyo",
    "salons.lead": "Data mula sa OpenStreetMap, walang account na kailangan. Depende sa lokal na mapping ang coverage, kaya tumawag muna para kumpirmahin ang serbisyo at presyo.",
    "salons.locate": "Gamitin ang lokasyon ko",
    "salons.fallback": "Maghanap sa Google Maps",
    "salons.women": "Mga salon",
    "salons.all": "Lahat ng hair shop",
    "salons.idle": "Pindutin ang “Gamitin ang lokasyon ko” para makita ang mga shop sa loob ng mga 4 km.",
    "salons.searching": "Naghahanap ng mga hair shop malapit sa iyo…",
    "salons.results": "{n} shop ang nahanap, pinakamalapit muna.",
    "salons.none": "Walang naka-map na shop sa loob ng 4 km. Subukan ang Google Maps sa itaas.",
    "salons.noneWomen": "Walang naka-map na salon para sa kababaihan sa loob ng 4 km. Subukan ang “Lahat ng hair shop”, o ang Google Maps sa itaas.",
    "salons.denied": "Naka-block ang lokasyon. Payagan ito sa settings ng browser, o gamitin ang Google Maps sa itaas.",
    "salons.unsupported": "Hindi kayang magbahagi ng lokasyon ang browser na ito. Gamitin ang Google Maps sa itaas.",
    "salons.insecure": "Gumagana lang ang lokasyon sa secure (https) na page. Gamitin ang Google Maps sa itaas.",
    "salons.busy": "Abala ang OpenStreetMap ngayon. Subukan ulit pagkalipas ng isang minuto.",
    "salons.timeout": "Masyadong matagal ang paghahanap ng lokasyon. Subukan ulit o gamitin ang Google Maps.",
    "salons.error": "Pansamantalang hindi available ang live na salon search. Gamitin ang Google Maps sa itaas.",
    "salons.maps": "Maps",
    "salons.directions": "Direksyon",
    "salons.call": "Tumawag",
    "salons.badge.women": "Salon",
    "salons.badge.barber": "Barbero",
    "salons.badge.hair": "Hair shop",

    "common.close": "Isara",
    "common.offline": "Wala kang internet. Gumagana pa ang naka-cache na pahina.",
    "common.error": "May naging mali. Subukan ulit.",
    "common.install": "I-install ang app",
    "common.language": "Wika",
    "common.loading": "Naglo-load…",
    "common.retry": "Subukan ulit"
  }
};

export const LANGS = ["en", "fil"];
const KEY = "cf_lang";
let lang = "en";
try {
  const saved = localStorage.getItem(KEY);
  if (saved && LANGS.includes(saved)) lang = saved;
  else if ((navigator.language || "").toLowerCase().startsWith("fil")) lang = "fil";
} catch {
  /* storage blocked */
}

export function getLang() {
  return lang;
}

export function setLang(next) {
  if (!LANGS.includes(next)) return lang;
  lang = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = next === "fil" ? "fil" : "en";
  applyToDom();
  document.dispatchEvent(new CustomEvent("cutfit:lang", { detail: next }));
  return lang;
}

/** Translate a key, with {placeholder} interpolation. */
export function t(key, vars) {
  const table = DICT[lang] || DICT.en;
  let text = table[key] ?? DICT.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}

/**
 * Translate the DOM:
 *   data-i18n="key"                -> textContent
 *   data-i18n-ph="key"             -> placeholder
 *   data-i18n-aria="key"           -> aria-label
 *   data-i18n-title="key"          -> title
 */
export function applyToDom(root = document) {
  document.documentElement.lang = lang === "fil" ? "fil" : "en";
  for (const el of root.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll("[data-i18n-ph]")) {
    el.setAttribute("placeholder", t(el.dataset.i18nPh));
  }
  for (const el of root.querySelectorAll("[data-i18n-aria]")) {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  }
  for (const el of root.querySelectorAll("[data-i18n-title]")) {
    el.setAttribute("title", t(el.dataset.i18nTitle));
  }
  for (const el of root.querySelectorAll("[data-lang-pick]")) {
    el.setAttribute("aria-pressed", el.dataset.langPick === lang ? "true" : "false");
  }
}

/** Currency for the barbers section (prices are collected in pesos). */
export function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  try {
    return new Intl.NumberFormat(lang === "fil" ? "fil-PH" : "en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0
    }).format(n);
  } catch {
    return `₱${Math.round(n)}`;
  }
}

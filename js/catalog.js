// Cutfit catalog — face-shape copy, hairstyle catalog and barber specs.
// The shape copy and the CT catalog are carried over unchanged from the
// original single-file app (only wrapped in exports). Structured specs are new
// and feed the AI prompt builder in js/tryon.js.

export const SHAPE_COPY={
oval:{n:'Oval',d:'Length is about 1.5× the cheekbone width, the forehead is a touch wider than a soft jaw, and no feature dominates. Most cuts work.',g:'Keep the natural balance.',r:['Textured crop','Taper fade','Side part','Slick back','Pompadour','Long layers','Lob','Pixie cut','Curtain bangs','Beach waves'],a:'Heavy fringes that hide your balance.',t:'Choose by hair texture and lifestyle.'},
round:{n:'Round',d:'Width and length are nearly equal, with full cheeks and a soft, curved jaw.',g:'Add length and definition.',r:['Pompadour','Fade quiff','Flat top','Slick back','Taper fade','Long layers','Asymmetric bob','Pixie cut','Lob','Beehive'],a:'Chin-length bobs, round fringes and volume at the sides.',t:'Keep volume on top, not at the cheeks.'},
square:{n:'Square',d:'A strong, angular jaw, with forehead, cheekbones and jaw of similar width.',g:'Soften the angles with texture.',r:['Side part','Textured crop','Buzz cut','Crew cut','Curtains','Ivy League','Long layers','Beach waves','Lob','Pixie cut'],a:'Blunt jaw-length cuts and heavy straight fringes.',t:'Layers, waves and side parts soften the jaw.'},
rect:{n:'Rectangle',d:'Noticeably longer than wide, with a straight cheek line and similar forehead, cheek and jaw widths.',g:'Add width and shorten the look of length.',r:['Textured crop','Ivy League','Curtains','Bowl cut','Curtain bangs','Shag','Wolf cut','1920s bob','Asymmetric bob','Beach waves'],a:'Very long, flat hair and tall volume on top.',t:'Go for fullness at the sides and a fringe.'},
heart:{n:'Heart',d:'A wider forehead and cheekbones taper to a narrower, often pointed chin.',g:'Balance the chin with width lower down.',r:['Side part','Textured crop','Curtains','Ivy League','Lob','1920s bob','Curtain bangs','Long layers','Curly fade','Asymmetric bob'],a:'Slick-backs and heavy volume on top.',t:'Part to the side and keep fullness near the chin.'},
diamond:{n:'Diamond',d:'Cheekbones are the widest point, with a narrower forehead and jaw.',g:'Soften the cheekbones and add width at the forehead and jaw.',r:['Textured crop','Curtains','Fade quiff','Curtain bangs','Lob','Pixie cut','Beach waves','Shag','Wolf cut','Taper fade'],a:'Tight, slicked-back or center-parted styles.',t:'Add width at the forehead and chin.'},
tri:{n:'Triangle',d:'The jaw is the widest part, with a narrower forehead and cheekbones.',g:'Add volume at the forehead and crown.',r:['Pompadour','Fade quiff','Textured crop','Slick back','Flat top','Lob','Pixie cut','Beehive','Afro','Wolf cut'],a:'Chin-length bobs and fullness at the jaw.',t:'Keep volume up top and sleek around the jaw.'}};
// [length÷cheekbones, forehead÷cheekbones, jaw÷cheekbones]

export const CUTS=[
['Pompadour','m','m','c',[14,35,42,0,0,0,0,'F'],'1950s lift, sleek sides'],
['Ducktail','m','m','c',[10,36,44,0,0,82,0,'MF'],'Greaser sides combed back'],
['Crew cut','m','s','c',[0,33,44,0,0,0,0,'F'],'Short, neat, military'],
['Flat top','m','s','c',[0,34,42,0,0,0,0,'LF'],'Boxy top, tight sides'],
['Ivy League','m','s','c',[3,37,46,2,40,0,0,''],'Short, parted, polished'],
['Side part','m','s','c',[4,38,46,2,42,0,0,''],'The timeless business cut'],
['Slick back','m','m','c',[3,32,46,0,0,0,0,''],'Combed straight back'],
['Bowl cut','u','s','c',[0,42,58,1,44,0,0,''],'Even fringe all round'],
['Mullet','m','l','c',[3,36,48,0,0,104,0,'M'],'Short top, long back'],
['1920s bob','f','m','c',[0,38,60,1,44,74,2,''],'Sleek jaw-length bob'],
['Beehive','f','l','c',[20,36,50,1,40,60,0,''],'1960s tall volume'],
['Shag','u','m','c',[3,38,56,3,48,84,5,''],'1970s choppy layers'],
['Afro','u','m','c',[0,38,48,0,0,0,0,'A'],'Full, round natural volume'],
['Mohawk','u','s','c',[0,36,40,0,0,0,0,'NH'],'Shaved sides, tall center'],
['Textured crop','m','s','m',[3,37,42,1,38,0,0,'F'],'Short, textured, easy'],
['Taper fade','m','s','m',[5,36,40,2,40,0,0,'F'],'Gradual fade, swept top'],
['Fade quiff','m','s','m',[10,35,38,2,38,0,0,'F'],'Height up front, faded sides'],
['Buzz cut','m','s','m',[-1,36,44,0,0,0,0,'Z'],'One length, zero fuss'],
['Man bun','m','l','m',[1,35,46,0,0,0,0,'K'],'Long hair tied up'],
['Curtains','m','m','m',[3,38,52,3,48,0,0,''],'Center part, face-framing'],
['Wolf cut','u','m','m',[4,38,52,3,46,86,5,''],'Shaggy layers, lifted top'],
['Lob','f','m','m',[1,37,50,2,44,86,2,''],'Long bob at the collarbone'],
['Pixie cut','f','s','m',[4,36,46,2,40,0,0,''],'Cropped, swept fringe'],
['Curtain bangs','f','l','m',[1,38,52,3,50,100,4,''],'Long hair, soft bangs'],
['Beach waves','u','l','m',[2,37,50,2,42,96,6,'V'],'Loose, tousled waves'],
['Box braids','u','l','m',[0,40,48,0,0,104,0,'R'],'Protective braids'],
['Curly fade','m','s','m',[6,36,40,0,0,0,0,'FU'],'Curls on top, faded sides'],
['Long layers','f','l','m',[2,37,52,2,44,100,4,''],'Soft, flowing layers'],
['Asymmetric bob','f','m','m',[0,38,60,2,46,78,3,''],'Angled, longer on one side'],
['French crop','m','s','m',[2,38,42,1,36,0,0,'F'],'Short textured top with a neat fringe'],
['Low taper','m','s','m',[3,37,43,1,39,0,0,'F'],'Subtle clean taper around the edges'],
['Mid fade','m','s','m',[4,36,40,1,39,0,0,'F'],'Balanced fade with textured top'],
['High fade','m','s','m',[5,35,38,1,38,0,0,'F'],'High contrast faded sides'],
['Caesar cut','m','s','c',[0,39,43,1,34,0,0,'F'],'Short forward fringe'],
['Modern mullet','u','m','m',[5,37,49,2,44,94,5,'M'],'Modern layered back with shorter sides'],
['Perm curls','u','m','m',[8,36,50,2,45,76,3,'U'],'Defined curls with soft volume'],
['French bob','f','s','m',[0,39,59,1,42,70,2,''],'Chic chin-length bob'],
['Butterfly cut','f','l','m',[5,37,53,2,47,100,6,'V'],'Long airy layers framing the face'],
['Hush cut','f','m','m',[3,38,54,3,49,88,5,'V'],'Soft Korean-inspired layers'],
['Korean two-block','m','m','m',[4,39,52,3,48,0,0,''],'Longer top with separated sides'],
['Comma hair','m','m','m',[5,37,51,3,47,0,0,''],'Curved fringe with a soft side part'],
['Side-swept fringe','u','m','m',[4,38,53,2,47,80,3,''],'Soft diagonal fringe'],
['Buzz fade','m','s','m',[-1,36,42,0,0,0,0,'Z'],'Very short buzz with faded sides'],
['Shoulder-length layers','f','l','m',[2,38,54,2,46,108,6,'V'],'Movement and shape around shoulders'],
['Bixie','f','s','m',[2,38,55,2,46,70,2,''],'Pixie and bob hybrid'],
['Slick back undercut','m','m','m',[4,34,43,0,0,0,0,'F'],'Long slicked top and tight sides'],
['Textured quiff','m','s','m',[9,36,42,2,39,0,0,'F'],'Messy volume at the front'],
['Natural curls','u','m','m',[7,38,50,1,44,82,4,'U'],'Defined natural curl shape'],
['Korean comma two-block','m','m','m',[5,37,52,3,47,0,0,''],'Two-block sides with signature comma fringe'],
['Middle part','u','m','m',[3,38,53,3,48,82,4,''],'Balanced center part with soft movement'],
['Wolf cut with bangs','u','m','m',[5,38,55,3,48,92,6,'V'],'Choppy crown layers and face-framing fringe'],
['Modern shag','u','m','m',[4,38,55,3,48,90,5,'V'],'Airy layers with lived-in texture'],
['Burst fade','m','s','m',[5,36,43,1,40,0,0,'F'],'Curved fade around the ears'],
['Drop fade','m','s','m',[4,36,42,1,40,0,0,'F'],'Fade that drops behind the ear'],
['Skin fade','m','s','m',[3,36,40,1,39,0,0,'F'],'Very close fade at the sides'],
['Mid taper with textured top','m','s','m',[6,36,43,2,40,0,0,'F'],'Natural texture with a neat mid taper'],
['Bro flow','m','l','m',[5,37,52,2,45,100,5,'V'],'Medium-long hair swept back naturally'],
['Modern slick back','m','m','m',[5,34,48,0,0,0,0,''],'Clean swept-back shape with natural volume'],
['Edgar cut','m','s','m',[2,39,42,1,34,0,0,'F'],'Defined blunt fringe and faded sides'],
['Textured fringe','m','m','m',[4,39,52,3,46,0,0,''],'Choppy fringe with soft layers'],
['Teddy bear cut','u','m','m',[8,38,54,2,47,82,5,'U'],'Rounded soft layers with airy volume'],
['Korean layered cut','u','m','m',[4,38,54,3,48,92,5,'V'],'Light layers and soft face framing'],
['Japanese wolf cut','u','m','m',[5,38,55,3,48,96,5,'V'],'Feathered layers with a tapered silhouette'],
['A-line bob','f','m','m',[1,38,59,1,43,80,3,''],'Shorter at the back, longer toward the chin'],
['C-curtain layers','f','l','m',[3,38,53,3,48,100,5,'V'],'Long layers with inward-curving ends'],
['Wispy bangs','f','l','m',[2,39,53,3,47,100,4,''],'Light see-through fringe with long hair'],
['Micro bob','f','s','m',[0,39,60,1,42,66,1,''],'Compact bob around cheek-to-jaw length'],
['Modern pixie','f','s','m',[4,36,50,2,42,0,0,''],'Soft textured pixie with a longer top'],
['Tapered afro','u','s','m',[5,38,48,0,0,0,0,'A'],'Natural coils shaped close at the sides'],
['Coily high top','u','s','m',[10,36,45,0,0,0,0,'A'],'Full coily height with clean sides'],
['Shoulder-length wolf cut','u','l','m',[5,38,55,3,48,102,6,'V'],'Long wolf layers with movement'],
['Curtain bob','f','m','m',[2,38,57,3,49,86,3,'V'],'Jaw-grazing bob with long curtain bangs'],
['Wavy bob','f','m','m',[3,38,56,0,42,88,3,'V'],'Soft waves with a rounded silhouette'],
['Grown-out pixie','f','s','m',[5,37,52,2,42,62,1,''],'Pixie length with soft, grown-out edges'],
['Long curtain layers','f','l','m',[3,38,54,3,50,108,5,'V'],'Long layers parted to frame the cheekbones'],
['Curly bob','f','m','m',[8,37,56,1,43,86,4,'U'],'Rounded bob with defined curls'],
['Soft shag with bangs','f','m','m',[4,38,55,3,48,94,5,'V'],'Face-framing shag with a soft fringe'],
['Blunt bob with middle part','f','m','m',[0,39,60,3,44,80,2,''],'One-length bob with a centre part'],
['Coily bob','f','m','m',[9,38,50,0,0,84,4,'A'],'Tapered coils shaped around the jaw'],
['Layered shoulder cut','f','l','m',[2,38,53,3,47,100,5,'V'],'Shoulder-length cut with inward layers'],
['Textured long bob','f','m','m',[4,38,56,2,45,90,4,'V'],'Textured lob with a soft, airy finish'],
['Crew cut with fringe','m','s','m',[1,38,43,1,36,0,0,'F'],'Short crew cut with a blunt fringe'],
['Low fade with beard line','m','s','m',[3,36,42,1,39,0,0,'F'],'Clean low fade blended into a beard line'],
['Textured middle part','m','m','m',[5,39,52,3,48,0,0,''],'Long top split into a soft middle part'],
['Long layered cut','m','l','m',[4,37,52,2,45,96,4,'V'],'Shoulder-length layers worn loose'],
['Curly top fade','m','s','m',[7,36,42,0,0,0,0,'U'],'Curly top with tight faded sides'],
['Side sweep','m','m','m',[4,38,50,2,44,0,0,''],'Swept side fringe with clean edges'],
['Curly shag','u','m','m',[8,38,55,3,48,92,5,'U'],'Layered shag built for curls'],
['Curtain mullet','u','m','m',[5,38,53,3,47,96,5,'V'],'Curtain fringe with a longer back'],
['Soft wolf cut','u','l','m',[5,38,55,3,48,102,6,'V'],'Long wolf layers with airy ends'],
['Buzz with line-up','u','s','m',[0,37,42,0,0,0,0,'Z'],'One-length buzz with a sharp hairline']];

export const CM = Object.fromEntries(CUTS.map((c) => [c[0], c]));
export const SHAPE_KEYS = Object.keys(SHAPE_COPY);
export const ERA = { c: 'Classic oldies', m: 'Modern' };
export const LEN = { s: 'Short', m: 'Medium', l: 'Long' };

export function fig(p) {
 const [t,h,s,f,y,b,w,x]=p,tp=20-t,k=c=>x.includes(c),o=k('Z')?.55:k('N')?.28:1,
 mr=d=>`<path d="${d}" opacity=".3"/><path d="${d}" opacity=".3" transform="matrix(-1 0 0 1 100 0)"/>`;
 let a='',z='';
 if(k('A'))a+='<circle cx="50" cy="38" r="35"/>';
 if(k('M'))a+=`<rect x="32" y="48" width="36" height="${b-48}" rx="8"/>`;
 else if(b){const x0=24-w;a+=`<rect x="${x0}" y="26" width="${52+2*w}" height="${b-26}" rx="13"/>`;if(k('V'))a+=[0,.33,.67,1].map(q=>`<circle cx="${Math.round(x0+6+q*(40+2*w))}" cy="${b-2}" r="7"/>`).join('')}
 z+=`<path opacity="${o}" d="M25.5 ${s}C24 ${tp+14} 36 ${tp} 50 ${tp}S76 ${tp+14} 74.5 ${s}L70 ${s}C69 ${h+2} 62 ${h-3} 50 ${h-3}S31 ${h+2} 30 ${s}Z"/>`;
 if(f==1)z+=`<path d="M29 ${h-6}H71V${y}Q50 ${y+3} 29 ${y}Z"/>`;
 if(f==2)z+=`<path d="M72 ${h-8}V${h+1}Q52 ${h-2} 29 ${y}V${h-8}Z"/>`;
 if(f==3)z+=`<path d="M29 ${h-8}H50Q49 ${y} 29 ${y+4}ZM71 ${h-8}H50Q51 ${y} 71 ${y+4}Z"/>`;
 if(k('F'))z+=mr(`M25.5 ${s}H30L31 ${s+14}H27Z`);
 if(k('H'))z+=`<path d="M44 40V${tp+2}Q50 ${tp-6} 56 ${tp+2}V40Z"/>`;
 if(k('K'))z+=`<circle cx="50" cy="${tp-5}" r="9"/>`;
 if(k('L'))z+=`<rect x="29" y="${tp-5}" width="42" height="14" rx="2"/>`;
 if(k('U'))z+=[...Array(9)].map((_,i)=>{const q=Math.PI*(1+i/8);return `<circle cx="${(50+26*Math.cos(q)).toFixed(1)}" cy="${(46+28*Math.sin(q)).toFixed(1)}" r="7.5"/>`}).join('');
 if(k('R'))z+=`<path d="M38 ${tp+2}V${h}M44 ${tp}V${h-2}M50 ${tp}V${h-3}M56 ${tp}V${h-2}M62 ${tp+2}V${h}" stroke="var(--sk)" stroke-width="1.4" fill="none"/>`;
 return `<svg class="fg" viewBox="0 0 100 110" aria-hidden="true"><path class="sh" d="M10 110Q12 88 40 84H60Q88 88 90 110Z"/><g class="hr">${a}</g><rect class="sk" x="43" y="66" width="14" height="22"/><ellipse class="sk" cx="50" cy="50" rx="21" ry="26"/><g class="hr">${z}</g></svg>`;
}
// ---------------------------------------------------------------- hair types
// Used to steer both the shortlist and the AI prompt. "unsure" keeps the
// original neutral behaviour.
export const HAIR_TYPES = {
  straight: { label: "Straight", prompt: "straight, smooth hair", cues: /(straight|sleek|slick|two-block|bob|curtain)/i },
  wavy: { label: "Wavy", prompt: "wavy hair with soft movement", cues: /(wave|wavy|shag|wolf|layer|bro flow|curtain)/i },
  curly: { label: "Curly", prompt: "defined loose curls", cues: /(curl|perm|shag|wolf|teddy)/i },
  coily: { label: "Coily", prompt: "coily, textured hair with tight pattern", cues: /(afro|coil|braid|natural|high top)/i }
};

export const AUDIENCES = {
  m: "Men’s",
  f: "Women’s",
  u: "Gender-neutral"
};

/** Filter helper for the library and try-on shelf. */
export function matchesAudience(cut, audience = "all") {
  if (!cut) return false;
  if (audience === "all") return true;
  if (audience === "neutral") return cut[1] === "u";
  return cut[1] === audience || cut[1] === "u";
}

export function hairTypeMatch(cut, hairType) {
  if (!hairType || hairType === "unsure") return 0.5;
  const type = HAIR_TYPES[hairType];
  if (!type) return 0.5;
  const text = `${cut[0]} ${cut[5]} ${cut[6] || ""}`;
  return type.cues.test(text) ? 1 : 0.35;
}

// ------------------------------------------------------- structured barber specs
// These replace the four free-text strings with a fixed shape so the AI prompt
// and the shareable barber card stay in sync.
const BASE_SPECS = {
  sides: "Low taper, keep the blend soft",
  top: "2–3 in, textured with scissors",
  fade: "Low / natural taper",
  part: "No hard part",
  texture: "Natural",
  fringe: "No fringe",
  finish: "Matte clay or light texture cream",
  upkeep: "Every 3–4 weeks"
};

export function barberSpecs(cut, prefs = {}) {
  const name = String(cut?.[0] || "").toLowerCase();
  const specs = { ...BASE_SPECS };

  if (/buzz|crew/.test(name)) Object.assign(specs, {
    sides: "Tapered sides, even blend",
    top: "Short and even, clipper + scissor detail",
    fade: "Low taper",
    finish: "Minimal product",
    upkeep: "Every 2–3 weeks"
  });
  else if (/french crop|caesar|textured crop/.test(name)) Object.assign(specs, {
    sides: "Low taper or #2 sides",
    top: "2–3 in, point-cut texture",
    fade: "Low taper, not skin",
    finish: "Matte clay",
    upkeep: "Every 3–4 weeks"
  });
  else if (/two-block|comma|curtain|side-swept/.test(name)) Object.assign(specs, {
    sides: "Two-block sides, softly tapered around ears",
    top: "3–4 in, layered and feathered",
    fade: "No high skin fade",
    finish: "Light cream or soft wax",
    upkeep: "Every 4–6 weeks"
  });
  else if (/pompadour|quiff|slick/.test(name)) Object.assign(specs, {
    sides: "Low / mid taper, clean around ears",
    top: "3–4 in, leave length at front",
    fade: "Low to mid",
    finish: "Pre-styler + matte paste",
    upkeep: "Every 3–4 weeks"
  });
  else if (/fade|taper|undercut/.test(name)) Object.assign(specs, {
    sides: "Faded sides blended into the top",
    top: "Short to medium, textured",
    fade: /skin/.test(name) ? "Skin fade" : /high/.test(name) ? "High fade" : "Mid fade",
    finish: "Matte paste",
    upkeep: "Every 2–4 weeks"
  });
  else if (/bob|lob|pixie|bixie|layers|waves|butterfly|hush/.test(name)) Object.assign(specs, {
    sides: "Face-framing length kept soft",
    top: "Layers with movement",
    fade: "No fade",
    finish: "Light serum or sea-salt spray",
    upkeep: "Every 6–8 weeks"
  });
  else if (/afro|coil|high top/.test(name)) Object.assign(specs, {
    sides: "Tapered around the hairline",
    top: "Shape the natural volume, no relaxing",
    fade: "Low taper",
    finish: "Leave-in conditioner + curl cream",
    upkeep: "Every 3–5 weeks"
  });

  if (/fringe|comma|curtain|two-block|crop|caesar/.test(name)) specs.fringe = "Soft textured fringe";
  if (/side part|ivy|pompadour/.test(name)) specs.part = "Side part";
  if (/middle part|curtain/.test(name)) specs.part = "Center part";
  if (/slick|pompadour|bro flow/.test(name)) specs.fringe = "Swept back, no fringe";

  const texture = prefs.texture && prefs.texture !== "unsure" ? prefs.texture : null;
  specs.texture = texture ? HAIR_TYPES[texture].label : "Natural";

  if (prefs.maintenance === "low") {
    specs.finish = "Lightweight matte cream; keep styling simple";
    specs.upkeep = "Every 4–5 weeks";
  }
  if (prefs.fringe === "off" && specs.fringe !== "No fringe") specs.fringe = "Forehead kept open";
  if (prefs.fringe === "keep" && specs.fringe === "No fringe") specs.fringe = "Keep the existing fringe";

  return specs;
}

export const SPEC_FIELDS = [
  ["sides", "SIDES"],
  ["top", "TOP"],
  ["fade", "FADE"],
  ["part", "PART"],
  ["texture", "TEXTURE"],
  ["fringe", "FRINGE"],
  ["finish", "FINISH"]
];

/** One-line summary used in the barber card and the AI prompt. */
export function specsSentence(specs) {
  return [
    `Sides: ${specs.sides}`,
    `Top: ${specs.top}`,
    `Fade: ${specs.fade}`,
    `Part: ${specs.part}`,
    `Texture: ${specs.texture}`,
    `Fringe: ${specs.fringe}`,
    `Finish: ${specs.finish}`
  ].join(". ");
}

// ---------------------------------------------------------------- shortlist
export function styleScore(cut, prefs, index = 0) {
  let score = Math.max(65, 94 - index * 4);
  const n = String(cut[0]).toLowerCase();
  if (prefs.length === "short" && cut[2] === "s") score += 5;
  if (prefs.length === "keep" && cut[2] === "l") score -= 10;
  if (prefs.length === "keep" && cut[2] === "m") score += 2;
  if (prefs.maintenance === "low" && /(buzz|crew|crop|ivy|taper)/.test(n)) score += 5;
  if (prefs.maintenance === "low" && /(pompadour|slick|quiff|long|wolf)/.test(n)) score -= 5;
  if (prefs.vibe === "trendy" && /(korean|two-block|comma|wolf|shag|textured|curtain)/.test(n)) score += 7;
  if (prefs.vibe === "clean" && /(ivy|taper|crew|side part|french crop)/.test(n)) score += 6;
  if (prefs.vibe === "classic" && /(side part|crew|ivy|pompadour|slick)/.test(n)) score += 6;
  if (prefs.vibe === "bold" && /(mullet|wolf|shag|flat top|perm)/.test(n)) score += 7;
  if (prefs.fringe === "keep" && /(fringe|crop|caesar|bang|two-block|curtain)/.test(n)) score += 7;
  if (prefs.fringe === "off" && /(slick|pompadour|quiff|side part)/.test(n)) score += 5;
  if (prefs.texture === "curly" || prefs.texture === "coily") {
    if (/(curl|afro|perm|shag)/.test(n)) score += 8;
    if (/(slick|side part)/.test(n)) score -= 6;
  }
  if (prefs.texture === "wavy" && /(shag|wolf|layers|curtain|textured)/.test(n)) score += 4;
  if (prefs.density === "fine" && /(textured|crop|quiff|layers)/.test(n)) score += 3;
  return Math.max(61, Math.min(98, score));
}

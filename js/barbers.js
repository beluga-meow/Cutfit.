// Barbers — directory, local reviews and the shareable one-page barber card.
// Shop data is the same list that shipped with the site (Google Maps snapshot
// dated Nov 21, 2026). Prices are in pesos.

import { money, t } from "./i18n.js";
import { SPEC_FIELDS, specsSentence } from "./catalog.js";

export const BARBERS = [
  ["District Barbers", "226 Reparo Rd, Caloocan", 0.7, 0, 0, 0, "", "", "ChIJ1XBq1Lm2lzMR3fSV9RAazaw", "No Google rating or reviews yet."],
  ["Tres Manos Barbers", "3 Milagrosa, Bagong Barrio West, Caloocan", 1.1, 5, 2, 0, "9AM–10PM daily", "+639673996554", "ChIJHy11WgC3lzMR5p8fnNMN1gw", "Reviewers call the barbers friendly and approachable, with good cuts."],
  ["City Cut Barbershop", "90 Malolos Ave, Bagong Barrio West, Caloocan", 1.2, 5, 1, 0, "7AM–8PM daily", "", "ChIJIxR-VAC3lzMRmChfnp1Sefg", "One review so far, and it recommends the shop."],
  ["Supremo Barber, Tandang Sora", "13 Tandang Sora Ave, Quezon City", 1.9, 3.6, 21, 1, "", "", "ChIJDaLHss-2lzMR0MpxR34U7wU", "Reviewers like the skilled barbers and friendly chat. One complains about vaping indoors."],
  ["Fadeday Studio", "Goodwill Homes, Katipunan Ave, Novaliches", 4, 4.7, 65, 1, "9AM–9PM daily", "+639171165936", "ChIJ0atMIjKxlzMRJpCT_XBChvA", "Reviewers praise the cut quality, relaxed vibe, hot towel finish and coffee."],
  ["Hollywood Barbers", "LRI Building, Congressional Ave, Project 8, Quezon City", 4.3, 5, 108, 2, "11AM–8PM daily", "+639458295788", "ChIJG1w5RAC3lzMRHGBACnBI-9w", "Retro-style shop. Reviewers like the assess-first approach, hot towel and massage. One mentions cuts up to about ₱700."],
  ["Game Day Barbershop", "410 N.S. Amoranto Sr. St, Maharlika, Quezon City", 4.8, 4.9, 91, 0, "9AM–8PM daily", "+63284412479", "ChIJBf55BzU1A40R33XUgwBNxU8", "Reviewers like the careful, unhurried cuts, hot towel finish, clean shop and GCash payments."],
  ["Hype District", "141 N.S. Amoranto Sr. St, La Loma, Quezon City", 5.2, 4.8, 1482, 0, "9AM–9PM daily", "+639260267536", "ChIJG21y5EO3lzMRTuVsaVljJRc", "Known for perms and wolf cuts. Most reviews are positive, but a few recent ones report uneven cuts and a scalp reaction after a perm."]
];

const PRICE_LEVEL = ["not listed", "₱ (inexpensive)", "₱₱ (moderate)"];

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function mapsUrl(shop) {
  return (
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(`${shop[0]} ${shop[1]}`) +
    "&query_place_id=" +
    encodeURIComponent(shop[8])
  );
}

/**
 * Render the list. All text goes through esc(); nothing user-typed is ever
 * inserted as raw HTML.
 */
export function renderBarbers(container, { query = "", reviews = {} } = {}) {
  if (!container) return;
  const q = query.trim().toLowerCase();
  const rows = BARBERS.map((shop, index) => ({ shop, index })).filter(
    ({ shop }) => !q || `${shop[0]} ${shop[1]} ${shop[9]}`.toLowerCase().includes(q)
  );

  if (!rows.length) {
    container.innerHTML = `<p class="hint">${esc(t("barbers.search"))}: no shops match. Try a nearby area or a shorter shop name.</p>`;
    return;
  }

  container.innerHTML = rows
    .map(({ shop, index }) => {
      const mine = Array.isArray(reviews[shop[8]]) ? reviews[shop[8]] : [];
      const rating = shop[3] ? `${shop[3].toFixed(1)} ★` : "No rating";
      const reviewCount = shop[4] ? `, ${shop[4].toLocaleString()} Google review${shop[4] > 1 ? "s" : ""}` : "";
      return `<div class="bb">
  <div class="t"><span>${esc(shop[0])}</span><span>${esc(rating)}</span></div>
  <div class="mute fine">${esc(shop[1])}</div>
  <div class="fine">${esc(shop[2])} km away${esc(reviewCount)}</div>
  <div class="fine">${esc(t("barbers.price"))}: ${esc(PRICE_LEVEL[shop[5]] || PRICE_LEVEL[0])}${shop[6] ? `. ${esc(shop[6])}` : ""}</div>
  <p class="fine">${esc(shop[9])}</p>
  ${mine.map((r) => `<p class="fine"><b>Your review:</b> ${"★".repeat(Math.max(0, Math.min(5, Number(r.s) || 0)))}${r.t ? " " + esc(r.t) : ""}</p>`).join("")}
  <div class="chips">
    <button class="chip" data-rv="${index}">${esc(t("barbers.review"))}</button>
    <a class="chip" target="_blank" rel="noopener" href="${esc(mapsUrl(shop))}">${esc(t("barbers.openMaps"))}</a>
    ${shop[7] ? `<a class="chip" href="tel:${esc(shop[7])}">${esc(t("barbers.call"))}</a>` : ""}
  </div>
  <div class="rf" id="rf${index}" hidden>
    <select id="rs${index}" aria-label="Your rating">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${"★".repeat(n)}</option>`).join("")}</select>
    <input id="rt${index}" maxlength="140" placeholder="Your review (optional)">
    <button class="chip" data-sv="${index}">Save</button>
  </div>
</div>`;
    })
    .join("");
}

/** Draw the one-page shareable barber card. */
export function drawBarberCard({ cutName, specs, shapeLabel = "", beforeCanvas, afterCanvas, shopName = "", note = "" }) {
  const W = 1240;
  const H = 1754; // A4 portrait at 150dpi
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Header
  ctx.fillStyle = "#171717";
  ctx.fillRect(0, 0, W, 190);
  ctx.fillStyle = "#ffffff";
  ctx.font = "750 74px system-ui, -apple-system, sans-serif";
  ctx.fillText("Cutfit", 64, 108);
  ctx.font = "500 30px system-ui, sans-serif";
  ctx.fillStyle = "#d8c4b4";
  ctx.fillText(t("barbers.cardTitle"), 64, 156);

  // Cut name + face shape
  ctx.fillStyle = "#171717";
  ctx.font = "700 64px system-ui, sans-serif";
  ctx.fillText(String(cutName).slice(0, 30), 64, 300);
  if (shapeLabel) {
    ctx.font = "500 30px system-ui, sans-serif";
    ctx.fillStyle = "#6b6b6b";
    ctx.fillText(`${t("barbers.face")}: ${shapeLabel}`, 64, 348);
  }

  // Specs grid
  const rowH = 112;
  let y = 400;
  for (const [key, label] of SPEC_FIELDS) {
    ctx.fillStyle = y % 224 === 0 ? "#f7f7f5" : "#ffffff";
    ctx.fillRect(48, y - 60, W - 96, rowH - 8);
    ctx.fillStyle = "#8a8a8a";
    ctx.font = "600 22px system-ui, sans-serif";
    ctx.fillText(label, 72, y - 18);
    ctx.fillStyle = "#171717";
    ctx.font = "500 32px system-ui, sans-serif";
    ctx.fillText(String(specs[key] || "—").slice(0, 62), 72, y + 22);
    y += rowH;
  }

  // Upkeep
  ctx.fillStyle = "#171717";
  ctx.font = "600 30px system-ui, sans-serif";
  ctx.fillText(`${t("barbers.upkeep")}: ${String(specs.upkeep || "").slice(0, 54)}`, 72, y + 22);

  // Before / after
  const imgY = y + 70;
  const imgW = (W - 96 - 40) / 2;
  const imgH = Math.min(620, H - imgY - 200);
  const draw = (canvas, x, label) => {
    if (!canvas) {
      ctx.fillStyle = "#f2f2f0";
      ctx.fillRect(x, imgY, imgW, imgH);
      return;
    }
    const scale = Math.min(imgW / canvas.width, imgH / canvas.height);
    const w = canvas.width * scale;
    const h = canvas.height * scale;
    ctx.save();
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(x, imgY, imgW, imgH, 18);
    else ctx.rect(x, imgY, imgW, imgH);
    ctx.clip();
    ctx.fillStyle = "#f2f2f0";
    ctx.fillRect(x, imgY, imgW, imgH);
    ctx.drawImage(canvas, x + (imgW - w) / 2, imgY + (imgH - h) / 2, w, h);
    ctx.restore();
    ctx.fillStyle = "#6b6b6b";
    ctx.font = "600 24px system-ui, sans-serif";
    ctx.fillText(label, x, imgY + imgH + 40);
  };
  draw(beforeCanvas, 64, t("try.before"));
  draw(afterCanvas, 64 + imgW + 40, t("try.after"));

  // Footer
  ctx.fillStyle = "#9a9a9a";
  ctx.font = "400 22px system-ui, sans-serif";
  ctx.fillText(
    `${shopName ? shopName + " · " : ""}${new Date().toLocaleDateString()} · cutfit`,
    64,
    H - 56
  );
  if (note) ctx.fillText(String(note).slice(0, 110), 64, H - 24);
  return c;
}

export function downloadCanvas(canvas, filename = "cutfit-barber-card.png") {
  const a = document.createElement("a");
  a.download = filename;
  a.href = canvas.toDataURL("image/png");
  a.click();
}

/** PDF via the browser's print-to-PDF (no extra library, one page). */
export function printCard(canvas) {
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) return false;
  const url = canvas.toDataURL("image/png");
  win.document.write(
    `<!doctype html><html><head><title>Cutfit barber card</title><style>@page{size:A4;margin:0}body{margin:0}img{width:100%;display:block}</style></head><body><img src="${url}" alt="Cutfit barber card"></body></html>`
  );
  win.document.close();
  setTimeout(() => win.print(), 400);
  return true;
}

/** Text the user can paste into a chat with the barber. */
export function barberNote({ cutName, specs, shapeLabel, shopName }) {
  return [
    `Please give me a ${cutName} haircut.`,
    shapeLabel ? `Face shape: ${shapeLabel}.` : "",
    specsSentence(specs),
    `Maintenance: ${specs.upkeep}.`,
    shopName ? `Shop: ${shopName}.` : "",
    "Please adjust to my actual hair growth and head shape."
  ]
    .filter(Boolean)
    .join("\n");
}

export { money, specsSentence };

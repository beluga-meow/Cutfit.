# Manual QA checklist

Run `npm test` first (32 automated checks). Then walk this list on a phone at
360 px wide and once on desktop.

## Scan
- [ ] First “Take a photo” opens the consent dialog, not the camera.
- [ ] Declining shows the notice and leaves the tab usable.
- [ ] Allowing shows the live preview with an oval and a hint line.
- [ ] Cover the lens → “Too dark”. Move very close → “Move back”. Turn sideways → “Look straight”.
- [ ] Hold still for ~1 s → auto-capture, then the contour (no dots) appears.
- [ ] Upload a sideways photo → a clear “could not measure” message, no crash.
- [ ] Fine-tune reveals eight handles; dragging one updates the numbers.
- [ ] Analyze → confidence label + specs + at least 3 cuts.

## AI try-on
- [ ] Without a photo, Generate AI jumps to Scan with a message.
- [ ] Generate shows staged progress, then the before/after split.
- [ ] Dragging the slider moves the split; labels stay visible.
- [ ] Regenerate changes the seed value.
- [ ] Colour change only recolours hair; the face/background look identical.
- [ ] Kill the network mid-poll → friendly error, credit refunded (check `/api/credits`).
- [ ] Let the result TTL pass → the image URL returns 410 and the UI says it expired.

## 3D
- [ ] First open downloads Three.js only then (check the network panel).
- [ ] Drag rotates; Front/Side/Back/Top work; length/fade/colour change the hair.
- [ ] Snapshot downloads a PNG.
- [ ] With WebGL disabled (chrome://flags) the tab explains the fallback.

## Barbers and cards
- [ ] Search narrows the list; a shop with “Write a review” saves locally and survives reload.
- [ ] Barber card shows cut, specs, face shape, before/after; PNG downloads and print preview is one page.
- [ ] Share on a phone offers the image; on desktop it downloads instead.

## Language, privacy, PWA
- [ ] FIL switches nav, scan guidance and try-on labels; pesos still format.
- [ ] Footer → Privacy notice opens `privacy.html`; delete button clears `cf_*` keys.
- [ ] “Delete my photos” clears the photo and the preview.
- [ ] Offline: reload shows `offline.html`; cached tabs still open.
- [ ] Install prompt appears (Chrome, HTTPS) and the installed app opens standalone.

## Accessibility
- [ ] Tab through: every control has a visible focus ring.
- [ ] Bottom nav is reachable by keyboard; aria-pressed follows the active tab.
- [ ] Turn on “reduce motion”: no page transition, no wheel spin animation.
- [ ] Screen reader announces scan hint and try-on progress (aria-live).
- [ ] Zoom to 200%: nothing overlaps or clips horizontally.

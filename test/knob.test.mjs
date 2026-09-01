import { chromium } from 'playwright';

const results = [];
const check = (name, pass, extra = '') =>
  results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${extra ? '  → ' + extra : ''}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const BASE = process.env.CJ_TEST_URL ?? 'http://127.0.0.1:8765/';
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

check('no page errors on load', errors.length === 0, errors.join(' | '));

// --- upgrade + shadow DOM ---
const upgraded = await page.evaluate(() => {
  const k = document.querySelector('#examples cj-knob');
  return { defined: !!customElements.get('cj-knob'), hasShadow: !!k.shadowRoot, role: k.getAttribute('role') };
});
check('custom element defined', upgraded.defined);
check('shadow root attached', upgraded.hasShadow);
check('non-interactive knob gets role=meter', upgraded.role === 'meter', upgraded.role);

// --- geometry: dashoffset for a 78% full ring (arc=100) ---
const geo = await page.evaluate(() => {
  const k = document.querySelector('#examples cj-knob[value="78"]');
  const v = k.shadowRoot.querySelector('.value');
  return { dasharray: v.getAttribute('stroke-dasharray'), dashoffset: +v.getAttribute('stroke-dashoffset') };
});
check('full ring dasharray = "100 100"', geo.dasharray === '100 100', geo.dasharray);
check('78% → dashoffset 22', Math.abs(geo.dashoffset - 22) < 1e-9, String(geo.dashoffset));

// --- geometry: 270deg gauge at 64% ---
const gauge = await page.evaluate(() => {
  const k = document.querySelector('#examples cj-knob[sweep="270"][value="64"]');
  const v = k.shadowRoot.querySelector('.value');
  return {
    dasharray: v.getAttribute('stroke-dasharray'),
    dashoffset: +v.getAttribute('stroke-dashoffset'),
    start: getComputedStyle(k).getPropertyValue('--cj-start').trim(),
  };
});
check('270° gauge dasharray = "75 100"', gauge.dasharray === '75 100', gauge.dasharray);
check('270° @64% → dashoffset 27', Math.abs(gauge.dashoffset - 27) < 1e-9, String(gauge.dashoffset));
check('270° default start = 135deg', gauge.start === '135deg', gauge.start);

// --- overflow ring only past max ---
const of = await page.evaluate(() => {
  const under = document.querySelector('#examples cj-knob[value="78"]').shadowRoot.querySelector('.overflow-group');
  const over = document.querySelector('#examples cj-knob[value="145"]').shadowRoot.querySelector('.overflow-group');
  return {
    underHidden: under.hasAttribute('hidden'),
    overHidden: over.hasAttribute('hidden'),
    overOffset: +over.querySelector('.overflow').getAttribute('stroke-dashoffset'),
  };
});
check('overflow ring hidden below max', of.underHidden);
check('overflow ring shown above max', !of.overHidden);
check('value 145 → overflow dashoffset 55', Math.abs(of.overOffset - 55) < 1e-9, String(of.overOffset));

// --- reactive updates ---
const reactive = await page.evaluate(async () => {
  const k = document.querySelector('#examples cj-knob[value="78"]');
  k.value = 10;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const v = k.shadowRoot.querySelector('.value');
  return { offset: +v.getAttribute('stroke-dashoffset'), text: k.shadowRoot.querySelector('.num').textContent };
});
check('setting .value re-renders arc', Math.abs(reactive.offset - 90) < 1e-9, String(reactive.offset));
check('setting .value re-renders readout', reactive.text === '10', reactive.text);

// --- keyboard on the interactive knob ---
const vol = page.locator('#vol');
await vol.focus();
const before = await vol.evaluate((el) => el.value);
await page.keyboard.press('ArrowUp');
await page.keyboard.press('ArrowUp');
const afterUp = await vol.evaluate((el) => el.value);
check('ArrowUp increments by step', afterUp === before + 2, `${before} → ${afterUp}`);
await page.keyboard.press('PageDown');
const afterPg = await vol.evaluate((el) => el.value);
check('PageDown moves 10 steps', afterPg === afterUp - 10, `${afterUp} → ${afterPg}`);
await page.keyboard.press('End');
check('End clamps to max', (await vol.evaluate((el) => el.value)) === 100);
await page.keyboard.press('ArrowUp');
check('cannot exceed max', (await vol.evaluate((el) => el.value)) === 100);
await page.keyboard.press('Home');
check('Home clamps to min', (await vol.evaluate((el) => el.value)) === 0);

check('cj-change fired on keyboard', (await page.textContent('#vol-out')).includes('cj-change'));

// --- pointer drag: click the 3 o'clock edge of a full ring → 25% ---
// Mouse coordinates are viewport-relative, so the knob has to be on screen. The
// page is now several viewports tall, and without this the clicks land on empty
// space and the check fails intermittently.
await vol.scrollIntoViewIfNeeded();
const box = await vol.boundingBox();
await page.mouse.move(box.x + box.width - 6, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.up();
const at3 = await vol.evaluate((el) => el.value);
check('click at 3 o\'clock → 25', at3 === 25, String(at3));

await page.mouse.move(box.x + box.width / 2, box.y + box.height - 6);
await page.mouse.down();
await page.mouse.up();
const at6 = await vol.evaluate((el) => el.value);
check('click at 6 o\'clock → 50', at6 === 50, String(at6));

// --- disabled knob ignores pointer ---
const dis = page.locator('cj-knob[disabled]');
await dis.scrollIntoViewIfNeeded();
const dbox = await dis.boundingBox();
await page.mouse.click(dbox.x + dbox.width - 6, dbox.y + dbox.height / 2);
check('disabled knob ignores clicks', (await dis.evaluate((el) => el.value)) === 50);
check('disabled knob is not focusable', !(await dis.evaluate((el) => el.hasAttribute('tabindex'))));

// --- a11y ---
const a11y = await page.evaluate(() => {
  const k = document.getElementById('vol');
  return { role: k.getAttribute('role'), now: k.getAttribute('aria-valuenow'), max: k.getAttribute('aria-valuemax') };
});
check('interactive knob gets role=slider', a11y.role === 'slider', a11y.role);
check('aria-valuenow tracks value', a11y.now === '50', a11y.now);
check('aria-valuemax present', a11y.max === '100', a11y.max);

// --- the number must sit on the ring's centre whatever the unit or label is ---
// A unit rendered in normal flow ("%", "°C") would drag the number left by half its
// width, so no two knobs in a dashboard would line up. Measure it rather than trust it.
const centring = await page.evaluate(() => {
  let worst = 0, culprit = '';
  for (const k of document.querySelectorAll('cj-knob')) {
    const numEl = k.shadowRoot.querySelector('.num');
    if (!numEl.textContent) continue;
    const host = k.getBoundingClientRect();
    const n = numEl.getBoundingClientRect();
    const dx = Math.abs((n.left + n.width / 2) - (host.left + host.width / 2));
    if (dx > worst) { worst = dx; culprit = `${k.getAttribute('value')} ${k.getAttribute('unit') ?? '%'}`; }
  }
  return { worst: +worst.toFixed(2), culprit };
});
check('number is horizontally centred on the ring', centring.worst < 0.6,
  `worst ${centring.worst}px (${centring.culprit})`);

// widening the unit must not move the number
const unitShift = await page.evaluate(() => {
  const k = document.querySelector('#examples cj-knob'); // value was mutated by an earlier check
  const numEl = k.shadowRoot.querySelector('.num');
  const before = numEl.getBoundingClientRect().left;
  k.setAttribute('unit', ' kWh/day');
  const after = numEl.getBoundingClientRect().left;
  k.removeAttribute('unit');
  return +Math.abs(after - before).toFixed(2);
});
check('a wider unit does not shift the number', unitShift < 0.6, `${unitShift}px`);

// A label lifts the number so the lower half of the dial is free for the text, but it
// must lift it straight up — never sideways — and by a predictable fraction of the type.
const labelShift = await page.evaluate(() => {
  const k = document.querySelector('#examples cj-knob[value="145"]');
  const numEl = k.shadowRoot.querySelector('.num');
  const withLabel = numEl.getBoundingClientRect();
  k.removeAttribute('label');
  const without = numEl.getBoundingClientRect();
  k.setAttribute('label', 'Peak');
  const numSize = parseFloat(getComputedStyle(k.shadowRoot.querySelector('.readout')).fontSize);
  return {
    lift: +(without.top - withLabel.top).toFixed(2),
    sideways: +Math.abs(without.left - withLabel.left).toFixed(2),
    expected: +(numSize * 0.26).toFixed(2),
  };
});
check('a label lifts the number clear of the text', Math.abs(labelShift.lift - labelShift.expected) < 0.6,
  `lifted ${labelShift.lift}px, expected ${labelShift.expected}px`);
check('a label never shifts the number sideways', labelShift.sideways < 0.6, `${labelShift.sideways}px`);

// the label must stay inside the ring rather than sitting on it
const labelInside = await page.evaluate(() => {
  let worst = 0;
  for (const k of document.querySelectorAll('cj-knob[label]')) {
    const lab = k.shadowRoot.querySelector('.label');
    if (lab.hasAttribute('hidden')) continue;
    const host = k.getBoundingClientRect();
    const l = lab.getBoundingClientRect();
    const cx = host.left + host.width / 2, cy = host.top + host.height / 2;
    // furthest corner of the label from the ring centre
    for (const [x, y] of [[l.left, l.top], [l.right, l.top], [l.left, l.bottom], [l.right, l.bottom]]) {
      worst = Math.max(worst, Math.hypot(x - cx, y - cy) / (host.width / 2));
    }
  }
  return +worst.toFixed(3);
});
// inner edge of the track sits at (42 - thickness/2)/50 = 0.76 of the radius
check('labels stay inside the ring', labelInside < 0.76, `reaches ${(labelInside * 100).toFixed(0)}% of the radius`);

// type stays legible when the knob gets small
const smallType = await page.evaluate(() => {
  const k = document.querySelector('#examples cj-knob[style*="56px"]');
  return parseFloat(getComputedStyle(k.shadowRoot.querySelector('.readout')).fontSize);
});
check('readout keeps a legible floor at 56px', smallType >= 13, `${smallType}px`);

// --- zones, ticks and segments ---
const extras = await page.evaluate(() => {
  const k = document.querySelector('#examples cj-knob[zones][ticks]');
  const r = k.shadowRoot;
  const zones = [...r.querySelectorAll('.zones circle')];
  const seg = document.querySelector('#examples cj-knob[segments]').shadowRoot;
  return {
    zoneCount: zones.length,
    // "0-60" of a 270° sweep is 60% of arc 75 = 45 units, starting at 0
    firstZoneDash: zones[0]?.getAttribute('stroke-dasharray'),
    firstZoneOffset: zones[0]?.getAttribute('stroke-dashoffset'),
    // ticks="12" on a partial sweep draws 13 marks so both ends are capped
    tickCount: r.querySelectorAll('.ticks line').length,
    majorCount: r.querySelectorAll('.ticks line.major').length,
    segCount: seg.querySelectorAll('.segments circle').length,
    valueHidden: getComputedStyle(seg.querySelector('.value')).display === 'none',
  };
});
check('zones render one arc each', extras.zoneCount === 3, String(extras.zoneCount));
check('a zone spans the right slice of the arc', extras.firstZoneDash === '45 100', extras.firstZoneDash);
check('a zone starts at the right offset', +extras.firstZoneOffset === 0, extras.firstZoneOffset);
check('ticks=12 on a partial arc draws 13', extras.tickCount === 13, String(extras.tickCount));
check('tick-major=3 marks every third', extras.majorCount === 5, String(extras.majorCount));
check('segments render one arc each', extras.segCount === 4, String(extras.segCount));
check('segments replace the value ring', extras.valueHidden);

// --- the component must not clobber an author's own inline --cj-value ---
const inlineColor = await page.evaluate(() => {
  const k = document.createElement('cj-knob');
  k.setAttribute('value', '50');
  k.style.setProperty('--cj-value', 'rgb(1, 2, 3)');
  document.body.append(k);
  const stroke = getComputedStyle(k.shadowRoot.querySelector('.value')).stroke;
  k.remove();
  return stroke;
});
check('an inline --cj-value survives rendering', inlineColor === 'rgb(1, 2, 3)', inlineColor);

// --- with readout="none" there is no number, so the label must take the centre ---
// It used to orbit an invisible number and drift onto the ring instead.
const noNumber = await page.evaluate(() => {
  const mk = (attrs, icon) => {
    const k = document.createElement('cj-knob');
    for (const [n, v] of Object.entries(attrs)) k.setAttribute(n, v);
    if (icon) { const s = document.createElement('span'); s.slot = 'icon'; s.textContent = icon; k.append(s); }
    document.body.append(k);
    return k;
  };
  const off = (k, sel) => {
    const h = k.getBoundingClientRect(), e = k.shadowRoot.querySelector(sel).getBoundingClientRect();
    return +((e.top + e.height / 2) - (h.top + h.height / 2)).toFixed(1);
  };
  const a = mk({ readout: 'none', label: 'web db job', value: '50' });
  const b = mk({ readout: 'none', value: '50' }, '🧭');
  const c = mk({ readout: 'none', label: 'disk', value: '50' }, '💾');
  const r = { labelAlone: off(a, '.label'), iconAlone: off(b, '.icon'),
              iconWithLabel: off(c, '.icon'), labelWithIcon: off(c, '.label') };
  [a, b, c].forEach((k) => k.remove());
  return r;
});
check('label centres when there is no number', Math.abs(noNumber.labelAlone) < 1,
  `${noNumber.labelAlone}px off centre`);
check('icon centres when it is alone', Math.abs(noNumber.iconAlone) < 1,
  `${noNumber.iconAlone}px off centre`);
check('icon sits above a label when both are present', noNumber.iconWithLabel < -2,
  `${noNumber.iconWithLabel}px`);
check('label sits below the icon', noNumber.labelWithIcon > 2, `${noNumber.labelWithIcon}px`);

// --- needle and bearing labels ---
const compass = await page.evaluate(() => {
  const k = document.querySelector('#playground cj-knob[needle]');
  const r = k.shadowRoot;
  return {
    hidden: r.querySelector('.needle').hasAttribute('hidden'),
    marks: r.querySelectorAll('.marks text').length,
    major: r.querySelectorAll('.marks text.major').length,
    first: r.querySelector('.marks text')?.textContent,
    // .marks lives outside .rings so the captions stay upright
    outsideRings: !r.querySelector('.rings .marks'),
  };
});
check('needle renders when the attribute is set', !compass.hidden);
check('labels="N,NE,…" draws one caption each', compass.marks === 8, String(compass.marks));
check('cardinal captions are marked major', compass.major === 4, String(compass.major));
check('first caption is N', compass.first === 'N', compass.first);
check('captions sit outside the rotating group', compass.outsideRings);

// A closed dial must take the short way round: 350° -> 10° is +20°, not -340°.
const shortWay = await page.evaluate(async () => {
  const k = document.querySelector('#playground cj-knob[needle]');
  const angle = () => parseFloat(k.style.getPropertyValue('--cj-needle-angle'));
  k.value = 350; const a = angle();
  k.value = 10;  const b = angle();
  return +(b - a).toFixed(2);
});
check('needle unwraps across the 0° seam', Math.abs(shortWay - 20) < 0.5, `${shortWay}deg`);

// --- radar ---
const radar = await page.evaluate(async () => {
  const el = document.createElement('cj-radar');
  el.setAttribute('rings', '5');
  el.setAttribute('spokes', '12');
  el.setAttribute('labels', 'N,E,S,W');
  el.setAttribute('blips', '0:1, 90:0.5');
  document.body.append(el);
  await new Promise((r) => requestAnimationFrame(r));
  const r = el.shadowRoot;
  const first = r.querySelector('.blips .dot');
  const out = {
    defined: !!customElements.get('cj-radar'),
    rings: r.querySelectorAll('.grid circle').length,
    spokes: r.querySelectorAll('.grid line').length,
    marks: r.querySelectorAll('.marks text').length,
    blips: r.querySelectorAll('.blips .blip').length,
    // bearing 0 at range 1 is due north: x = 50, y = 50 - 46
    northX: +first.getAttribute('cx'),
    northY: +first.getAttribute('cy'),
    apiLen: el.blips.length,
  };
  el.scatter(7); out.afterScatter = el.blips.length;
  el.clearBlips(); out.afterClear = el.blips.length;
  el.remove();
  return out;
});
check('cj-radar is defined', radar.defined);
check('rings="5" draws 5 range rings', radar.rings === 5, String(radar.rings));
check('spokes="12" draws 12 spokes', radar.spokes === 12, String(radar.spokes));
check('radar labels render', radar.marks === 4, String(radar.marks));
check('blips attribute parses', radar.blips === 2 && radar.apiLen === 2, String(radar.blips));
check('bearing 0 range 1 plots due north', radar.northX === 50 && radar.northY === 4,
  `${radar.northX},${radar.northY}`);
check('scatter(7) sets seven contacts', radar.afterScatter === 7, String(radar.afterScatter));
check('clearBlips empties the scope', radar.afterClear === 0, String(radar.afterClear));

// --- a second pointer, and the rotating-card dial ---
const twoUp = await page.evaluate(async () => {
  const k = document.querySelector('#examples cj-knob[value-2]');
  const r = k.shadowRoot;
  const deg = (p) => parseFloat(k.style.getPropertyValue(p));
  return {
    shown: !r.querySelector('.needle-2').hasAttribute('hidden'),
    // on a 0-100 full dial, value 20 is 72deg and value-2 70 is 252deg. Compare
    // each pointer on its own: at exactly 180deg apart the signed gap is ambiguous,
    // and the unwrapping legitimately reports -108deg rather than +252deg.
    a1: ((deg('--cj-needle-angle') % 360) + 360) % 360,
    a2: ((deg('--cj-needle-2-angle') % 360) + 360) % 360,
  };
});
check('value-2 shows a second pointer', twoUp.shown);
check('the first pointer sits on value', Math.abs(twoUp.a1 - 72) < 0.5, `${twoUp.a1}deg`);
check('the second pointer sits on value-2', Math.abs(twoUp.a2 - 252) < 0.5, `${twoUp.a2}deg`);

const card = await page.evaluate(async () => {
  const k = document.querySelector('#playground cj-knob[rotating]');
  k.value = 90;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return {
    lubber: !k.shadowRoot.querySelector('.lubber').hasAttribute('hidden'),
    angle: parseFloat(k.style.getPropertyValue('--cj-card-angle')),
  };
});
check('rotating shows the fixed index', card.lubber);
check('the card turns opposite the heading', Math.abs(card.angle + 90) < 0.5, `${card.angle}deg`);

// --- attitude indicator ---
const att = await page.evaluate(async () => {
  const h = document.createElement('cj-horizon');
  h.style.setProperty('--cjh-duration', '0ms');
  document.body.append(h);
  await new Promise((r) => requestAnimationFrame(r));

  const svg = h.shadowRoot.querySelector('svg');
  const line = h.shadowRoot.querySelector('.horizon');
  const endsOf = () => {
    const m = line.getScreenCTM();
    const at = (x) => { const p = svg.createSVGPoint(); p.x = x; p.y = 50; return p.matrixTransform(m); };
    return { l: at(20).y, r: at(80).y };
  };

  h.pitch = 0; h.roll = 0;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const level = endsOf();
  const levelMid = (level.l + level.r) / 2;

  h.roll = 30;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const banked = endsOf();

  h.roll = 0; h.pitch = 20;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const climbing = (endsOf().l + endsOf().r) / 2;

  const out = {
    defined: !!customElements.get('cj-horizon'),
    levelFlat: Math.abs(level.l - level.r) < 0.5,
    // a right bank lifts the horizon's right-hand end
    rightUp: banked.r < banked.l,
    // nose up pushes the horizon down the face
    noseUp: climbing > levelMid,
    ladder: h.shadowRoot.querySelectorAll('.ladder line').length,
    scale: h.shadowRoot.querySelectorAll('.scale line').length,
    attitude: (h.pitch = 10, h.roll = -20, h.attitude),
  };
  h.remove();
  return out;
});
check('cj-horizon is defined', att.defined);
check('wings level draws a flat horizon', att.levelFlat);
check('a right bank lifts the horizon on the right', att.rightUp);
check('nose up drops the horizon down the face', att.noseUp);
check('the pitch ladder has a rung either side', att.ladder === 6, String(att.ladder));
check('the bank scale is drawn', att.scale === 11, String(att.scale));
check('attitude reads in words', att.attitude === 'climbing, left bank', att.attitude);

// --- radar sweep trail ---
const trail = await page.evaluate(() => {
  const r = document.querySelector('#playground cj-radar');
  const s = getComputedStyle(r.shadowRoot.querySelector('.beam'));
  const line = r.shadowRoot.querySelector('.beam-line');
  return {
    tail: getComputedStyle(r).getPropertyValue('--cjr-tail').trim(),
    hasGradient: s.backgroundImage.includes('conic-gradient'),
    lineVisible: getComputedStyle(line).display !== 'none',
    blipParts: r.shadowRoot.querySelectorAll('.blip .halo').length,
  };
});
check('the sweep has a trailing tail', trail.tail === '130deg', trail.tail);
check('the tail is one conic gradient', trail.hasGradient);
check('the leading edge line is drawn while sweeping', trail.lineVisible);
check('each contact carries a halo for the ping', trail.blipParts > 0, String(trail.blipParts));

// --- liquid fill and the centre-mounted hand ---
const fluid = await page.evaluate(async () => {
  const k = document.createElement('cj-knob');
  k.setAttribute('liquid', '');
  k.setAttribute('value', '0');
  k.style.setProperty('--cj-duration', '0ms');
  document.body.append(k);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const liquid = k.shadowRoot.querySelector('.liquid');
  const path = k.shadowRoot.querySelector('.wave-a').getAttribute('d');
  // the wave has to stay wider than the vessel at every drift offset, or sliding
  // it left drags its right-hand edge into the circle and the fluid "empties"
  const xs = [...path.matchAll(/M?(-?\d+),/g)].map((m) => +m[1]);
  const empty = liquid.style.getPropertyValue('--cj-level');
  k.setAttribute('value', '100');
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const full = liquid.style.getPropertyValue('--cj-level');
  const shown = !liquid.hasAttribute('hidden');
  k.remove();
  return { shown, empty: parseFloat(empty), full: parseFloat(full),
           minX: Math.min(...xs), maxX: Math.max(...xs) };
});
check('liquid renders when the attribute is set', fluid.shown);
check('an empty vessel puts the surface below the bottom', fluid.empty === 33, `${fluid.empty}px`);
check('a full vessel puts the surface at the top', fluid.full === -33, `${fluid.full}px`);
check('the wave spans wider than the vessel', fluid.minX <= -34 && fluid.maxX >= 134,
  `${fluid.minX}..${fluid.maxX}`);

const hand = await page.evaluate(async () => {
  const k = document.createElement('cj-knob');
  k.setAttribute('needle', 'hand');
  k.setAttribute('value', '25');
  document.body.append(k);
  await new Promise((r) => requestAnimationFrame(r));
  const r = k.shadowRoot;
  const out = {
    handShown: getComputedStyle(r.querySelector('.needle .hand')).display !== 'none',
    markHidden: getComputedStyle(r.querySelector('.needle .mark')).display === 'none',
    hub: !r.querySelector('.hub').hasAttribute('hidden'),
  };
  k.setAttribute('needle', '');
  out.markBack = getComputedStyle(r.querySelector('.needle .mark')).display !== 'none';
  k.remove();
  return out;
});
check('needle="hand" draws the centre hand', hand.handShown);
check('needle="hand" hides the rim marker', hand.markHidden);
check('the hand gets a hub to pivot on', hand.hub);
check('plain needle goes back to the rim marker', hand.markBack);

// --- reduced motion parks the sweep, it does not delete it ---
// Hiding the beam outright made the scope look broken on any machine with
// animation effects turned off, which is a very common default.
const reduced = await browser.newContext({ reducedMotion: 'reduce' });
const rmPage = await reduced.newPage();
await rmPage.goto(BASE, { waitUntil: 'networkidle' });
await rmPage.waitForTimeout(700);
const parked = await rmPage.evaluate(async () => {
  const el = document.querySelector('#playground cj-radar');
  const r = el.shadowRoot;
  const first = el.style.getPropertyValue('--cjr-beam-angle');
  await new Promise((res) => setTimeout(res, 400));
  return {
    beam: getComputedStyle(r.querySelector('.beam')).display,
    line: getComputedStyle(r.querySelector('.beam-line')).display,
    first, second: el.style.getPropertyValue('--cjr-beam-angle'),
    noteShown: !document.getElementById('motion-note').hidden,
  };
});
await reduced.close();
check('reduced motion keeps the beam visible', parked.beam !== 'none', parked.beam);
check('reduced motion keeps the leading line visible', parked.line !== 'none', parked.line);
check('reduced motion stops the sweep turning', parked.first === parked.second,
  `${parked.first} -> ${parked.second}`);
check('the page explains why the sweep is still', parked.noteShown);

// --- gradient arc ---
const grad = await page.evaluate(async () => {
  const k = document.querySelector('#examples cj-knob[gradient]');
  const r = k.shadowRoot;
  const steps = [...r.querySelectorAll('.gradient circle')];
  const mask = r.querySelector('.value-mask');
  const value = r.querySelector('.value');
  const before = steps.length;
  // the fan is geometry, not state: changing the value must not rebuild it
  k.value = 40;
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  return {
    steps: before,
    rebuilt: r.querySelectorAll('.gradient circle').length !== before,
    firstColor: steps[0]?.getAttribute('stroke'),
    lastColor: steps.at(-1)?.getAttribute('stroke'),
    // the mask has to track the value ring exactly, or the reveal drifts off it
    maskOffset: mask.getAttribute('stroke-dashoffset'),
    valueOffset: value.getAttribute('stroke-dashoffset'),
    plainRingHidden: getComputedStyle(value).display === 'none',
  };
});
check('gradient lays down a fan of colour steps', grad.steps === 48, String(grad.steps));
check('the fan starts on the first stop', grad.firstColor === '#22c55e', grad.firstColor);
check('the fan ends on the last stop', grad.lastColor === '#ef4444', grad.lastColor);
check('changing the value does not rebuild the fan', !grad.rebuilt);
check('the mask follows the value ring exactly', grad.maskOffset === grad.valueOffset,
  `${grad.maskOffset} vs ${grad.valueOffset}`);
check('the plain ring steps aside for the gradient', grad.plainRingHidden);

// --- cj-level ---
const level = await page.evaluate(async () => {
  const el = document.createElement('cj-level');
  el.setAttribute('min', '0');
  el.setAttribute('max', '100');
  el.setAttribute('ticks', '10');
  el.setAttribute('tick-major', '5');
  el.setAttribute('zones', '0-20:#ef4444');
  el.setAttribute('value', '0');
  el.style.setProperty('--cjl-duration', '0ms');
  document.body.append(el);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const r = el.shadowRoot;
  const lvl = () => parseFloat(r.querySelector('.body').style.getPropertyValue('--cjl-level'));
  const empty = lvl();
  el.value = 100;
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  const full = lvl();

  // the bulb outline has to be one closed path, not a column plus a loose circle
  el.setAttribute('bulb', '');
  await new Promise((res) => requestAnimationFrame(res));
  const d = r.querySelector('.tube').getAttribute('d');

  const out = {
    defined: !!customElements.get('cj-level'),
    empty, full, risesUp: full < empty,
    ticks: r.querySelectorAll('.ticks line').length,
    labels: r.querySelectorAll('.ticks text').length,
    zones: r.querySelectorAll('.zone').length,
    subpaths: (d.match(/M/g) || []).length,
    ratio: el.ratio,
  };
  el.remove();
  return out;
});
check('cj-level is defined', level.defined);
check('an empty column sits at the bottom', level.empty > level.full, `${level.empty} -> ${level.full}`);
check('filling raises the surface', level.risesUp);
check('ticks=10 draws 11 marks', level.ticks === 11, String(level.ticks));
check('tick-major=5 labels every fifth', level.labels === 3, String(level.labels));
check('zones render on the column', level.zones === 1, String(level.zones));
check('the bulb is one closed outline', level.subpaths === 1, `${level.subpaths} subpaths`);
check('ratio reports the fill', level.ratio === 1, String(level.ratio));

// --- the sweep winds up and coasts down instead of blinking on and off ---
const spin = await page.evaluate(async () => {
  const el = document.querySelector('#playground cj-radar');
  const read = () => ({
    o: +el.style.getPropertyValue('--cjr-beam-opacity'),
    a: parseFloat(el.style.getPropertyValue('--cjr-beam-angle')),
  });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  el.period = 4;
  await wait(700);
  const running = read();

  el.period = 0;
  const trail = [];
  for (let i = 0; i < 7; i++) { await wait(150); trail.push(read()); }

  el.period = 4;
  await wait(600);
  const restarted = read();
  return { running, trail, restarted };
});
// mid-range opacities are the whole point: a display toggle can only ever be 0 or 1
check('the sweep fades out through mid values',
  spin.trail.some((s) => s.o > 0.02 && s.o < 0.9),
  spin.trail.map((s) => s.o.toFixed(2)).join(' '));
check('the sweep settles at zero', spin.trail.at(-1).o < 0.05, String(spin.trail.at(-1).o));
// each sample should advance less than the one before it — that is the coast
const steps = spin.trail.slice(1).map((s, i) => s.a - spin.trail[i].a).filter((d) => d > 0);
check('the rotation decelerates rather than stopping dead',
  steps.length > 2 && steps.at(-1) < steps[0], steps.map((d) => d.toFixed(1)).join(' '));
check('starting again winds it back up', spin.restarted.o > 0.5, String(spin.restarted.o));

// --- rendering must not do more work than the change asked for ---
const thrift = await page.evaluate(async () => {
  const wait = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const out = {};

  // A value change moves a surface. It must not rebuild the scale — a panel
  // driving this from requestAnimationFrame would do that sixty times a second.
  const lv = document.createElement('cj-level');
  lv.setAttribute('ticks', '10');
  lv.setAttribute('tick-major', '5');
  lv.setAttribute('zones', '0-20:#ef4444');
  lv.setAttribute('value', '10');
  document.body.append(lv);
  await wait();
  const tick = lv.shadowRoot.querySelector('.ticks line');
  const zone = lv.shadowRoot.querySelector('.zone');
  lv.value = 50;
  await wait();
  out.scaleKept = lv.shadowRoot.querySelector('.ticks line') === tick;
  out.zoneKept = lv.shadowRoot.querySelector('.zone') === zone;
  out.levelMoved = parseFloat(lv.shadowRoot.querySelector('.body').style.getPropertyValue('--cjl-level')) < 180;
  // but a change that *does* affect the scale still rebuilds it
  lv.setAttribute('ticks', '4');
  await wait();
  out.scaleRebuilds = lv.shadowRoot.querySelectorAll('.ticks line').length === 5;
  lv.remove();

  // Contacts put on the scope by script must survive an unrelated attribute
  // change; re-reading the blips attribute every time threw them away.
  const rd = document.createElement('cj-radar');
  rd.setAttribute('blips', '10:0.5');
  rd.setAttribute('period', '4');
  document.body.append(rd);
  await wait();
  out.fromMarkup = rd.blips.length;
  rd.addBlip({ bearing: 200, range: 0.8 });
  rd.setAttribute('period', '2');
  await wait();
  out.afterRetune = rd.blips.length;
  // changing the attribute itself still replaces them
  rd.setAttribute('blips', '5:0.2, 95:0.4, 300:0.9');
  await wait();
  out.afterAttrChange = rd.blips.length;
  rd.remove();
  return out;
});
check('a value change keeps the tick marks', thrift.scaleKept);
check('a value change keeps the zone bands', thrift.zoneKept);
check('a value change still moves the surface', thrift.levelMoved);
check('changing ticks does rebuild the scale', thrift.scaleRebuilds);
check('the blips attribute is read on connect', thrift.fromMarkup === 1, String(thrift.fromMarkup));
check('scripted contacts survive an unrelated attribute change',
  thrift.afterRetune === 2, String(thrift.afterRetune));
check('changing the blips attribute still replaces them',
  thrift.afterAttrChange === 3, String(thrift.afterAttrChange));

// --- re-rendering an unchanged dial must touch nothing ---
// A panel driving a knob from requestAnimationFrame re-renders it sixty times a
// second. Anything rewritten unconditionally there is pure garbage: assigning
// textContent replaces the node even when the string is identical, which alone
// accounted for most of the DOM churn on the busiest lab panel.
const idle = await page.evaluate(async () => {
  const wait = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const k = document.createElement('cj-knob');
  k.setAttribute('ticks', '36');
  k.setAttribute('tick-major', '9');
  k.setAttribute('labels', 'N,E,S,W');
  k.setAttribute('zones', '0-60:#22c55e');
  k.setAttribute('label', 'heading');
  k.setAttribute('value', '40');
  document.body.append(k);
  await wait();

  let added = 0;
  const obs = new MutationObserver((ms) => { for (const m of ms) added += m.addedNodes.length; });
  obs.observe(k.shadowRoot, { childList: true, subtree: true });

  // ten renders that change nothing anyone can see
  for (let i = 0; i < 10; i++) { k.setAttribute('value', '40'); await wait(); }
  const idleChurn = added;

  added = 0;
  k.setAttribute('value', '41');
  await wait();
  const realChurn = added;

  obs.disconnect();
  k.remove();
  return { idleChurn, realChurn };
});
check('re-rendering the same value creates no nodes', idle.idleChurn === 0, `${idle.idleChurn} nodes`);
check('a real value change still updates the readout', idle.realChurn > 0, `${idle.realChurn} nodes`);

// --- cj-rings ---
const rings = await page.evaluate(async () => {
  const wait = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const box = 200, thickness = 0.04, gap = 0.06;

  const el = document.createElement('cj-rings');
  el.setAttribute('thickness', String(thickness));
  el.setAttribute('gap', String(gap));
  el.style.setProperty('--cjs-size', `${box}px`);
  for (let i = 0; i < 3; i++) {
    const k = document.createElement('cj-knob');
    k.setAttribute('readout', 'none');
    k.setAttribute('value', '50');
    el.append(k);
  }
  document.body.append(el);
  await wait();

  const read = () => el.rings.map((k) => ({
    size: parseFloat(k.style.getPropertyValue('--cj-size')),
    t: parseFloat(k.style.getPropertyValue('--cj-thickness')),
  }));
  const laid = read();
  // a knob's ring sits at 42% of its own box, so that is where each one lands
  const centres = laid.map((r) => r.size * 0.42);
  // --cj-thickness is in viewBox units, so equal pixel weight means different numbers
  const strokes = laid.map((r) => r.size * r.t / 100);

  // one more ring than the box can hold must be dropped, not drawn inside out
  const extra = document.createElement('cj-knob');
  extra.setAttribute('readout', 'none');
  for (let i = 0; i < 6; i++) el.append(extra.cloneNode(true));
  await wait();
  const clipped = [...el.querySelectorAll('cj-knob[data-cjs-clipped]')].length;

  const out = {
    outerFillsBox: Math.abs(laid[0].size - box) < 0.5,
    evenSteps: Math.abs((centres[0] - centres[1]) - (centres[1] - centres[2])) < 0.01,
    stepIsStrokePlusGap: Math.abs((centres[0] - centres[1]) - box * (thickness + gap)) < 0.01,
    equalStrokes: Math.max(...strokes) - Math.min(...strokes) < 0.01,
    strokePx: strokes[0],
    clipped,
    ringsAreKnobs: el.rings.every((k) => k.tagName === 'CJ-KNOB'),
  };
  el.remove();
  return out;
});
check('the outermost ring fills the box', rings.outerFillsBox);
check('the rings are evenly spaced', rings.evenSteps);
check('the step is one stroke plus one gap', rings.stepIsStrokePlusGap);
check('every ring gets the same pixel stroke', rings.equalStrokes, `${rings.strokePx.toFixed(2)}px`);
check('rings that do not fit are dropped', rings.clipped > 0, `${rings.clipped} clipped`);
check('the rings stay ordinary knobs', rings.ringsAreKnobs);

// --- ballistics and peak hold ---
const vu = await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const k = document.createElement('cj-knob');
  k.setAttribute('ballistics', '.02 .5');
  k.setAttribute('peak-hold', '0.5');
  k.setAttribute('peak-fall', '40');
  k.setAttribute('value', '0');
  document.body.append(k);
  await wait(120);

  const out = { seeded: k.shown };
  // A needle snaps up and sags back. Same size of step, same elapsed time,
  // very different distance covered — that asymmetry IS the ballistics.
  k.value = 90;
  await wait(90);
  out.rose = +k.shown.toFixed(1);
  out.peakTookIt = +k.peak.toFixed(1);

  k.value = 0;
  await wait(90);
  out.fellTo = +k.shown.toFixed(1);
  await wait(600);
  out.laterFellTo = +k.shown.toFixed(1);
  out.peakHeld = +k.peak.toFixed(1);
  await wait(1500);
  out.peakDecayed = +k.peak.toFixed(1);

  // and it must stop: a settled meter should not still be animating
  await wait(600);
  const settled = k.shown;
  let churn = 0;
  const obs = new MutationObserver((ms) => { for (const m of ms) churn += m.addedNodes.length; });
  obs.observe(k.shadowRoot, { childList: true, subtree: true });
  await wait(400);
  obs.disconnect();
  out.settledChurn = churn;
  out.settledAt = +settled.toFixed(2);

  k.remove();
  return out;
});
check('the reading starts at the value, not at zero', vu.seeded === 0, String(vu.seeded));
check('the needle rises fast', vu.rose > 80, `${vu.rose} of 90 in 90ms`);
check('the peak takes a new high at once', Math.abs(vu.peakTookIt - vu.rose) < 0.2);
// the asymmetry: it covered >80 rising, but <30 falling, in the same 90ms
check('the needle falls slower than it rose', 90 - vu.fellTo < vu.rose,
  `rose ${vu.rose}, fell ${(90 - vu.fellTo).toFixed(1)} in the same time`);
check('it keeps falling', vu.laterFellTo < vu.fellTo, `${vu.fellTo} -> ${vu.laterFellTo}`);
check('the peak stays above the reading during the hold', vu.peakHeld > vu.laterFellTo,
  `peak ${vu.peakHeld} vs reading ${vu.laterFellTo}`);
check('the peak decays once the hold expires', vu.peakDecayed < vu.peakHeld,
  `${vu.peakHeld} -> ${vu.peakDecayed}`);
check('a settled meter stops animating', vu.settledChurn === 0, `${vu.settledChurn} nodes`);

const noBallistics = await page.evaluate(async () => {
  const k = document.createElement('cj-knob');
  k.setAttribute('value', '10');
  document.body.append(k);
  await new Promise((r) => requestAnimationFrame(r));
  k.value = 90;
  const immediate = k.shown;
  k.remove();
  return immediate;
});
check('without ballistics the reading is the value', noBallistics === 90, String(noBallistics));

check('still no page errors at end', errors.length === 0, errors.join(' | '));

await browser.close();

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);

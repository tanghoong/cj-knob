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

check('still no page errors at end', errors.length === 0, errors.join(' | '));

await browser.close();

console.log(results.join('\n'));
const failed = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);

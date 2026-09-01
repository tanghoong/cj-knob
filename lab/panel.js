// ---------------------------------------------------------------
// A tiny declarative wrapper used by most of the lab dashboards.
//
// Every panel is the same shape: a title, a status strip, some rows
// of instruments, and one tick() that drives them. Writing that out
// by hand twenty times would bury the interesting part — the actual
// simulation — under identical markup, so it lives here instead.
// ---------------------------------------------------------------
import '../src/cj-knob.js';

const SVG_ATTRS = [
  'min', 'max', 'value', 'sweep', 'start', 'benchmark', 'readout', 'unit',
  'decimals', 'label', 'color', 'zones', 'segments', 'ticks', 'tick-major',
  'interactive', 'step', 'animate-in',
  'needle', 'labels', 'label-radius', 'value-2', 'rotating', 'liquid',
];

const make = (tag, cls) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
};

/** Sine drift — the same signal shape every panel uses so needles move like instruments. */
export const wave = (t, period, amp, phase = 0) => Math.sin(t / period + phase) * amp;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const clamp01 = (v) => clamp(v, 0, 1);
/** Smoothstep, for scripted sequences that should ease rather than ramp linearly. */
export const smooth = (x) => x * x * (3 - 2 * x);

/** Build a `segments` string whose parts always sum to `total`. */
export const mix = (parts, total = 100) => {
  const sum = parts.reduce((a, p) => a + Math.max(0, p[0]), 0) || 1;
  return parts.map(([v, c]) => `${(Math.max(0, v) / sum * total).toFixed(2)}:${c}`).join(', ');
};

export function buildPanel(spec) {
  document.title = `${spec.title} — cj-knob lab`;

  const h1 = make('h1');
  h1.textContent = spec.title;
  document.body.append(h1);

  // ---- status strip -----------------------------------------------------
  const readouts = {};
  if (spec.status?.length) {
    const strip = make('div', 'strip');
    for (const s of spec.status) {
      const span = make('span');
      if (s.lead) span.className = 'lead';
      if (s.flag) span.className = 'flag';
      if (s.label) {
        const t = make('span', 't');
        t.textContent = s.label + ' ';
        span.append(t);
      }
      const b = document.createElement(s.lead || s.flag ? 'span' : 'b');
      b.textContent = s.value ?? '—';
      span.append(b);
      readouts[s.id] = b;
      strip.append(span);
    }
    document.body.append(strip);
  }

  // ---- instrument rows --------------------------------------------------
  const knobs = {};
  for (const row of spec.rows ?? []) {
    const r = make('div', `row ${row.size ?? 'md'}`);
    if (row.flex) r.style.flex = row.flex;
    if (row.min) r.style.gridTemplateColumns = `repeat(auto-fit, minmax(${row.min}, 1fr))`;

    for (const item of row.items ?? []) {
      const cell = make('div', 'cell');
      if (item.cellStyle) cell.style.cssText = item.cellStyle;

      const knob = document.createElement('cj-knob');
      for (const a of SVG_ATTRS) {
        const key = a.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        if (item[key] !== undefined && item[key] !== null) knob.setAttribute(a, item[key]);
      }
      if (item.style) knob.style.cssText = item.style;
      if (item.knobClass) knob.className = item.knobClass;
      if (item.icon) {
        const s = make('span');
        s.slot = 'icon';
        s.textContent = item.icon;
        knob.append(s);
      }
      cell.append(knob);

      if (item.cap) {
        const cap = make('div', 'cap');
        cap.textContent = item.cap;
        cell.append(cap);
      }
      if (item.legend) {
        const lg = make('div', 'legend');
        for (const [text, color] of item.legend) {
          const s = make('span');
          const i = make('i');
          i.style.background = color;
          s.append(i, document.createTextNode(text));
          lg.append(s);
        }
        cell.append(lg);
      }

      r.append(cell);
      if (item.id) knobs[item.id] = knob;
    }
    document.body.append(r);
  }

  // ---- the simulation ---------------------------------------------------
  const set = (id, v, decimals = 0) => {
    const k = knobs[id];
    if (k) k.setAttribute('value', typeof v === 'number' ? v.toFixed(decimals) : v);
  };
  set.seg = (id, parts, total) => knobs[id]?.setAttribute('segments', mix(parts, total));
  set.attr = (id, name, v) => knobs[id]?.setAttribute(name, v);
  set.text = (id, v) => { if (readouts[id]) readouts[id].textContent = v; };
  set.knob = (id) => knobs[id];

  if (spec.tick) {
    const t0 = performance.now();
    const every = spec.interval ?? 0;
    let last = -1e9;
    const frame = (now) => {
      if (now - last >= every) {
        last = now;
        spec.tick((now - t0) / 1000, set);
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  return { knobs, readouts, set };
}

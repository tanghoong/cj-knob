// -------------------------------------------------
// cj-trace — a waveform that writes itself across the dial
// https://github.com/tanghoong/cj-knob
//
// <cj-trace beat="72" label="HR" grid></cj-trace>
// <cj-trace shape="ring" beat="88" sweep="360"></cj-trace>
// <cj-trace points="12,40,38,90,20,55" mode="scroll"></cj-trace>
//
// Everything else in this project answers "what is the value now". A trace
// answers "what has it been doing", which is the one question a dial cannot.
// It is the same data a knob shows, kept for a few hundred samples instead of
// one — so it belongs beside them rather than in a charting library.
//
// mirror + voice is the other kind of trace: a waveform straddling the centre
// line that jumps while someone is talking and lies flat while nobody is. What
// makes it read as speech is not the noise but the gate — silence has to be
// genuinely, boringly still, or every pause looks like more talking.
//
// Two shapes, one set of samples. shape="line" writes across a strip the way a
// bedside monitor does; shape="ring" wraps the same trace round a circle and
// deflects outward, which is what the rest of this project is for. The buffer,
// the pen and the sweep are identical; only the two lines that turn an index
// into a point differ.
// -------------------------------------------------

const num = (v, fallback) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const setText = (el, s) => { if (el.textContent !== s) el.textContent = s; };

// A PQRST complex as a sum of gaussians — the standard way to fake one, and
// close enough that a cardiologist would name the parts even if they would not
// sign it. Phase runs 0..1 over one beat; the R spike peaks at 1.
const bump = (t, centre, width, height) =>
  height * Math.exp(-((t - centre) ** 2) / (2 * width * width));

const ecg = (t) =>
  bump(t, 0.170, 0.0210, 0.09) +   // P — the atria
  bump(t, 0.256, 0.0075, -0.16) +  // Q
  bump(t, 0.280, 0.0085, 1.00) +   // R — the spike everyone pictures
  bump(t, 0.304, 0.0085, -0.28) +  // S
  bump(t, 0.450, 0.0420, 0.24);    // T — the ventricles resetting

/**
 * A talker. Phrases arrive and stop; inside one, syllables come at about four a
 * second. Between them the envelope is exactly zero rather than merely small,
 * because a nearly-flat line still reads as noise and the whole point of this
 * shape is that you can see at a glance whether anyone is saying anything.
 *
 * Phrases run about a second and a half against a window that holds two, so a
 * strip nearly always shows both a burst and the quiet either side of it. Slower
 * phrasing is more lifelike and completely useless here: one phrase fills the
 * whole window and the trace looks like it never stops talking.
 */
const voiceEnvelope = (t) => {
  const phrase = Math.sin(t * 2.1) + Math.sin(t * 1.15 + 1.7);
  if (phrase <= 0.35) return 0;
  const syllable = 0.55 + 0.45 * Math.sin(t * 25);
  return Math.min(1, (phrase - 0.35) * 2.4) * syllable;
};

// Speech at this zoom is a band of noise under an envelope, so the texture has
// to be per sample. A hash, not Math.random, so a paused trace redrawn from the
// same buffer is the same picture.
const hashNoise = (i) => {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
};

const template = document.createElement('template');
template.innerHTML = `
<style>
  :host {
    /* ---- public theming API ---- */
    --cj-size: 220px;             /* ring shape only; a strip sizes itself */
    --cj-height: 130px;
    --cj-trace: #35d07f;
    --cj-trace-stale: var(--cj-trace);
    --cj-stale-opacity: .22;
    --cj-pen: var(--cj-trace);
    --cj-grid: rgba(127, 127, 127, .22);
    --cj-grid-step: 10;
    --cj-face: transparent;
    --cj-width: 2;
    --cj-text: #14161a;
    --cj-muted: #6b7280;
    --cj-num-size: max(13px, calc(var(--cj-height) * .26));
    --cj-label-size: max(9px, calc(var(--cj-height) * .11));

    position: relative;
    display: block;
    inline-size: 100%;
    block-size: var(--cj-height);
    color: var(--cj-text);
    font: inherit;
  }
  :host([hidden]) { display: none; }

  /* a ring is square and sizes like every other dial here */
  :host([shape="ring"]) {
    inline-size: var(--cj-size);
    block-size: var(--cj-size);
    --cj-num-size: max(13px, calc(var(--cj-size) * .17));
    --cj-label-size: max(9px, calc(var(--cj-size) * .072));
  }

  @media (prefers-color-scheme: dark) {
    :host { --cj-text: #f2f4f7; --cj-muted: #98a2b3; }
  }

  svg { display: block; inline-size: 100%; block-size: 100%; overflow: visible; }
  .face { fill: var(--cj-face); }
  .grid { stroke: var(--cj-grid); stroke-width: .5; fill: none; }
  .grid[hidden] { display: none; }

  .scrim {
    fill: var(--cj-scrim, rgba(0, 0, 0, .55));
    stroke: none;
    /* fades out across the half the readout is in, so it never dims the trace
       on the far side of the strip */
    mask: linear-gradient(to right, #000 0%, #000 18%, transparent 52%);
  }
  :host([readout-at~="right"]) .scrim {
    mask: linear-gradient(to left, #000 0%, #000 18%, transparent 52%);
  }
  .scrim[hidden] { display: none; }
  /* a ring puts its readout in the middle, where a corner wash means nothing */
  :host([shape="ring"]) .scrim { display: none; }
  @media (prefers-color-scheme: light) {
    :host { --cj-scrim: rgba(255, 255, 255, .72); }
  }

  path { fill: none; stroke-linecap: round; stroke-linejoin: round; stroke-width: var(--cj-width); }
  .fresh { stroke: var(--cj-trace); }
  /* What the pen has not reached yet is last time round, still fading. Opacity
     rather than a mixed colour: color-mix would put a 2023 browser floor under an
     element that otherwise needs nothing newer than shadow DOM. */
  .stale { stroke: var(--cj-trace-stale); opacity: var(--cj-stale-opacity); }
  .pen { fill: var(--cj-pen); }
  .pen[hidden] { display: none; }

  /* The readout rides in a corner of a strip, and in the middle of a ring.
     Top-left by default: a resting trace sits low and only spikes upward for a
     few samples at a time, so the top corner is clear almost always, while the
     bottom corner is sitting directly on the baseline. readout-at="bottom right"
     and the other three combinations move it, for signals that live the other
     way up. */
  .center {
    position: absolute;
    inset-block-start: 6%;
    inset-inline-start: 5%;
    line-height: 1.05;
    pointer-events: none;
  }
  :host([readout-at~="bottom"]) .center { inset-block-start: auto; inset-block-end: 6%; }
  :host([readout-at~="right"]) .center {
    inset-inline-start: auto;
    inset-inline-end: 5%;
    text-align: end;
  }
  :host([shape="ring"]) .center {
    inset: 0;
    display: grid;
    place-content: center;
    text-align: center;
  }
  .readout {
    font-size: var(--cj-num-size);
    font-weight: 650;
    font-variant-numeric: tabular-nums;
    letter-spacing: -.02em;
  }
  .readout[hidden] { display: none; }
  .unit { font-size: .5em; font-weight: 600; margin-inline-start: .12em; color: var(--cj-muted); }
  .label {
    font-size: var(--cj-label-size);
    font-weight: 600;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--cj-muted);
  }
  .label[hidden] { display: none; }
</style>

<svg part="svg" aria-hidden="true" focusable="false" preserveAspectRatio="none">
  <rect class="face" part="face" x="0" y="0" width="100%" height="100%"/>
  <!-- A wash under the readout, dark at the corner it sits in and gone by the
       middle. The trace runs underneath the text and the two are the same
       weight of line, so without this the digits and the waveform interleave. -->
  <rect class="scrim" part="scrim" x="0" y="0" width="100%" height="100%" hidden/>
  <path class="grid" part="grid" hidden/>
  <path class="stale" part="stale"/>
  <path class="fresh" part="fresh"/>
  <circle class="pen" part="pen" r="2.6"/>
</svg>

<div class="center" part="center">
  <div class="readout" part="readout"><span class="num"></span><span class="unit"></span></div>
  <div class="label" part="label" hidden></div>
</div>
`;

export class CJTrace extends HTMLElement {
  static observedAttributes = [
    'shape', 'mode', 'samples', 'points', 'min', 'max',
    'beat', 'voice', 'mirror', 'rate', 'sweep', 'start', 'amplitude',
    'grid', 'pen', 'readout', 'unit', 'decimals', 'label', 'color',
  ];

  #root;
  #els;
  #observer;
  #box = { w: 0, h: 0 };
  #buf = new Float64Array(0);
  #head = 0;      // where the pen writes next
  #filled = 0;    // how much of the buffer has ever been written
  #frame = 0;
  #last = 0;
  #phase = 0;     // where we are inside the current beat, 0..1
  #carry = 0;     // fractional samples owed from the previous frame
  #level = 0;     // how loud the talker is right now, 0..1
  #speaking = false;
  #seed = 0;
  #ownsColor = false;
  #gridSig = '';
  // whether a pen is actually travelling. A written-out waveform has no pen, so
  // it must not be drawn as "the part the pen has not reached yet" and faded.
  #running = false;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    this.#root.append(template.content.cloneNode(true));
    const q = (s) => this.#root.querySelector(s);
    this.#els = {
      svg: q('svg'), grid: q('.grid'), fresh: q('.fresh'), stale: q('.stale'), scrim: q('.scrim'),
      pen: q('.pen'), readout: q('.readout'), num: q('.num'), unit: q('.unit'), label: q('.label'),
    };
  }

  connectedCallback() {
    if (!this.hasAttribute('role')) this.setAttribute('role', 'img');
    this.#resize();
    // a trace with no samples= of its own still needs its window before the pen
    // can write into it, or the loop has nowhere to put the first sample
    this.#alloc();
    this.#observer = new ResizeObserver(() => this.#resize());
    this.#observer.observe(this);
    this.#readPoints();
    this.#render();
    this.#pump();
  }

  disconnectedCallback() {
    this.#observer?.disconnect();
    this.#observer = null;
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;   // zeroed, or a re-attached trace would never start again
  }

  attributeChangedCallback(name, before, after) {
    if (before === after) return;
    if (name === 'samples') this.#alloc();
    if (name === 'points') this.#readPoints();
    if (!this.isConnected) return;
    if (name === 'shape') this.#resize();
    this.#render();
    this.#pump();
  }

  // ---- the buffer --------------------------------------------------------
  get samples() { return Math.max(8, Math.round(num(this.getAttribute('samples'), 240))); }
  set samples(v) { this.setAttribute('samples', v); }

  get min() { return num(this.getAttribute('min'), 0); }
  set min(v) { this.setAttribute('min', v); }

  get max() { return num(this.getAttribute('max'), 100); }
  set max(v) { this.setAttribute('max', v); }

  /** beats per minute when the trace drives itself; 0 or absent means it does not */
  get beat() { return Math.max(0, num(this.getAttribute('beat'), 0)); }
  set beat(v) { this.setAttribute('beat', v); }

  /** samples written per second while self-driving — the paper speed */
  get rate() { return clamp(num(this.getAttribute('rate'), 125), 1, 2000); }

  /**
   * How loud the voice is right now, 0..1, while the trace is driving itself.
   * Zero when nobody is talking — which is the reading the gate exists to make
   * unambiguous.
   */
  get level() { return this.#level; }

  /** Whether anyone is talking. Flips fire a cj-speech event. */
  get speaking() { return this.#speaking; }

  /** the most recent sample, or null before anything has been written */
  get last() { return this.#filled ? this.#buf[(this.#head - 1 + this.#buf.length) % this.#buf.length] : null; }

  /** Write one sample. This is the whole input API; everything else is styling. */
  push(v) {
    const n = num(v, NaN);
    if (!Number.isFinite(n)) return;
    if (this.#buf.length !== this.samples) this.#alloc();
    this.#buf[this.#head] = n;
    this.#head = (this.#head + 1) % this.#buf.length;
    this.#filled = Math.min(this.#filled + 1, this.#buf.length);
    this.#running = true;
    if (this.isConnected) this.#render();
  }

  /** Wipe the window back to empty. */
  clear() {
    this.#buf.fill(NaN);
    this.#head = 0;
    this.#filled = 0;
    this.#running = false;
    if (this.isConnected) this.#render();
  }

  #alloc() {
    const n = this.samples;
    if (this.#buf.length === n) return;
    this.#buf = new Float64Array(n).fill(NaN);
    this.#head = 0;
    this.#filled = 0;
  }

  #readPoints() {
    const spec = this.getAttribute('points');
    if (spec === null) return;
    const list = spec.trim().split(/[\s,]+/).filter(Boolean).map(Number).filter(Number.isFinite);
    if (!list.length) return;
    // a written-out waveform sets both the window and its contents, so it lands
    // exactly as given rather than scrolling in from one end
    this.#buf = new Float64Array(list);
    this.#head = 0;
    this.#filled = list.length;
    this.#running = false;
  }

  // ---- geometry ----------------------------------------------------------
  #resize() {
    const w = this.clientWidth || 0;
    const h = this.clientHeight || 0;
    if (!w || !h) return;
    if (w === this.#box.w && h === this.#box.h) return;
    this.#box = { w, h };
    // one SVG unit is one pixel, so stroke weights are true at any aspect and
    // a strip and a ring can share the same coordinate maths
    this.#els.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.#gridSig = '';
    if (this.isConnected) this.#render();
  }

  get #ring() { return this.getAttribute('shape') === 'ring'; }

  /**
   * Everything a point needs that does not change from sample to sample. Read
   * once per render: getComputedStyle inside the loop is a forced style pass per
   * sample, and there are a few hundred of those sixty times a second.
   */
  #geometry() {
    const { w, h } = this.#box;
    const g = {
      w, h, span: (this.max - this.min) || 1, min: this.min, ring: this.#ring,
      mirror: this.hasAttribute('mirror'),
    };
    if (g.ring) {
      g.sweep = clamp(num(this.getAttribute('sweep'), 360), 1, 360);
      g.start = num(this.getAttribute('start'), -90);
      g.amp = clamp(num(this.getAttribute('amplitude'), 0.18), 0, 0.45);
      g.size = Math.min(w, h);
      // The trace rises outward from a baseline circle rather than straddling
      // it. Straddling let a tall spike reach across the middle of the dial,
      // through the readout and out the other side; rising outward keeps the
      // centre clear for the number, which is where every other dial here puts it.
      g.base = g.size * 0.30;
      // a closed ring must not put its last sample on top of its first
      g.wrap = g.sweep >= 360;
    } else {
      g.pad = num(getComputedStyle(this).getPropertyValue('--cj-width'), 2) * 1.5;
    }
    return g;
  }

  /**
   * Index in the window (0 = left edge / start of the arc) -> a point.
   * side is +1 or -1 and only means anything when mirrored: a waveform is drawn
   * once each way off the centre line, which is what makes it read as sound
   * rather than as a level that happens to be jittery.
   */
  #point(g, i, n, value, side = 1) {
    const over = g.ring && g.wrap ? n : Math.max(1, n - 1);
    const t = n > 1 ? i / over : 0;
    const norm = clamp((value - g.min) / g.span, 0, 1);
    if (!g.ring) {
      if (g.mirror) return [t * g.w, g.h / 2 - side * norm * (g.h / 2 - g.pad)];
      return [t * g.w, g.h - g.pad - norm * (g.h - g.pad * 2)];
    }
    const r = g.mirror
      ? g.base + side * norm * g.amp * g.size * 0.5
      : g.base + norm * g.amp * g.size;
    const a = (g.start + t * g.sweep) * Math.PI / 180;
    return [g.w / 2 + Math.cos(a) * r, g.h / 2 + Math.sin(a) * r];
  }

  #render() {
    if (!this.isConnected || !this.#box.w) return;
    const n = this.#buf.length;
    if (!n) {
      this.#els.fresh.removeAttribute('d');
      this.#els.stale.removeAttribute('d');
      this.#els.pen.toggleAttribute('hidden', true);
      this.#renderText();
      return;
    }

    const g = this.#geometry();
    const scroll = this.getAttribute('mode') === 'scroll';
    // The travelling gap belongs to a pen that is moving. A waveform written out
    // in an attribute has no pen, and drawing it as "not reached yet" would fade
    // the whole thing and punch a hole in it.
    const sweeping = !scroll && this.#running;
    // In sweep mode the pen keeps its place and paints over what was there a
    // window ago, which is why a monitor has that travelling gap. In scroll mode
    // the window slides instead, so the newest sample is always at the end.
    const order = (k) => (scroll ? (this.#head + k) % n : k);
    const penAt = scroll ? this.#filled - 1 : this.#head - 1;

    // Ahead of the pen is last time round: draw it, faded, so the trace reads as
    // one continuous line being overwritten rather than one that keeps vanishing.
    const fresh = [];
    const stale = [];
    const GAP = Math.max(2, Math.round(n * 0.02));   // the erase bar the pen pushes
    for (let k = 0; k < n; k++) {
      const idx = order(k);
      const v = this.#buf[idx];
      if (!Number.isFinite(v)) { fresh.push(null); stale.push(null); continue; }
      const ahead = sweeping && k >= this.#head;
      const wiped = ahead && k < this.#head + GAP;
      const p = this.#point(g, k, n, v);
      if (wiped) { fresh.push(null); stale.push(null); }
      else if (ahead) { fresh.push(null); stale.push(p); }
      else { fresh.push(p); stale.push(null); }
    }

    // The other half of a mirrored waveform: the same samples reflected, joined
    // to the first run by a pen-up so the two halves never close into a shape.
    if (g.mirror) {
      const under = [];
      const underStale = [];
      for (let k = 0; k < n; k++) {
        const idx = order(k);
        const v = this.#buf[idx];
        if (!Number.isFinite(v)) { under.push(null); underStale.push(null); continue; }
        const ahead = sweeping && k >= this.#head;
        const wiped = ahead && k < this.#head + GAP;
        const q = this.#point(g, k, n, v, -1);
        if (wiped) { under.push(null); underStale.push(null); }
        else if (ahead) { under.push(null); underStale.push(q); }
        else { under.push(q); underStale.push(null); }
      }
      fresh.push(null, ...under);
      stale.push(null, ...underStale);
    }

    this.#els.fresh.setAttribute('d', this.#path(fresh));
    this.#els.stale.setAttribute('d', this.#path(stale));

    const showPen = this.getAttribute('pen') !== 'none' && this.#running;
    const penValue = penAt >= 0 ? this.#buf[order(penAt)] : NaN;
    const on = showPen && Number.isFinite(penValue);
    this.#els.pen.toggleAttribute('hidden', !on);
    if (on) {
      const [x, y] = this.#point(g, penAt, n, penValue);
      this.#els.pen.setAttribute('cx', x.toFixed(1));
      this.#els.pen.setAttribute('cy', y.toFixed(1));
    }

    this.#renderGrid();
    this.#renderText();

    if (this.hasAttribute('color')) {
      this.style.setProperty('--cj-trace', this.getAttribute('color'));
      this.#ownsColor = true;
    } else if (this.#ownsColor) {
      this.style.removeProperty('--cj-trace');
      this.#ownsColor = false;
    }
  }

  /** points, with nulls as pen-ups, into one path */
  #path(pts) {
    let d = '';
    let up = true;
    for (const p of pts) {
      if (!p) { up = true; continue; }
      d += `${up ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)} `;
      up = false;
    }
    return d.trim();
  }

  /** graph paper — geometry, so it is rebuilt only when the box or step changes */
  #renderGrid() {
    const on = this.hasAttribute('grid');
    this.#els.grid.toggleAttribute('hidden', !on);
    if (!on) return;
    const { w, h } = this.#box;
    const step = Math.max(4, num(getComputedStyle(this).getPropertyValue('--cj-grid-step'), 10));
    const sig = `${w}|${h}|${step}|${this.#ring}`;
    if (sig === this.#gridSig) return;
    this.#gridSig = sig;
    let d = '';
    if (this.#ring) {
      // Rings and spokes: the polar version of the same paper, but only across
      // the band the trace can reach. Ruling the whole disc puts graph paper
      // behind the readout, which is the one place it must not be.
      const size = Math.min(w, h);
      const inner = size * 0.28;
      for (let r = inner; r < size * 0.5; r += step) {
        d += `M${(w / 2 - r).toFixed(1)},${(h / 2).toFixed(1)} a${r.toFixed(1)},${r.toFixed(1)} 0 1,0 ${(r * 2).toFixed(1)},0 a${r.toFixed(1)},${r.toFixed(1)} 0 1,0 ${(-r * 2).toFixed(1)},0 `;
      }
      for (let i = 0; i < 12; i++) {
        const a = i * 30 * Math.PI / 180;
        d += `M${(w / 2 + Math.cos(a) * inner).toFixed(1)},${(h / 2 + Math.sin(a) * inner).toFixed(1)} L${(w / 2 + Math.cos(a) * size * 0.5).toFixed(1)},${(h / 2 + Math.sin(a) * size * 0.5).toFixed(1)} `;
      }
    } else {
      for (let x = 0; x <= w; x += step) d += `M${x.toFixed(1)},0 L${x.toFixed(1)},${h.toFixed(1)} `;
      for (let y = 0; y <= h; y += step) d += `M0,${y.toFixed(1)} L${w.toFixed(1)},${y.toFixed(1)} `;
    }
    this.#els.grid.setAttribute('d', d.trim());
  }

  #renderText() {
    const mode = this.getAttribute('readout')
      ?? (this.beat ? 'beat' : this.hasAttribute('voice') ? 'none' : 'value');
    const hide = mode === 'none';
    this.#els.readout.toggleAttribute('hidden', hide);
    if (!hide) {
      const decimals = clamp(num(this.getAttribute('decimals'), 0), 0, 6);
      // a heartbeat's readout is its rate, not whatever the pen happens to be on
      const v = mode === 'beat' ? this.beat : this.last;
      setText(this.#els.num, Number.isFinite(v) ? v.toFixed(decimals) : '—');
      setText(this.#els.unit, this.getAttribute('unit') ?? (mode === 'beat' ? 'bpm' : ''));
    }
    const label = this.getAttribute('label');
    setText(this.#els.label, label ?? '');
    this.#els.label.toggleAttribute('hidden', !label);
    if (label && !this.hasAttribute('aria-label')) this.setAttribute('aria-label', label);
    // no text in the corner, nothing to lift off the trace
    this.#els.scrim.toggleAttribute('hidden', hide && !label);
  }

  // ---- the pen -----------------------------------------------------------
  #pump() {
    const bpm = this.beat;
    const talking = this.hasAttribute('voice');
    if (!bpm && !talking) {
      cancelAnimationFrame(this.#frame);
      this.#frame = 0;
      return;
    }
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) {
      // A parked heartbeat is a flat line, which reads as the worst possible
      // thing. So fill the window once and leave it there, still legible.
      cancelAnimationFrame(this.#frame);
      this.#frame = 0;
      if (this.#filled < this.#buf.length || !this.#buf.length) {
        this.#alloc();
        const n = this.#buf.length;
        // a heartbeat still has to look like a heartbeat; a talker parked
        // mid-sentence is just a smear, so it parks in the silence instead
        if (talking) this.#buf.fill(this.min);
        else for (let i = 0; i < n; i++) this.#write((i / n) * 3 % 1);
        this.#filled = n;
        // no pen is travelling, so the whole window draws solid and stays put
        this.#running = false;
        this.#render();
      }
      return;
    }
    if (this.#frame) return;
    this.#last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.25, Math.max(0, (now - this.#last) / 1000));
      this.#last = now;
      // Samples are owed by elapsed time, not by frames — a slow frame writes
      // more of them rather than slowing the heart down.
      const owed = dt * this.rate + this.#carry;
      const whole = Math.floor(owed);
      this.#carry = owed - whole;
      const per = 60 / (this.beat || 60) * this.rate;   // samples in one beat
      if (!this.#buf.length) this.#alloc();
      const seconds = now / 1000;
      for (let i = 0; i < Math.min(whole, this.#buf.length); i++) {
        if (talking) this.#speak(seconds);
        else {
          this.#phase = (this.#phase + 1 / per) % 1;
          this.#write(this.#phase);
        }
      }
      if (whole) this.#render();
      this.#frame = requestAnimationFrame(step);
    };
    this.#frame = requestAnimationFrame(step);
  }

  /**
   * One sample of speech. The envelope decides whether there is any at all; the
   * noise only gives the band its texture. Silence writes the baseline exactly,
   * so it draws as one flat line and not as a quiet fuzz.
   */
  #speak(seconds) {
    const gain = clamp(num(this.getAttribute('voice'), 1), 0, 1);
    const env = voiceEnvelope(seconds) * gain;
    const was = this.#speaking;
    this.#level = env;
    this.#speaking = env > 0.02;
    if (this.#speaking !== was) {
      this.dispatchEvent(new CustomEvent('cj-speech', {
        detail: { speaking: this.#speaking, level: env },
        bubbles: true,
      }));
    }
    const span = (this.max - this.min) || 1;
    // mirrored, the baseline is the bottom of the range and the trace grows off
    // the middle; unmirrored it is an ordinary level rising from the floor
    const v = this.min + span * Math.abs(env * hashNoise(this.#seed++));
    if (this.#buf.length !== this.samples) this.#alloc();
    this.#buf[this.#head] = v;
    this.#head = (this.#head + 1) % this.#buf.length;
    this.#filled = Math.min(this.#filled + 1, this.#buf.length);
    this.#running = true;
  }

  #write(phase) {
    const span = (this.max - this.min) || 1;
    // the baseline sits low so the R spike has room to reach the top
    const v = this.min + span * (0.28 + ecg(phase) * 0.62);
    if (this.#buf.length !== this.samples) this.#alloc();
    this.#buf[this.#head] = v;
    this.#head = (this.#head + 1) % this.#buf.length;
    this.#filled = Math.min(this.#filled + 1, this.#buf.length);
    this.#running = true;
  }
}

if (!customElements.get('cj-trace')) customElements.define('cj-trace', CJTrace);

export default CJTrace;

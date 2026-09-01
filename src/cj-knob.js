// -------------------------------------------------
// cj-knob — a zero-dependency SVG knob / gauge / meter
// https://github.com/tanghoong/cj-knob
//
// <cj-knob value="78"></cj-knob>
// -------------------------------------------------

const SVG_NS = "http://www.w3.org/2000/svg";
const PATH_LENGTH = 100; // every ring is normalised to 100 units via pathLength

const template = document.createElement('template');
template.innerHTML = `
<style>
  :host {
    /* ---- public theming API ---- */
    --cj-size: 220px;
    --cj-thickness: 8;
    --cj-thickness-overflow: calc(var(--cj-thickness) * 0.55);
    /* type scales with the knob but never shrinks below a legible floor */
    --cj-num-size: max(13px, calc(var(--cj-size) * .2));
    --cj-label-size: max(9px, calc(var(--cj-size) * .082));
    --cj-track: #d9dce1;
    --cj-value: #019ae6;
    --cj-benchmark: #94cefe;
    --cj-tick: #9aa3ae;
    --cj-tick-width: .8;
    --cj-needle: #e0433f;
    --cj-mark: #6b7280;
    --cj-mark-major: #14161a;
    --cj-mark-size: 7px;
    --cj-text: #14161a;
    --cj-muted: #6b7280;
    --cj-duration: 600ms;
    --cj-easing: cubic-bezier(.22,.61,.36,1);
    /* ---- internal ---- */
    --cj-start: -90deg;
    --cj-shift: 0px;

    display: inline-grid;
    place-items: center;
    inline-size: var(--cj-size);
    block-size: var(--cj-size);
    color: var(--cj-text);
    font: inherit;
    -webkit-tap-highlight-color: transparent;
  }

  @media (prefers-color-scheme: dark) {
    :host {
      --cj-track: #2f333a;
      --cj-text: #f2f4f7;
      --cj-muted: #98a2b3;
      --cj-mark: #98a2b3;
      --cj-mark-major: #f2f4f7;
    }
  }

  :host([hidden]) { display: none; }
  :host([interactive]) { cursor: grab; touch-action: none; }
  :host([data-dragging]) { cursor: grabbing; }
  /* the value must track the pointer, not ease behind it */
  :host([data-dragging]) .value,
  :host([data-dragging]) .overflow { transition: none; }
  :host([disabled]) { opacity: .5; cursor: not-allowed; pointer-events: none; }

  :host(:focus-visible) { outline: none; }
  :host(:focus-visible) .focus-ring { opacity: 1; }

  svg { grid-area: 1 / 1; inline-size: 100%; block-size: 100%; overflow: visible; }

  .rings {
    transform: rotate(var(--cj-start));
    transform-origin: 50% 50%;
    transform-box: view-box;
  }

  circle {
    fill: none;
    stroke-width: var(--cj-thickness);
    stroke-linecap: round;
  }

  .track     { stroke: var(--cj-track); }
  .value     { stroke: var(--cj-value); }
  /* the benchmark is a target tick drawn over the value ring, so it stays visible either side of it */
  .benchmark {
    stroke: var(--cj-benchmark);
    stroke-linecap: butt;
    stroke-width: calc(var(--cj-thickness) * 1.5);
  }
  .benchmark[hidden] { display: none; }
  .track-2   { stroke: var(--cj-track); stroke-width: var(--cj-thickness-overflow); }
  .overflow  { stroke: var(--cj-value); stroke-width: var(--cj-thickness-overflow); }

  .value, .overflow, .benchmark {
    transition: stroke-dashoffset var(--cj-duration) var(--cj-easing),
                stroke-dasharray  var(--cj-duration) var(--cj-easing);
  }

  .focus-ring {
    fill: none;
    stroke: var(--cj-value);
    stroke-width: 1.5;
    opacity: 0;
    transition: opacity 120ms linear;
  }

  .overflow-group[hidden] { display: none; }

  /* graduations. Drawn inside .rings so the group's rotation positions them for free. */
  .ticks line {
    stroke: var(--cj-tick);
    stroke-width: var(--cj-tick-width);
    stroke-linecap: round;
  }
  .ticks line.major { stroke-width: calc(var(--cj-tick-width) * 2); }

  /* zones sit on the track; segments replace the value ring */
  .zones circle, .segments circle { stroke-width: var(--cj-thickness); }
  :host([segments]) .value { display: none; }

  /* a pointer that swings to the value — compass rose, speedometer, VU meter */
  .needle {
    fill: var(--cj-needle);
    transform: rotate(var(--cj-needle-angle, 0deg));
    transform-origin: 50% 50%;
    transform-box: view-box;
    transition: transform var(--cj-duration) var(--cj-easing);
  }
  .needle[hidden] { display: none; }

  /* bearing labels. Outside .rings so they stay upright instead of turning with it. */
  .marks text {
    fill: var(--cj-mark);
    font-size: var(--cj-mark-size);
    font-family: inherit;
    font-weight: 600;
    text-anchor: middle;
    dominant-baseline: central;
  }
  .marks text.major { fill: var(--cj-mark-major); }

  /* Everything in the middle is stacked in one grid cell and anchored off the centre,
     so the NUMBER always sits on the ring's centre point. The unit and the label hang
     off it without shifting it — otherwise a wide unit ("°C") drags the number left
     and no two knobs in a dashboard line up. */
  .center {
    grid-area: 1 / 1;
    display: grid;
    place-items: center;
    inline-size: 100%;
    block-size: 100%;
    translate: 0 var(--cj-shift);
    pointer-events: none;
    line-height: 1;
  }

  /* With a number AND a label the number lifts, so the lower half of the dial belongs
     to the text and the pair reads as optically centred rather than bottom-heavy. */
  .center:has(.readout:not([hidden])):has(.label:not([hidden])) {
    translate: 0 calc(var(--cj-shift) - var(--cj-num-size) * .26);
  }

  /* Whatever is in the middle has to own the centre. With a number showing, the icon
     and label hang off it. With readout="none" there is nothing to hang off, so they
     take the centre themselves instead of orbiting an invisible number. */
  .center:has(.readout:not([hidden])) {
    --icon-y: calc(var(--cj-num-size) * -.85);
    --label-y: calc(var(--cj-num-size) * .82);
  }
  .center:has(.readout[hidden]) { --icon-y: 0px; --label-y: 0px; }
  /* an icon on its own is the centre; an icon WITH a label shares the space with it */
  .center[data-icon]:has(.readout[hidden]):has(.label:not([hidden])) {
    --icon-y: calc(var(--cj-label-size) * -1);
    --label-y: calc(var(--cj-label-size) * 1.5);
  }

  .readout, .icon, .label { grid-area: 1 / 1; }

  .readout {
    position: relative;
    font-size: var(--cj-num-size);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    letter-spacing: -.02em;
    white-space: nowrap;
  }
  .readout[hidden] { visibility: hidden; }

  /* absolute, so it adds no width to .readout and cannot pull the number off-centre */
  .unit {
    position: absolute;
    inset-inline-start: 100%;
    inset-block-end: .06em;
    margin-inline-start: .1em;
    font-size: .5em;
    font-weight: 500;
    letter-spacing: 0;
    color: var(--cj-muted);
  }

  /* offsets key off the number's size, not the knob's, so the label tucks under the
     digits at every scale instead of drifting out onto the ring on small knobs */
  .icon { translate: 0 var(--icon-y, 0px); }

  .label {
    translate: 0 var(--label-y, 0px);
    inline-size: max-content;
    max-inline-size: calc(var(--cj-size) * .46);
    font-size: var(--cj-label-size);
    line-height: 1.2;
    color: var(--cj-muted);
    text-align: center;
    text-wrap: balance;
  }
  .label[hidden] { display: none; }
  /* with no number in the way the label gets the full inner circle to wrap into */
  .center:has(.readout[hidden]) .label { max-inline-size: calc(var(--cj-size) * .62); }

  /* graphics get sized by width; anything else (an emoji, a glyph) by font-size */
  ::slotted(*) { font-size: calc(var(--cj-size) * .2); line-height: 1; }
  ::slotted(img), ::slotted(svg), ::slotted(picture) {
    inline-size: calc(var(--cj-size) * .15);
    block-size: auto;
    display: block;
  }

  /* opt-in entrance: grow from empty on first paint. Purely visual — the DOM is already correct. */
  @keyframes cj-grow { from { stroke-dashoffset: var(--cj-arc); } }
  :host([animate-in]) .value,
  :host([animate-in]) .overflow { animation: cj-grow var(--cj-duration) var(--cj-easing); }

  @media (prefers-reduced-motion: reduce) {
    .value, .overflow, .benchmark { transition: none; }
    :host([animate-in]) .value, :host([animate-in]) .overflow { animation: none; }
  }
</style>

<svg viewBox="0 0 100 100" part="svg" aria-hidden="true" focusable="false">
  <g class="rings" part="rings">
    <circle class="track"     part="track"     cx="50" cy="50" r="42" pathLength="100" stroke-dasharray="100 100"/>
    <g class="zones"    part="zones"></g>
    <circle class="value"     part="value"     cx="50" cy="50" r="42" pathLength="100" stroke-dasharray="100 100" stroke-dashoffset="100"/>
    <g class="segments" part="segments"></g>
    <g class="ticks"    part="ticks"></g>
    <circle class="benchmark" part="benchmark" cx="50" cy="50" r="42" pathLength="100" stroke-dasharray="0 100" hidden/>
    <g class="overflow-group" hidden>
      <circle class="track-2"  part="track-overflow" cx="50" cy="50" r="31" pathLength="100" stroke-dasharray="100 100"/>
      <circle class="overflow" part="overflow"       cx="50" cy="50" r="31" pathLength="100" stroke-dasharray="100 100" stroke-dashoffset="100"/>
    </g>
    <g class="needle" part="needle" hidden>
      <!-- drawn pointing right, i.e. at 0deg before .rings applies --cj-start -->
      <polygon points="87.5,50 79.5,46.3 79.5,53.7"/>
    </g>
  </g>
  <g class="marks" part="marks"></g>
  <circle class="focus-ring" cx="50" cy="50" r="49"/>
</svg>

<div class="center" part="center">
  <div class="readout" part="readout"><span class="num"></span><span class="unit"></span></div>
  <div class="icon"><slot name="icon"></slot></div>
  <div class="label" part="label" hidden></div>
</div>
`;

const num = (v, fallback) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class CJKnob extends HTMLElement {
  static observedAttributes = [
    'value', 'min', 'max', 'benchmark', 'sweep', 'start',
    'readout', 'unit', 'decimals', 'label', 'color',
    'zones', 'segments', 'ticks', 'tick-major',
    'needle', 'labels', 'label-radius',
    'interactive', 'disabled', 'step',
  ];

  #root;
  #els;
  #dragging = false;
  #ownsColor = false;
  // the needle's unwrapped angle, so a full dial never spins the long way round
  #needleTurn = 0;
  #needleRaw = 0;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: 'open' });
    this.#root.append(template.content.cloneNode(true));
    const q = (s) => this.#root.querySelector(s);
    this.#els = {
      value: q('.value'),
      benchmark: q('.benchmark'),
      track: q('.track'),
      overflowGroup: q('.overflow-group'),
      overflow: q('.overflow'),
      zones: q('.zones'),
      segments: q('.segments'),
      ticks: q('.ticks'),
      needle: q('.needle'),
      marks: q('.marks'),
      center: q('.center'),
      slot: q('slot[name="icon"]'),
      readout: q('.readout'),
      num: q('.num'),
      unit: q('.unit'),
      label: q('.label'),
    };
    this.#els.slot.addEventListener('slotchange', () => this.#syncIcon());
  }

  // CSS cannot ask "is anything slotted?", so record it as an attribute it can match.
  // slotchange is async, so this also runs synchronously on connect — otherwise the
  // first painted frame lays the icon out as if there were none.
  #syncIcon() {
    const filled = this.#els.slot.assignedNodes({ flatten: true })
      .some((n) => n.nodeType === Node.ELEMENT_NODE || n.textContent.trim());
    this.#els.center.toggleAttribute('data-icon', filled);
  }

  // ---- geometry ----------------------------------------------------------
  get #sweep() { return clamp(num(this.getAttribute('sweep'), 360), 1, 360); }

  get #start() {
    const s = this.#sweep;
    // a full ring opens at 12 o'clock; a partial arc centres its gap at the bottom
    return num(this.getAttribute('start'), s >= 360 ? -90 : 90 + (360 - s) / 2);
  }

  // ---- value -------------------------------------------------------------
  get min() { return num(this.getAttribute('min'), 0); }
  set min(v) { this.setAttribute('min', v); }

  get max() { return num(this.getAttribute('max'), 100); }
  set max(v) { this.setAttribute('max', v); }

  get step() { return Math.abs(num(this.getAttribute('step'), 1)) || 1; }
  set step(v) { this.setAttribute('step', v); }

  get value() { return num(this.getAttribute('value'), this.min); }
  set value(v) { this.setAttribute('value', v); }

  /** 0..1, and above 1 once the value passes max */
  get ratio() {
    const span = this.max - this.min;
    return span === 0 ? 0 : (this.value - this.min) / span;
  }

  get interactive() { return this.hasAttribute('interactive') && !this.hasAttribute('disabled'); }
  set interactive(v) { this.toggleAttribute('interactive', !!v); }

  // ---- lifecycle ---------------------------------------------------------
  connectedCallback() {
    this.#syncInteractivity();
    this.#syncIcon();
    this.#render();
  }

  disconnectedCallback() {
    this.#teardownPointer();
    this.removeEventListener('pointerdown', this.#onPointerDown);
    this.removeEventListener('keydown', this.#onKeyDown);
  }

  // Rendering is synchronous on purpose: the geometry and the ARIA attributes must be
  // correct in the DOM the moment the element connects, not one animation frame later
  // (rAF is throttled in background tabs, and assistive tech reads the DOM, not the paint).
  attributeChangedCallback(name) {
    if (name === 'interactive' || name === 'disabled') this.#syncInteractivity();
    if (this.isConnected) this.#render();
  }

  // ---- render ------------------------------------------------------------
  #render() {
    if (!this.isConnected) return;
    const { min, max } = this;
    const sweep = this.#sweep;
    const arc = (sweep / 360) * PATH_LENGTH;
    const raw = this.ratio;
    const pct = clamp(raw, 0, 1);
    const over = clamp(raw - 1, 0, 1);

    this.style.setProperty('--cj-start', `${this.#start}deg`);
    this.style.setProperty('--cj-arc', String(arc));
    // a partial arc leaves a gap at the bottom, so nudge the text up in proportion to it
    const shift = (-(360 - sweep) / 360 * 0.14).toFixed(4);
    this.style.setProperty('--cj-shift', `calc(var(--cj-size) * ${shift})`);

    const dash = `${arc} ${PATH_LENGTH}`;
    this.#els.track.setAttribute('stroke-dasharray', dash);
    this.#els.value.setAttribute('stroke-dasharray', dash);
    this.#els.value.setAttribute('stroke-dashoffset', arc * (1 - pct));

    // benchmark: a short tick positioned on the arc, not a fill from zero
    const bm = this.getAttribute('benchmark');
    this.#els.benchmark.toggleAttribute('hidden', bm === null);
    if (bm !== null) {
      const bmPct = clamp((num(bm, min) - min) / ((max - min) || 1), 0, 1);
      const tick = 1.2;
      this.#els.benchmark.setAttribute('stroke-dasharray', `${tick} ${PATH_LENGTH}`);
      // a negative offset shifts the dash forward along the path; centre it on the mark
      this.#els.benchmark.setAttribute('stroke-dashoffset', -(arc * bmPct - tick / 2));
    }

    // overflow ring: only exists once the value passes max
    const showOverflow = over > 0;
    this.#els.overflowGroup.toggleAttribute('hidden', !showOverflow);
    if (showOverflow) {
      this.#els.overflow.setAttribute('stroke-dasharray', dash);
      this.#els.overflow.setAttribute('stroke-dashoffset', arc * (1 - over));
    }

    this.#renderZones(arc, min, max);
    this.#renderSegments(arc, min, max);
    this.#renderTicks(sweep);
    this.#renderNeedle(sweep, pct);
    this.#renderMarks(sweep, this.#start);

    // `color` is a shorthand for the --cj-value custom property. Only clear it again if
    // WE set it — an author may have put --cj-value in their own inline style, and
    // removing that would silently override their choice.
    if (this.hasAttribute('color')) {
      this.style.setProperty('--cj-value', this.getAttribute('color'));
      this.#ownsColor = true;
    } else if (this.#ownsColor) {
      this.style.removeProperty('--cj-value');
      this.#ownsColor = false;
    }

    this.#renderText(raw);
    this.#renderA11y();
  }

  // --- zones, segments and ticks -----------------------------------------
  // All three reuse the pathLength=100 trick: an arc from a to b is a dash of
  // length (b-a) pushed along the path by a negative dash offset.
  #arcNode(cls, len, at, stroke) {
    const c = document.createElementNS(SVG_NS, 'circle');
    c.setAttribute('class', cls);
    c.setAttribute('cx', '50');
    c.setAttribute('cy', '50');
    c.setAttribute('r', '42');
    c.setAttribute('pathLength', String(PATH_LENGTH));
    c.setAttribute('stroke-dasharray', `${len} ${PATH_LENGTH}`);
    c.setAttribute('stroke-dashoffset', String(-at));
    c.setAttribute('fill', 'none');
    if (stroke) c.setAttribute('stroke', stroke);
    return c;
  }

  /** zones="0-60:#22c55e, 60-85:#f59e0b, 85-100:#ef4444" — coloured bands on the track */
  #renderZones(arc, min, max) {
    const spec = this.getAttribute('zones');
    if (!spec) return void this.#els.zones.replaceChildren();
    const span = (max - min) || 1;
    const frag = document.createDocumentFragment();
    for (const part of spec.split(',')) {
      const m = part.trim().match(/^(-?[\d.]+)\s*-\s*(-?[\d.]+)\s*:\s*(.+)$/);
      if (!m) continue;
      const a = clamp((parseFloat(m[1]) - min) / span, 0, 1);
      const b = clamp((parseFloat(m[2]) - min) / span, 0, 1);
      if (b <= a) continue;
      frag.append(this.#arcNode('zone', arc * (b - a), arc * a, m[3].trim()));
    }
    this.#els.zones.replaceChildren(frag);
  }

  /** segments="35:#3b82f6, 25:#8b5cf6" — consecutive stacked slices, in value units */
  #renderSegments(arc, min, max) {
    const spec = this.getAttribute('segments');
    if (!spec) return void this.#els.segments.replaceChildren();
    const span = (max - min) || 1;
    const frag = document.createDocumentFragment();
    let at = 0;
    for (const part of spec.split(',')) {
      const m = part.trim().match(/^([\d.]+)\s*:\s*(.+)$/);
      if (!m) continue;
      const len = clamp(parseFloat(m[1]) / span, 0, 1 - at);
      if (len <= 0) continue;
      frag.append(this.#arcNode('segment', arc * len, arc * at, m[2].trim()));
      at += len;
    }
    this.#els.segments.replaceChildren(frag);
  }

  /** needle — a pointer that swings to the current value */
  #renderNeedle(sweep, pct) {
    const on = this.hasAttribute('needle');
    this.#els.needle.toggleAttribute('hidden', !on);
    if (!on) return;

    // Angles are relative: .rings already carries --cj-start.
    const target = pct * sweep;
    if (sweep >= 360) {
      // On a closed dial 359° -> 1° is a 2° move, not a 358° one. Accumulate the
      // unwrapped angle so the needle always takes the short way round.
      let step = target - this.#needleRaw;
      step -= Math.round(step / 360) * 360;
      this.#needleTurn += step;
      this.#needleRaw = target;
      this.style.setProperty('--cj-needle-angle', `${this.#needleTurn.toFixed(2)}deg`);
    } else {
      this.style.setProperty('--cj-needle-angle', `${target.toFixed(2)}deg`);
    }
  }

  /** labels="N,E,S,W" — upright captions spaced around the arc */
  #renderMarks(sweep, start) {
    const spec = this.getAttribute('labels');
    if (!spec) return void this.#els.marks.replaceChildren();
    const parts = spec.split(',').map((s) => s.trim());
    if (!parts.length) return void this.#els.marks.replaceChildren();

    // A closed dial must not stack the last label on top of the first
    const span = sweep >= 360 ? parts.length : Math.max(1, parts.length - 1);
    const r = num(this.getAttribute('label-radius'), 29.5);
    const frag = document.createDocumentFragment();
    parts.forEach((text, i) => {
      if (!text) return;
      const a = (start + (i / span) * sweep) * Math.PI / 180;
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', (50 + Math.cos(a) * r).toFixed(2));
      t.setAttribute('y', (50 + Math.sin(a) * r).toFixed(2));
      // the cardinal points read heavier than the intercardinals between them
      if (parts.length % 4 === 0 && i % (parts.length / 4) === 0) t.setAttribute('class', 'major');
      t.textContent = text;
      frag.append(t);
    });
    this.#els.marks.replaceChildren(frag);
  }

  /** ticks="12" tick-major="3" — graduations around the arc */
  #renderTicks(sweep) {
    const n = Math.round(num(this.getAttribute('ticks'), 0));
    if (!(n > 0)) return void this.#els.ticks.replaceChildren();
    const major = Math.round(num(this.getAttribute('tick-major'), 0));
    // a closed ring would otherwise stack a tick on top of itself at the seam
    const count = sweep >= 360 ? n : n + 1;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      // angles are relative: the parent .rings group already carries --cj-start
      const a = (i / n) * sweep * Math.PI / 180;
      const isMajor = major > 0 && i % major === 0;
      const r1 = isMajor ? 31 : 33.5;
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', (50 + Math.cos(a) * r1).toFixed(2));
      line.setAttribute('y1', (50 + Math.sin(a) * r1).toFixed(2));
      line.setAttribute('x2', (50 + Math.cos(a) * 37).toFixed(2));
      line.setAttribute('y2', (50 + Math.sin(a) * 37).toFixed(2));
      if (isMajor) line.setAttribute('class', 'major');
      frag.append(line);
    }
    this.#els.ticks.replaceChildren(frag);
  }

  #renderText(raw) {
    const mode = this.getAttribute('readout') ?? 'percent';
    const decimals = clamp(num(this.getAttribute('decimals'), 0), 0, 6);
    const hide = mode === 'none';
    this.#els.readout.toggleAttribute('hidden', hide);
    if (!hide) {
      const shown = mode === 'value' ? this.value : raw * 100;
      this.#els.num.textContent = shown.toFixed(decimals);
      this.#els.unit.textContent = this.getAttribute('unit') ?? (mode === 'percent' ? '%' : '');
    }
    const label = this.getAttribute('label');
    this.#els.label.textContent = label ?? '';
    this.#els.label.toggleAttribute('hidden', !label);
  }

  #renderA11y() {
    this.setAttribute('role', this.interactive ? 'slider' : 'meter');
    this.setAttribute('aria-valuenow', String(this.value));
    this.setAttribute('aria-valuemin', String(this.min));
    this.setAttribute('aria-valuemax', String(this.max));
    const label = this.getAttribute('label');
    if (label && !this.hasAttribute('aria-label')) this.setAttribute('aria-label', label);
    const unit = this.getAttribute('unit');
    this.setAttribute('aria-valuetext', unit ? `${this.value}${unit}` : String(this.value));
  }

  // ---- interaction -------------------------------------------------------
  #syncInteractivity() {
    if (this.interactive) {
      if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0');
      this.addEventListener('pointerdown', this.#onPointerDown);
      this.addEventListener('keydown', this.#onKeyDown);
    } else {
      this.removeAttribute('tabindex');
      this.removeEventListener('pointerdown', this.#onPointerDown);
      this.removeEventListener('keydown', this.#onKeyDown);
    }
  }

  #valueFromPoint(clientX, clientY) {
    const r = this.getBoundingClientRect();
    const deg = Math.atan2(clientY - (r.top + r.height / 2), clientX - (r.left + r.width / 2)) * 180 / Math.PI;
    const sweep = this.#sweep;
    let rel = (deg - this.#start) % 360;
    if (rel < 0) rel += 360;
    if (rel > sweep) rel = (rel - sweep) < (360 - rel) ? sweep : 0; // snap to the nearer end of the gap
    const v = this.min + (rel / sweep) * (this.max - this.min);
    return clamp(Math.round(v / this.step) * this.step, this.min, this.max);
  }

  #commit(v, type) {
    if (v === this.value) return;
    this.value = v;
    this.dispatchEvent(new CustomEvent(type, { detail: { value: v }, bubbles: true }));
  }

  // arrow fields, not methods: private methods are non-writable, so they cannot be .bind()-ed
  #onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.#dragging = true;
    this.setAttribute('data-dragging', '');
    this.setPointerCapture(e.pointerId);
    this.addEventListener('pointermove', this.#onPointerMove);
    this.addEventListener('pointerup', this.#onPointerUp);
    this.addEventListener('pointercancel', this.#onPointerUp);
    this.focus();
    this.#commit(this.#valueFromPoint(e.clientX, e.clientY), 'cj-input');
  };

  #onPointerMove = (e) => {
    if (!this.#dragging) return;
    this.#commit(this.#valueFromPoint(e.clientX, e.clientY), 'cj-input');
  };

  #onPointerUp = () => {
    if (!this.#dragging) return;
    this.#teardownPointer();
    this.dispatchEvent(new CustomEvent('cj-change', { detail: { value: this.value }, bubbles: true }));
  };

  #teardownPointer() {
    this.#dragging = false;
    this.removeAttribute('data-dragging');
    this.removeEventListener('pointermove', this.#onPointerMove);
    this.removeEventListener('pointerup', this.#onPointerUp);
    this.removeEventListener('pointercancel', this.#onPointerUp);
  }

  #onKeyDown = (e) => {
    const s = this.step;
    const big = s * 10;
    const map = {
      ArrowUp: s, ArrowRight: s, ArrowDown: -s, ArrowLeft: -s,
      PageUp: big, PageDown: -big,
    };
    let next;
    if (e.key in map) next = this.value + map[e.key];
    else if (e.key === 'Home') next = this.min;
    else if (e.key === 'End') next = this.max;
    else return;
    e.preventDefault();
    this.#commit(clamp(next, this.min, this.max), 'cj-input');
    this.dispatchEvent(new CustomEvent('cj-change', { detail: { value: this.value }, bubbles: true }));
  };
}

if (!customElements.get('cj-knob')) customElements.define('cj-knob', CJKnob);

export default CJKnob;

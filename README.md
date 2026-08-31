# cj-knob

A knob, gauge and meter as a single custom element. **Zero runtime dependencies, no build step, no framework.**

```html
<script type="module" src="cj-knob/src/cj-knob.js"></script>

<cj-knob value="78"></cj-knob>
<cj-knob value="64" sweep="270" color="#7c3aed" label="Gauge"></cj-knob>
<cj-knob value="60" interactive label="Volume"></cj-knob>
```

Because it is a custom element it works the same in plain HTML, React, Vue, Svelte, Astro or anything else that renders DOM.

## Install

```sh
npm install cj-knob
```

```js
import 'cj-knob';           // registers <cj-knob>
import { CJKnob } from 'cj-knob';  // if you need the class
```

Or drop it in with no tooling at all:

```html
<script type="module" src="https://esm.sh/cj-knob"></script>
```

## Attributes

| Attribute | Default | Description |
|---|---|---|
| `value` | `min` | Current value. Above `max` an inner overflow ring appears. |
| `min` / `max` | `0` / `100` | The scale. |
| `sweep` | `360` | Degrees of arc. `360` is a ring, `270` a gauge, `180` a half-circle. |
| `start` | auto | Start angle in degrees (`0` = 3 o'clock). Defaults to the top for a full ring, and to a bottom-centred gap otherwise. |
| `benchmark` | — | Draws a target tick at this value, on top of the value ring. |
| `readout` | `percent` | `percent`, `value`, or `none`. |
| `unit` | `%` / `""` | Suffix after the number. |
| `decimals` | `0` | Decimal places in the readout. |
| `label` | — | Caption under the number. Also used as the accessible name. |
| `color` | — | Shorthand for `--cj-value`. |
| `interactive` | — | Makes it draggable and keyboard-operable. |
| `step` | `1` | Increment for dragging and arrow keys. |
| `disabled` | — | Dims it and ignores input. |
| `animate-in` | — | Grow from empty on first paint. |
| `zones` | — | Coloured bands on the track, in value units: `"0-60:#22c55e, 60-85:#f59e0b, 85-100:#ef4444"`. |
| `segments` | — | Consecutive stacked slices in place of the value ring: `"42:#3b82f6, 23:#8b5cf6"`. |
| `ticks` | — | Number of graduations around the arc. |
| `tick-major` | — | Every Nth tick is drawn longer and heavier. |

Properties `value`, `min`, `max`, `step`, `interactive` and the read-only `ratio` mirror the attributes.

## Styling

Everything is a CSS custom property, so you theme it from the outside — no options object:

```css
cj-knob {
  --cj-size: 180px;
  --cj-thickness: 10;      /* unitless, in a 0-100 viewBox */
  --cj-value: #019ae6;
  --cj-track: #d9dce1;
  --cj-benchmark: #94cefe;
  --cj-text: #14161a;
  --cj-muted: #6b7280;
  --cj-num-size: 2rem;     /* defaults to 20% of --cj-size, floored at 13px */
  --cj-label-size: .8rem;  /* defaults to 8.2% of --cj-size, floored at 9px  */
  --cj-duration: 600ms;
  --cj-easing: cubic-bezier(.22,.61,.36,1);
}
```

Type scales with the knob but never drops below a legible floor, so a 56px knob is still readable.

### How the middle is laid out

The number is the anchor. It sits on the ring's centre point and nothing is allowed to push it sideways — the unit is positioned out of flow, so `78%`, `36.6°C` and `18°` all put their digits in exactly the same place and a row of knobs lines up. When a `label` is present the number lifts by a quarter of its own height so the lower half of the dial belongs to the text; without a label it stays dead centre.

Light and dark palettes are built in via `prefers-color-scheme`; anything you set from the outside wins. Internals are also reachable through `::part(track)`, `::part(value)`, `::part(benchmark)`, `::part(readout)` and `::part(label)`.

Put anything you like in the middle with the `icon` slot:

```html
<cj-knob value="68" readout="none">
  <img slot="icon" src="sun.svg" alt="">
</cj-knob>
```

## Events

Interactive knobs fire `cj-input` continuously and `cj-change` when the interaction settles. Both carry `detail.value` and bubble.

```js
knob.addEventListener('cj-change', (e) => console.log(e.detail.value));
```

## Accessibility

- `role="meter"`, or `role="slider"` when `interactive`.
- `aria-valuenow` / `aria-valuemin` / `aria-valuemax` / `aria-valuetext` stay in sync, and `label` becomes the accessible name.
- Arrow keys step by `step`, PageUp/PageDown by ten steps, Home/End jump to the bounds.
- Animation is dropped under `prefers-reduced-motion: reduce`.
- Geometry and ARIA are written synchronously on connect, so assistive tech and server-side snapshots never see an empty element.

## The instrument lab

`lab/` is 29 full-screen dashboards. Every dial on every one of them is the same `<cj-knob>` —
the only thing that changes is the CSS custom properties and the numbers fed in.

Open `lab/` and switch panels from the header. Each page also stands alone at `lab/aviation.html`
and so on. All data is simulated.

| | |
|---|---|
| **Vehicles** | Aviation · Submarine · Spacecraft · Mobile Suit · Race |
| **Worlds** | Steampunk · Futuristic · Xenology · Reactor · Campaign |
| **Systems** | Server · Jobs · Micro |
| **Human** | Body · Emotion · Life OS · Charm |
| **Money** | Enterprise · Personal · Salary · Markets |
| **World** | Countries · Population · Resources · Food · Faiths · Singapore · Malaysia · World Clock |

Six of them are hand-written top to bottom (aviation, submarine, steampunk, futuristic,
worldclock, micro) to show the element dropped into completely bespoke markup. The rest are
built from [`lab/panel.js`](lab/panel.js) + [`lab/panel.css`](lab/panel.css), a ~150-line
declarative wrapper, so each panel is just a theme and a `tick()`:

```js
buildPanel({
  title: 'host cj-prod-01 — simulation',
  status: [{ id: 'load', label: 'load', value: '—' }],
  rows: [{ size: 'lg', items: [
    { id: 'cpu', cap: 'CPU', min: 0, max: 100, sweep: 270, readout: 'value',
      ticks: 10, tickMajor: 5, label: '%', zones: '88-100:#ff4d5e' },
  ]}],
  tick(t, set) { set('cpu', 46 + wave(t, 23, 22)); },
});
```

Things worth stealing from the lab: the sonar sweep (a short arc + one CSS rotation), the
concentric clock (three knobs on one grid cell), the neon glow (`::part(value)` +
`drop-shadow`), and the engine bells (a generated row rather than nine copies of the markup).

## Demo & tests

The demo lives at the repository root so that `./src/cj-knob.js` never points outside the document root. **Serve from the repo root** (any static server works: `npm run dev`, `php -S localhost:8000`, `python -m http.server`) and open `/`. Serving from a subfolder, or opening the file over `file://`, breaks the ES module import.

```sh
npm run dev     # then open http://127.0.0.1:8765/
npm test        # Playwright checks: geometry, keyboard, pointer, a11y
```

## Browser support

Any browser with custom elements and shadow DOM — Chrome/Edge 67+, Firefox 63+, Safari 12.1+. No polyfills, no transpiler.

## Migrating from the jQuery plugin (v0.x)

The jQuery plugin is gone. The mapping is direct:

| v0.x option | now |
|---|---|
| `$("#el").cjknob({ cColor: "green" })` | `<cj-knob color="green">` |
| `bgcolor` | `--cj-track` |
| `cBenchmark` / `cBenchmarkD` | `--cj-benchmark` / `benchmark` |
| `width` / `height` | `--cj-size` |
| `mode: 'dknob'` | automatic once `value > max` |
| `mode: 'gauge'` | `sweep="270"` |
| `cjIcon` | `<img slot="icon">` |
| value read from element text | `value` attribute |

## Origins

cj-knob started on 19 June 2013 as a jQuery canvas plugin — the first thing I ever put on GitHub. Version 1.0 is a full rewrite as a standards-based custom element, but it is still the same knob.

## License

MIT

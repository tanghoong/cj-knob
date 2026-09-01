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
| `needle` | — | A pointer that swings to the value, taking the short way round a closed dial. `needle="hand"` swaps the rim marker for a centre-mounted hand. |
| `labels` | — | Upright captions spaced round the arc: `"N,E,S,W"`. Every fourth reads heavier. |
| `label-radius` | `29.5` | How far out the captions sit, in the 0–100 viewBox. |
| `value-2` | — | A second value, drawn as a second pointer alongside the first. |
| `rotating` | — | The card turns under a fixed index, the way a heading indicator works. |
| `liquid` | — | Fills the dial with fluid whose surface sits at the value, with drifting waves. Good for tanks, fuel, reagents. |
| `gradient` | — | A colour ramp that follows the arc: `"#22c55e,#f59e0b,#ef4444"`. Colour maps to the scale, so the value reveals part of the ramp rather than compressing all of it. |
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
  --cj-needle: #e0433f;     /* the pointer */
  --cj-mark: #6b7280;       /* bearing captions */
  --cj-mark-major: #14161a; /* every fourth caption */
  --cj-mark-size: 7px;      /* in the 0-100 viewBox, so it scales */
  --cj-needle-2: #2f7ae5;   /* the second pointer */
  --cj-liquid: #35a7ff;     /* the fluid, and --cj-liquid-back behind it */
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

## `<cj-level>`

The straight tube a ring cannot give you: a tank, a cylinder, a thermometer. Same
liquid engine as `<cj-knob liquid>`, in the container the quantity actually lives in,
with a scale you read off the side.

```html
<script type="module" src="cj-knob/src/cj-level.js"></script>

<cj-level value="62" unit="L" label="fryer oil" liquid ticks="10" tick-major="5"></cj-level>
<cj-level value="36.6" min="34" max="42" decimals="1" unit="°C" bulb liquid></cj-level>
```

| Attribute | Default | Description |
|---|---|---|
| `value` / `min` / `max` | `0` / `100` | The column and its scale. |
| `liquid` | — | A wavy drifting surface instead of a flat bar. |
| `bulb` | — | Adds a reservoir at the foot, drawn as one outline with the column — a thermometer. |
| `ticks` / `tick-major` | — | Graduations down the side, every Nth one labelled in value units. |
| `zones` | — | Bands painted *over* the column, so a low-level warning tints the fluid sitting in it. |
| `readout` | `value` | `value`, `percent` or `none`. |
| `unit` / `decimals` / `label` | — | As on `<cj-knob>`. |
| `color` | — | Shorthand for `--cjl-fill`. |

Height comes from `--cjl-height` and the width follows. Theme with `--cjl-fill`,
`--cjl-fill-back`, `--cjl-tube`, `--cjl-wall` and `--cjl-tick`.

## `<cj-radar>`

A knob describes one value on a rim; a radar describes many contacts across a whole
field. Different geometry and a different API, so it is a sibling element rather than
a mode — import it only if you want it.

```html
<script type="module" src="cj-knob/src/cj-radar.js"></script>

<cj-radar period="4" rings="4" spokes="8" labels="N,E,S,W"
          blips="35:0.62, 118:0.34, 214:0.78"></cj-radar>
```

| Attribute | Default | Description |
|---|---|---|
| `rings` | `4` | Concentric range rings. |
| `spokes` | `8` | Bearing spokes. `0` for none. |
| `period` | — | Seconds per sweep revolution. Omit or `0` for a static scope. |
| `labels` | — | Bearing captions, spaced evenly from north. |
| `blips` | — | Contacts as `bearing:range` pairs, range 0 at the centre to 1 at the rim. |
| `interactive` | — | Clicking the scope adds a contact where you clicked. |

Tune the sweep with `--cjr-tail` (how far the luminous trail reaches behind the leading
line) and `--cjr-fade` (how long a contact stays lit after a pass).

Contacts are also a property, so they do not have to go through an attribute:

```js
radar.blips = [{ bearing: 45, range: 0.6 }];
radar.addBlip({ bearing: 190, range: 0.3 });
radar.scatter(6);
radar.clearBlips();

// the sweep lights each contact as it crosses it
radar.addEventListener("cj-detect", (e) => console.log(e.detail.bearing));
```

Theme it with `--cjr-field`, `--cjr-grid`, `--cjr-beam`, `--cjr-blip`, `--cjr-mark`
and `--cjr-size`. With no `period` the beam is not drawn at all and the contacts
carry their own contrast.

**If the sweep is not turning, check your system motion setting.** Under
`prefers-reduced-motion: reduce` the beam parks instead of rotating — it stays
visible, it just holds still. On Windows that is Settings → Accessibility → Visual
effects → Animation effects; on macOS, System Settings → Accessibility → Display →
Reduce motion.

## `<cj-horizon>`

The artificial horizon an aircraft shows you: sky over ground, tipping with bank and
sliding with pitch, read against a fixed aircraft symbol. Two angles across a whole
face rather than one number on a rim, so it is a third element rather than a knob mode.

```html
<script type="module" src="cj-knob/src/cj-horizon.js"></script>

<cj-horizon pitch="8" roll="-20"></cj-horizon>
```

| Attribute | Default | Description |
|---|---|---|
| `pitch` | `0` | Nose-up in degrees. Positive slides the horizon down the face. |
| `roll` | `0` | Right bank in degrees. Positive lifts the horizon's right-hand end — the ground rises to your right, as it does out of the window. |
| `ladder-step` | `10` | Degrees between pitch-ladder rungs. |
| `ladder-max` | `30` | Highest rung drawn, either side of the horizon. |

`pitch` and `roll` are also properties, and `.attitude` returns the state in words
(`"climbing, left bank"`) — which is what the element puts in its own `aria-label`.
Theme it with `--cjh-sky`, `--cjh-ground`, `--cjh-craft`, `--cjh-index` and `--cjh-size`.

## The instrument lab

`lab/` is 30 full-screen dashboards. Every dial on every one of them is the same `<cj-knob>` —
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
| **Work** | Kitchen |
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
npm test        # 102 Playwright checks: geometry, needle, radar, horizon, keyboard, a11y
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

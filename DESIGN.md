# Patchwork Pete — Design System (UI v4 "Strata" on the v3 "Liquid Glass Manor" base)

## UI v4 "Strata" (2026-11-17, Rev's pick: MotionSites' *Interactive Discovery*)

Rev chose the *Interactive Discovery* design on MotionSites Studio as the
reference for a second overhaul (its own AI customizer is paywalled; the
design was rebuilt by hand into this codebase). What was taken from it:

- **Pure-black hero field** and its top strip: wordmark left, a dark glass
  **pill nav** centre, a white pill action right (our Guide button).
- **Two-line giant headline**: an italic serif line (*"Stitched from"*) over
  a bold grotesque line (*"LIVING DATA"*) — ours in metallic gold, with a
  staggered line-reveal on load.
- **The specimen as the rock**: Pete's chamber floor is now a dark volcanic
  rock silhouette with **glowing gold veins** (the reference's lava veins,
  swapped orange → gold). The veins pulse idly and run *hot* — brighter,
  faster — only while all five organs truly read alive (`body.veins-hot`,
  driven by the same real state as the IT'S ALIVE moment; never faked).
- **Small-print captions** at the hero's foot, left and right, with a single
  gold pill CTA — *"Peel His Layers"* — for the reference's "Start Digging".
- **The peel**: the Specimen Ledger's cards begin as buried strata and are
  uncovered layer by layer when the Ledger first scrolls into view (or the
  CTA is pressed) — the reference's "peel back the crust" made literal with
  Pete's data layers. Panels wear a thin strata edge in the same motif.

Everything from v3 below (glass, palette, type, honesty rules, the guided
flow, the Data Menu) is unchanged underneath.

---

# UI v3 "Liquid Glass Manor" (base system)

Generated with the **UI UX Pro Max** design-intelligence skill, then fit-checked
against the product instead of applied blindly.

## What the skill recommended

| Decision | Skill source | Applied |
|---|---|---|
| Style | Product profile "Luxury/Premium Brand" → **Liquid Glass + Glassmorphism** | ✅ frosted glass panels, layered depth, inner highlights |
| Base mode | Style "Dark Mode (OLED)" — deep black, midnight blue, minimal glow | ✅ `#050507` base, `#0a0e27` midnight tint |
| Palette focus | **Black + Gold + White**, minimal accent | ✅ gold `#d4af37` / `#f3d27a`, jewel tones only as organ-state accents |
| Pattern | "Real-Time / Operations Landing" — hero + live status, key metrics, how-it-works, CTA | ✅ masthead + live badge → gauges → guide/ledger → data menu |
| Typography | "Classic Elegant": **Playfair Display / Inter**; "Luxury Serif": **Cormorant Garamond** | ✅ Playfair headings, Inter UI, Cormorant for Pete's diary voice |
| Rules | Contrast ≥ 4.5:1, 44px touch targets, visible focus, SVG icons (no emoji), reduced-motion | ✅ all enforced; faint text lifted 3.5:1 → 6.0:1 |

## What was deliberately rejected

The skill's generic generator answered "virtual pet game" with Claymorphism and
playful orange (`#F97316`, Varela Round). That contradicts the locked art
direction — a gothic-luxury specimen manor for the Frankenstein category — so
only the skill's *quality rules and luxury system* were applied, not its
generic pet styling. Per the skill's own Query Contract: verify fit before
applying.

## The signature moment

**"IT'S ALIVE!"** — once per visit, the first time all five data organs read
alive at once (typically the moment a visitor gives Pete a home and his face
and lungs wake), lightning strikes the arch, the room flashes, Pete jolts,
and the words appear. It is theatre layered on real state only — it can never
fire while an organ is dead or awaiting, because Pete never fakes being alive.
Disabled under `prefers-reduced-motion`.

## First-run flow (by design)

Veil → 3-step guided tour → the tour's final button is **"Choose Pete's Home"**
and lands the visitor directly on the location picker → Pete's face, lungs,
sky and diary all follow the chosen place.

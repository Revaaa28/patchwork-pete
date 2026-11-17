# Patchwork Pete — Design System (UI v3 "Liquid Glass Manor")

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

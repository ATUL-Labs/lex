---
style: claymorphism
mood: soft, playful, tactile, friendly
fits: kids products, wellness apps, casual mobile UI, onboarding flows
avoid-for: text-dense reading surfaces, data tables, high-contrast accessibility-critical UI
---

# Claymorphism

Puffy, moldable-looking UI: big radii, saturated pastel fills, and a double
shadow that pushes each shape up off the canvas like soft plastic.

## Tokens

```css
:root {
  --cl-radius: 24px;      /* 16-32px range, pick one and stay consistent */
  --cl-shadow-outer: 8px 8px 16px rgba(163, 130, 76, 0.35);
  --cl-shadow-inner: inset -4px -4px 8px rgba(0,0,0,0.12), inset 4px 4px 8px rgba(255,255,255,0.7);
  --cl-bg: #eef1ff;
  --cl-fill-1: #ffd6e8;   /* pastel pink */
  --cl-fill-2: #c8f4de;   /* pastel mint */
  --cl-fill-3: #ffe8b3;   /* pastel amber */
  --cl-fill-4: #d6ccff;   /* pastel violet */
  --cl-ink: #3a3355;
  --cl-font: 'Quicksand', 'Nunito', 'Inter', sans-serif;
}
```

## Rules

- Radius: one fixed value between 16-32px applied to every shape on the screen - mixing radii breaks the soft-molded illusion.
- Shadow formula: two shadows always - outer soft drop (offset 6-12px, blur 8-16px per the depth hierarchy below, color at 30-40% opacity, warm-tinted not pure black) plus an inner highlight (inset light top-left at 60-70% white opacity, inset shadow bottom-right at 10-15% black opacity).
- Fill: pastel but saturated - not washed out. Use HSL saturation 65-100%, lightness 85-92% (e.g. #ffd6e8 = hsl(334,100%,92%), #c8f4de = hsl(150,67%,87%), #ffe8b3 = hsl(42,100%,85%), #d6ccff = hsl(252,100%,90%)).
- Borders: none, ever. Clay shapes are defined by shadow and fill, never by a stroke.
- Padding: chunky, 20-32px inside any clay card or button - thin padding reads as flat UI wearing a shadow, not clay.
- Icons: rounded, filled, single-color or duotone - never thin-line icons, they clash with the soft-plastic language.
- Dark mode formula: invert lightness only - fills drop to 25-35% lightness at the same hue and saturation, outer shadow becomes rgba(0,0,0,0.5), inner highlight opacity drops to 15% white / 25% black.
- Depth hierarchy: raise interactive elements (buttons) with a larger outer shadow (12-16px blur) than static containers (cards, 8-12px blur) so touch targets read as more "liftable."

## Component recipes

```css
.cl-card {
  border-radius: var(--cl-radius); background: var(--cl-fill-2);
  box-shadow: 6px 6px 12px rgba(163, 130, 76, 0.35), inset -4px -4px 8px rgba(0,0,0,0.12), inset 4px 4px 8px rgba(255,255,255,0.7);
  padding: 28px; border: none;
}
.cl-button {
  border-radius: var(--cl-radius); background: var(--cl-fill-1);
  box-shadow: 8px 8px 16px rgba(163,130,76,0.35), inset -3px -3px 6px rgba(0,0,0,0.12), inset 3px 3px 6px rgba(255,255,255,0.75);
  padding: 14px 28px; border: none; color: var(--cl-ink); font-weight: 700;
  transition: transform 150ms ease, box-shadow 150ms ease;
}
.cl-button:active { transform: translateY(2px); box-shadow: 6px 6px 12px rgba(163,130,76,0.35), inset -2px -2px 4px rgba(0,0,0,0.12), inset 2px 2px 4px rgba(255,255,255,0.6); }
.cl-dark { background: #241f3d; }
.cl-dark .cl-card { background: hsl(150, 67%, 30%); box-shadow: 8px 8px 16px rgba(0,0,0,0.5), inset -3px -3px 6px rgba(0,0,0,0.25), inset 3px 3px 6px rgba(255,255,255,0.15); }
```

## Anti-patterns

- Clay treatment on text-dense surfaces (article bodies, data tables): the shadow noise fights reading legibility.
- Adding a border to a clay shape: clay has no strokes, the double shadow alone defines the edge.
- High-contrast harsh accents (pure black text, neon on pastel): breaks the soft, low-contrast plastic mood.
- Single flat drop shadow with no inner highlight: reads as ordinary Material elevation, not clay.
- Thin padding under 16px: the shape reads squeezed instead of puffy.

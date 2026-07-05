---
style: neobrutalism
mood: bold, raw, confident, playful
fits: dev tools, portfolios, indie products, youth brands, landing pages
avoid-for: dense enterprise dashboards, medical or legal trust surfaces, long-form reading
---

# Neobrutalism

Flat color, thick borders, hard offset shadows, zero blur, zero gradients.
Everything looks deliberately constructed, nothing looks polished smooth.

## Tokens

```css
:root {
  --nb-border: 3px solid #111111;
  --nb-shadow: 6px 6px 0 #111111;
  --nb-shadow-hover: 2px 2px 0 #111111;
  --nb-radius: 0px;            /* or one value 4-8px, used EVERYWHERE */
  --nb-bg: #f5f1e8;            /* warm off-white, never pure white */
  --nb-ink: #111111;
  --nb-accent: #ff5c00;        /* one loud accent: orange, lime, cyan, or pink */
  --nb-accent-2: #8b5cf6;      /* optional second, use under 10% of surface */
  --nb-font-display: 'Archivo Black', 'Inter', sans-serif;
  --nb-font-body: 'Inter', 'Public Sans', sans-serif;
}
```

## Rules

- Borders: 2-4px solid, near-black (#111), on EVERY interactive element.
- Shadows: hard offset only (x=y, 4-8px, 0 blur, 0 spread, solid #111). Never box-shadow blur.
- Hover: element translates toward the shadow (translate(4px, 4px)) while the shadow shrinks to 2px - the "press" effect. Transition 80-120ms linear, never ease.
- Radius: pick 0px OR one small value (4-8px). Same value on every element. Mixing radii is the number one fake-neobrutalism tell.
- Color: 60% background, 25% ink, 15% accent. Saturated accents on desaturated ground.
- Type: display font 700-900 weight, sizes jump big (2x scale steps: 16/32/64). Body stays 16-18px.
- Spacing: chunky and even - 8px base grid, generous padding (16-24px inside cards/buttons).
- Rotation: at most ONE element per screen gets a small tilt (1-3deg) - a sticker, a badge. More is noise.

## Component recipes

```css
.nb-button {
  border: var(--nb-border); box-shadow: var(--nb-shadow);
  background: var(--nb-accent); color: var(--nb-ink);
  padding: 12px 24px; font-weight: 800; border-radius: var(--nb-radius);
  transition: transform 100ms linear, box-shadow 100ms linear;
}
.nb-button:hover { transform: translate(4px, 4px); box-shadow: var(--nb-shadow-hover); }
.nb-card {
  border: var(--nb-border); box-shadow: var(--nb-shadow);
  background: #ffffff; border-radius: var(--nb-radius); padding: 24px;
}
.nb-input {
  border: var(--nb-border); background: #ffffff; padding: 12px 16px;
  border-radius: var(--nb-radius); box-shadow: none;
}
.nb-input:focus { outline: none; box-shadow: 4px 4px 0 var(--nb-accent); }
```

## Anti-patterns

- Soft drop shadows or any blur radius above 0: instantly reads as Bootstrap-with-borders.
- Gradients anywhere. Flat color only.
- Thin 1px borders: too timid, the style needs weight.
- Pure white background: use warm or cool off-whites.
- Every card tilted: one tilt is a wink, five is a mess.

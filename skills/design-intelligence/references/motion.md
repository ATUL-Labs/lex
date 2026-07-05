# Motion

## Recipes

Entrance (fade-up): opacity 0->1, translateY(12px)->0, 350ms cubic-bezier(0.16, 1, 0.3, 1). Stagger children 40-60ms apart, cap at 6 staggered items, then batch the rest with no added delay.

Hover: transform-only, scale(1.02) or translateY(-2px), 150-200ms ease-out. Never animate color and size in the same transition; pick one.

Scroll reveal: IntersectionObserver at 15% threshold (rootMargin "0px", threshold: 0.15). Fires once, then unobserve the element. No re-trigger on scroll back up.

Page transition: 200ms fade on content only (opacity 0->1). Never animate chrome (nav, sidebar, header) during route changes.

Micro-feedback: button press scale(0.97) over 80ms ease-out, release back to scale(1) over 100ms. Checkbox check uses a spring (stiffness 400, damping 25) not a linear tween.

## Rules

- Nothing over 500ms. If it feels slow, cut duration before adding easing tricks.
- No infinite loops outside of loading indicators.
- prefers-reduced-motion is mandatory on every animated component. Ship this block verbatim:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- 60fps means animating only `transform` and `opacity`. Anything that touches layout (width, height, top, left, margin) will drop frames.

## Anti-patterns

- Bounce or elastic easings on professional/enterprise surfaces (fintech, docs, admin tools). Reserve bounce for playful consumer brands only, and even then use sparingly.
- Parallax scrolling. It reads as dated, hurts performance, and breaks reduced-motion expectations.
- Animating on every scroll tick (scroll-linked transforms without throttling). Use IntersectionObserver instead of a scroll listener for reveal effects.

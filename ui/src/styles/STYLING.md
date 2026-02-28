# Styling Contract

This project is **CSS Modules first**.

## Rules

1. Use `*.module.css` for component styles and layout.
2. Use `src/styles/globals.css` only for:
   - reset/base layer
   - app-wide element behavior
   - third-party style overrides
3. Use `src/styles/variables.css` as the single source of theme tokens.
4. Tailwind is retained as infrastructure and optional utility support, not as the default styling authoring model.
5. Avoid adding new utility-class-heavy JSX where module classes are clearer.

## Theme Tokens

- Use CSS custom properties (for example `var(--neutral-900)`) in modules.
- Keep token names synchronized with `tailwind.config.cjs` mappings.

## Imports

- Global styles are imported once in `src/main.tsx`.
- Component files should not import global style files directly.

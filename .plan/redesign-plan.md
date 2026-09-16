# Duolingo-Style Redesign Plan

## Overview

Redesign the counter page (and update global tokens) to follow the Duolingo design language: playful, sticker-like UI on a pure white canvas with bold green accents, thick borders, 12px radius everywhere, and Nunito-based typography.

## Files to Modify

### 1. `app/globals.css` — Theme Tokens (Global)

Replace the oklch color system with Duolingo's hex-based palette.

**Color changes:**
| Token | Current (oklch) | New (Duolingo) | Notes |
|-------|-----------------|----------------|-------|
| `--background` | `oklch(0.982 0.006 100)` | `#ffffff` | Pure white paper canvas |
| `--foreground` | `oklch(0.24 0.02 145)` | `#4b4b4b` | Charcoal (body/dark text) |
| `--card` | `oklch(1 0 0)` | `#ffffff` | White card surfaces |
| `--card-foreground` | `oklch(0.24 0.02 145)` | `#4b4b4b` | |
| `--popover` | `oklch(1 0 0)` | `#ffffff` | |
| `--popover-foreground` | `oklch(0.24 0.02 145)` | `#4b4b4b` | |
| `--primary` | `oklch(0.465 0.105 156)` | `#58cc02` | Eager Green |
| `--primary-foreground` | `oklch(0.985 0.003 152)` | `#ffffff` | Paper White |
| `--secondary` | `oklch(0.955 0.016 145)` | `#d7ffb8` | Storybook Green (light tint) |
| `--secondary-foreground` | `oklch(0.4 0.05 150)` | `#4b4b4b` | |
| `--muted` | `oklch(0.958 0.009 120)` | `#f7f7f7` | Very light gray |
| `--muted-foreground` | `oklch(0.515 0.02 140)` | `#777777` | Pencil Gray |
| `--accent` | `oklch(0.93 0.035 145)` | `#d7ffb8` | Storybook Green |
| `--accent-foreground` | `oklch(0.42 0.07 152)` | `#4b4b4b` | |
| `--destructive` | `oklch(0.585 0.233 27.325)` | `#ff4b4b` | Keep as red |
| `--border` | `oklch(0.915 0.012 115)` | `#afafaf` | Faded Gray (thicker feel) |
| `--input` | `oklch(0.895 0.012 120)` | `#afafaf` | Faded Gray |
| `--ring` | `oklch(0.5 0.11 156)` | `#58cc02` | Green focus ring |

**New custom properties to add:**
- `--color-eager-green: #58cc02`
- `--color-storybook-green: #d7ffb8`
- `--color-spark-blue: #1cb0f6`
- `--color-fresh-leaf: #a5ed6e`
- `--color-night-ink: #000437`
- `--color-charcoal: #4b4b4b`
- `--color-pencil-gray: #777777`
- `--color-faded-gray: #afafaf`

**Sidebar colors** (keep the deep-pine sidebar but adapt slightly):
- `--sidebar`: `#1a3a2a` (deep forest green, stays dark)
- `--sidebar-primary`: `#58cc02` (match the eager green)
- `--sidebar-foreground`: `#e0e0e0`

**Typography:**
- Import `Nunito` (700, 800, 900) from Google Fonts for display/headings (substitute for Feather)
- Import `Nunito Sans` (400, 500, 600, 700) from Google Fonts for body (substitute for duolingo-sans)
- Set `--font-sans: 'Nunito Sans', ...`
- Set `--font-heading: 'Nunito', ...`

**Border radius:**
- `--radius: 0.75rem` (12px — Duolingo's standard)
- All components already use `rounded-lg`/`rounded-xl` which maps well

**Custom utilities:**
- Update `card` utility: remove box-shadow, add `border-2 border-border` (thick sticker-like border)
- Update `card-hover`: thick border, no shadow, slight scale on hover

### 2. `components/ui/button.tsx` — Button Component

**Changes:**
- Default variant: `bg-primary text-white border-2 border-primary` (thick green fill, no shadow)
- Outline variant: `border-2 border-faded-gray text-spark-blue` (thick gray border, blue text)
- Ghost variant: `text-charcoal hover:bg-storybook-green`
- Secondary variant: `bg-secondary text-charcoal border-2 border-secondary`
- All buttons get `rounded-[12px]` (already have `rounded-lg` = 8px, need to bump)
- Size lg: increase padding, make sticker-like
- Remove all `shadow-*` classes from buttons
- Add `font-bold` to all button text
- Primary buttons: uppercase, letter-spacing 0.053em, font-size 13-15px

### 3. `components/ui/badge.tsx` — Badge Component

**Changes:**
- Default variant: `bg-eager-green text-white border-0`
- Muted variant: `bg-muted text-pencil-gray border border-faded-gray`
- Warning: `bg-amber-100 text-amber-800 border border-amber-300`
- Destructive: `bg-red-100 text-red-600 border border-red-300`
- All badges: `rounded-full` (already `rounded-4xl` which is pill-shaped — good)

### 4. `components/ui/input.tsx` — Input Component

**Changes:**
- Border: `border-2 border-faded-gray` (thicker border)
- Focus: `border-eager-green ring-0` (green border on focus, no ring)
- Radius: `rounded-[12px]`
- Font: inherit from Nunito Sans

### 5. `app/counter-client.tsx` — Counter Page (Main)

This is the largest change. The layout stays the same (two-column) but the visual language changes dramatically.

**Masthead:**
- Store icon badge: `bg-eager-green text-white rounded-[12px]` (green sticker)
- Date/time: `font-heading font-bold text-charcoal`
- Stats: pencil-gray text, green cash amount
- Products/Scan buttons: sticker-like with thick borders

**Search bar:**
- `h-14 rounded-[12px] border-2 border-faded-gray`
- No shadow, flat white background
- Green border on focus
- Scan icon in pencil-gray

**Fast picks section:**
- Buttons: `bg-storybook-green text-charcoal border-2 border-eager-green rounded-[12px]`
- Pill-shaped, sticker feel

**Category chips:**
- Active: `bg-eager-green text-white border-2 border-eager-green`
- Inactive: `bg-white text-charcoal border-2 border-faded-gray`
- Rounded pill shape

**Product grid tiles:**
- `border-2 border-faded-gray rounded-[12px] bg-white`
- No shadow
- Hover: `border-eager-green`
- Name: `font-heading font-bold text-charcoal`
- Price: pencil-gray
- Stock badge: colored pill

**Bill section:**
- Card: `border-2 border-faded-gray rounded-[12px] bg-white` (no shadow)
- Header: "Bill" in `font-heading font-bold text-charcoal`
- Retail/Wholesale toggle: sticker pills, active = `bg-eager-green text-white`, inactive = `border-2 border-faded-gray text-pencil-gray`
- Customer picker: thick-bordered input

**Cart lines:**
- Quantity stepper: `border-2 border-faded-gray rounded-[12px]`
- +/- buttons: `hover:bg-storybook-green`
- Product name: `font-heading font-bold text-charcoal`
- Subtotal: `font-bold text-charcoal`

**Total bar:**
- `bg-eager-green text-white rounded-[12px]` (green banner, not a card)
- Total label: white/80
- Total amount: `font-heading text-3xl font-bold text-white`

**Action buttons:**
- Hold: `border-2 border-faded-gray text-charcoal rounded-[12px]` (outlined, no green)
- Checkout: `bg-night-ink text-white rounded-[12px]` (dark CTA, sticker-like)
- Or checkout could be `bg-eager-green text-white` — need to decide

**Held bills:**
- `border-2 border-faded-gray rounded-[12px] bg-white`
- Restore button: outlined sticker
- Delete: ghost, red on hover

**Mobile bottom bar:**
- `bg-white border-t-2 border-faded-gray`
- Checkout button: `bg-eager-green text-white rounded-[12px]`

### 6. `components/sidebar.tsx` — Sidebar

**Changes:**
- Desktop rail: Keep dark but change to `#1a3a2a` (deep forest)
- Active nav item: `bg-eager-green text-white rounded-[12px]`
- Inactive: `text-white/60 hover:bg-white/10`
- Section labels: `text-white/40 uppercase tracking-wider text-xs font-bold`
- Logo badge: `bg-eager-green text-white rounded-[12px]`
- Mobile top bar: `bg-sidebar text-white`

### 7. `app/layout.tsx` — Root Layout

**Changes:**
- Add Google Fonts import for Nunito and Nunito Sans
- Or use `next/font/google` for optimal loading
- Add font classes to `<html>` or `<body>`

### 8. `components/ui/select.tsx` — Select Component

**Changes:**
- Trigger: `border-2 border-faded-gray rounded-[12px]`
- Focus: `border-eager-green`
- Content: `border-2 border-faded-gray rounded-[12px] bg-white shadow-lg`
- Items: `rounded-[8px]`, hover bg = storybook-green

### 9. `components/ui/card.tsx` — Card Component (if exists)

Update to use thick borders and no shadows.

## Implementation Order

1. **globals.css** — Update tokens, fonts, custom utilities (foundation)
2. **layout.tsx** — Add font imports
3. **button.tsx** — Update button variants (affects everything)
4. **badge.tsx** — Update badge variants
5. **input.tsx** — Update input styling
6. **select.tsx** — Update select styling
7. **sidebar.tsx** — Update sidebar to match
8. **counter-client.tsx** — The big one: restyle the entire counter page
9. **Verify** — Run `npm run build` or `next dev` to check for errors

## Key Design Principles

1. **Flat sticker-like surfaces**: No shadows, thick 2px borders, 12px radius
2. **Green for progress**: `#58cc02` on headings, CTAs, active states
3. **Charcoal for headings**: `#4b4b4b` for text that leads
4. **Pencil gray for body**: `#777777` for supporting text
5. **White canvas**: Pure white backgrounds everywhere
6. **Thick borders**: 2px solid in `#afafaf` or green for emphasis
7. **Pill shapes**: Everything rounded, no sharp corners
8. **Uppercase labels**: Nav and section labels in uppercase with tracking
9. **Nunito typography**: Rounded, playful, mascot-friendly

## Risk Assessment

- **Low risk**: Token changes in globals.css — purely visual
- **Low risk**: Button/badge/input/select changes — isolated components
- **Medium risk**: counter-client.tsx — large file, many inline classes, but changes are purely visual
- **Low risk**: Sidebar — straightforward restyling
- **No risk**: No logic changes, only CSS/styling modifications

## Verification

1. Run `npm run dev` and check the counter page
2. Verify all interactive elements work (search, cart, checkout, held bills)
3. Check mobile responsiveness
4. Verify the sidebar navigation still works
5. Check that the checkout dialog still looks good

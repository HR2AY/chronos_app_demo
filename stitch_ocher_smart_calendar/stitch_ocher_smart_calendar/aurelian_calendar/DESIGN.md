---
name: Aurelian Calendar
colors:
  surface: '#faf9fe'
  surface-dim: '#dad9df'
  surface-bright: '#faf9fe'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f3f8'
  surface-container: '#eeedf3'
  surface-container-high: '#e9e7ed'
  surface-container-highest: '#e3e2e7'
  on-surface: '#1a1b1f'
  on-surface-variant: '#4f4634'
  inverse-surface: '#2f3034'
  inverse-on-surface: '#f1f0f5'
  outline: '#817662'
  outline-variant: '#d3c5ae'
  surface-tint: '#795900'
  primary: '#795900'
  on-primary: '#ffffff'
  primary-container: '#d4a017'
  on-primary-container: '#503a00'
  inverse-primary: '#f6be39'
  secondary: '#5e5e5e'
  on-secondary: '#ffffff'
  secondary-container: '#e2e2e2'
  on-secondary-container: '#646464'
  tertiary: '#5d5e63'
  on-tertiary: '#ffffff'
  tertiary-container: '#a7a8ad'
  on-tertiary-container: '#3b3d41'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdfa0'
  primary-fixed-dim: '#f6be39'
  on-primary-fixed: '#261a00'
  on-primary-fixed-variant: '#5c4300'
  secondary-fixed: '#e2e2e2'
  secondary-fixed-dim: '#c6c6c6'
  on-secondary-fixed: '#1b1b1b'
  on-secondary-fixed-variant: '#474747'
  tertiary-fixed: '#e2e2e7'
  tertiary-fixed-dim: '#c6c6cb'
  on-tertiary-fixed: '#1a1c1f'
  on-tertiary-fixed-variant: '#45474b'
  background: '#faf9fe'
  on-background: '#1a1b1f'
  surface-variant: '#e3e2e7'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 34px
    fontWeight: '700'
    lineHeight: 41px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 22px
    letterSpacing: -0.01em
  body-sm:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: '0'
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: '0'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  margin-mobile: 16px
  margin-desktop: 32px
  gutter: 12px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 24px
---

## Brand & Style

This design system embodies a "High-Utility Minimalist" aesthetic, blending the rigorous clarity of iOS design patterns with a warm, earthy sophistication. The target audience is the focused professional who values intentionality and a clutter-free cognitive environment.

The visual narrative is driven by extreme reduction—stripping away unnecessary ornamentation to let the content (time and tasks) breathe. The emotional response is one of calm authority and quiet elegance. The style utilizes **Minimalism** with a touch of **Corporate/Modern** precision, characterized by generous negative space, high-contrast legibility, and a singular, purposeful accent color that guides the eye without overstimulating the senses.

## Colors

The palette is strictly curated to ensure maximum focus. 

- **Primary Background (#FFFFFF):** Used for the main canvas and primary cards to create a sense of openness.
- **Secondary Background (#F2F2F7):** Derived from iOS standards, used for grouping elements, list backgrounds, and inset surfaces to provide subtle depth.
- **Primary Text (#000000):** Pure black for maximum contrast and readability on all headings and body copy.
- **Accent (#D4A017):** An earthy ochre/mustard used exclusively for calls to action, current day indicators, and high-priority status marks.
- **Muted Text (#8E8E93):** Used for secondary labels, hints, and deactivated states.

## Typography

The system utilizes **Inter** for its neutral, systematic, and highly legible qualities, mimicking the functional clarity of San Francisco. 

- **Hierarchy:** Use `display-lg` for month headers and large screen titles. `headline-md` is reserved for modal titles and primary card headings.
- **Body:** `body-lg` is the standard for list items and event descriptions, ensuring an "iOS-native" feel.
- **System Labels:** Use `label-caps` for small sub-headers (e.g., "UPCOMING") to create a clear structural break in lists.
- **Tracking:** Tighten letter spacing slightly for larger display sizes to maintain a premium, editorial look.

## Layout & Spacing

This design system employs a **Fluid Grid** logic optimized for touch interfaces. 

- **Base Unit:** A 4px baseline grid governs all spacing to ensure mathematical harmony.
- **Mobile Layout:** 16px horizontal margins with content spanning a single fluid column. Lists and cards should stretch to the margin edges.
- **Desktop/Tablet:** Content should be centered within a max-width container (approx. 1024px) or displayed in a multi-pane layout (Sidebar + Main Calendar).
- **Rhythm:** Use `stack-md` (16px) for the majority of vertical gaps between unrelated elements, and `stack-sm` (8px) for related content like a title and its supporting subtitle.

## Elevation & Depth

Depth is achieved through **Tonal Layers** and **Ambient Shadows** rather than heavy borders.

- **Level 0 (Base):** `#F2F2F7` - The canvas background.
- **Level 1 (Cards/Lists):** `#FFFFFF` - Elevated surfaces. Use a very soft, diffused shadow: `0px 4px 12px rgba(0, 0, 0, 0.05)`.
- **Interactions:** When a list item or card is pressed, it should subtly scale down (to 0.98) or change its background color to a slightly darker gray (`#E5E5EA`) to provide tactile feedback.
- **Modals:** Use a standard iOS "sheet" metaphor, sliding up from the bottom with a backdrop blur (Material 0.8 opacity white) behind the sheet.

## Shapes

The shape language follows the "Continuous Curve" philosophy of modern mobile OS design.

- **Primary Radius:** 0.5rem (8px) for standard buttons and small input fields.
- **Large Radius:** 1rem (16px) for main calendar cards and modal containers (equivalent to `rounded-lg`).
- **Pill Shape:** Use for status indicators, chips, and the "Current Day" highlight in the calendar grid.
- **Dividers:** 0.5pt hairline strokes in `#C6C6C8` should be used sparingly between list items, inset by 16px from the left to maintain alignment with text.

## Components

### Buttons
- **Primary:** Earthy Yellow (`#D4A017`) background with white text. Pill-shaped or 8px rounded corners.
- **Secondary:** Transparent background with `#D4A017` text. High-contrast and minimal.

### Calendar Grid
- **Current Day:** High-contrast circle (Accent color) with white text.
- **Selected Day:** Black circle with white text.
- **Today (Unselected):** Accent color text without a background.
- **Grid Lines:** Minimal or non-existent; use whitespace to define the 7-column structure.

### List Items (iOS Style)
- **Container:** White background, 44px minimum height.
- **Structure:** Optional icon on left, primary text, trailing chevron or metadata (time) on the right in muted gray.

### Input Fields
- **Style:** Underlined or softly inset with `#F2F2F7`. Focus state is indicated by a 2px bottom border in the Earthy Yellow accent.

### Toggles
- Standard iOS-style switch. When "On," the background should be the Earthy Yellow (`#D4A017`) rather than the standard green.

### Cards
- White surfaces on the gray background. Subtle shadows only. No heavy borders. Used for individual event details or "Day at a Glance" summaries.
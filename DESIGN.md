---
name: Gooes Admin
description: Tenant-side装修 operations workbench for project, construction, acceptance, and customer workflows.
colors:
  background: "#fffdf5"
  foreground: "#141414"
  card: "#ffffff"
  primary: "#121212"
  primary-foreground: "#ffd449"
  secondary: "#fff5cf"
  secondary-foreground: "#4d3b00"
  muted: "#fff7df"
  muted-foreground: "#616161"
  accent: "#ffd449"
  accent-foreground: "#141414"
  destructive: "#d82020"
  success: "#3e6f4d"
  warning: "#f3b400"
  border: "#e7dfd0"
  input: "#ded3c4"
  goose-yellow: "#f3b400"
  goose-yellow-soft: "#ffd449"
  goose-cream: "#fffdf6"
  goose-ink: "#141414"
  goose-brown: "#4d3b00"
typography:
  title:
    fontFamily: "Avenir Next, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0"
  body:
    fontFamily: "Avenir Next, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "Avenir Next, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "0"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  page-x: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "8px 16px"
  input-default:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "8px 12px"
  card-default:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "20px"
---

# Design System: Gooes Admin

## 1. Overview

**Creative North Star: "The Yellow Site Ledger"**

Gooes Admin is a product workbench for装修 operations. It should feel like a clear site ledger: concrete, task-first, and readable under daily pressure. The yellow and black identity is recognizable, but the interface remains quiet enough for dense project, customer, stage, and acceptance data.

The system rejects oversized SaaS landing-page composition, dark control-room dashboards, decorative card stacks, generic glass effects, AI-purple gradients, and sparse layouts that hide operational density. Familiar admin conventions are an asset here: users should trust buttons, tabs, dialogs, badges, and list panels without pausing to decode them.

**Key Characteristics:**
- Compact shadcn/Radix components with 8px maximum default radius.
- Warm workbench background with white operational surfaces.
- Black primary actions with yellow foreground for brand recognition.
- Yellow accent reserved for current state, focus, and primary attention.
- Semantic badges for success, warning, danger, and disabled states.

## 2. Colors

The palette is a restrained product palette: warm near-white surfaces, black ink, Gooes yellow as the brand accent, and standard semantic states for operations.

### Primary
- **Workbench Ink** (`#141414` / `#121212`): primary text, default button background, shell identity, and high-confidence actions.
- **Gooes Yellow** (`#f3b400` / `#ffd449`): brand marker, selection, ring, primary foreground, and focused attention. Use it sparingly so it keeps meaning.

### Secondary
- **Warm Permission Surface** (`#fff5cf`): secondary buttons, tabs list backgrounds, light brand panels, and quiet selected states.
- **Operational Brown** (`#4d3b00`): sidebar meta text and text on warm yellow surfaces.

### Neutral
- **Workbench Cream** (`#fffdf5` / `#fffdf6`): page and console background.
- **Card White** (`#ffffff`): dialogs, panels, repeated cards, and focused work areas.
- **Muted Warm Surface** (`#fff7df`): low-emphasis backgrounds and hover areas.
- **Muted Text** (`#616161`): secondary descriptions, timestamps, hints, and inactive labels.
- **Warm Border** (`#e7dfd0`): dividers, card borders, tabs, and form control outlines.

### Named Rules

**The Yellow Earns Its Place Rule.** Yellow marks brand identity, active selection, focus, and primary attention. Do not use it as ambient decoration across every panel.

**The Semantic Status Rule.** Completion uses success green, pending/risk uses warning yellow, destructive/failure uses red. Do not encode operational status with arbitrary accent colors.

## 3. Typography

**Display Font:** Avenir Next, PingFang SC, Microsoft YaHei, sans-serif
**Body Font:** Avenir Next, PingFang SC, Microsoft YaHei, sans-serif
**Label/Mono Font:** Same family unless a technical code value requires monospace locally.

**Character:** One practical sans stack carries the whole product. Chinese labels, statuses, names, and operational copy should stay compact and legible instead of using display-style typography.

### Hierarchy
- **Title** (600, 16-18px, tight line-height): dialog titles, card titles, section headings.
- **Body** (400-500, 14px, 1.5 line-height): normal admin content, table/list text, descriptions.
- **Small Body** (400-500, 12px, 1.25-1.4 line-height): timestamps, helper text, dense metadata, compact badges.
- **Label** (500-600, 12-14px): form labels, segmented controls, tabs, row action labels.

### Named Rules

**The No Hero Type Rule.** Admin panels do not use hero-scale text. Project names and acceptance titles should fit dense dialogs and side panels without wrapping over controls.

## 4. Elevation

Depth is mostly conveyed through borders, tonal layering, sticky headers, and small shadows. Shadows are allowed for the app shell, dialogs, and brand logo treatment; normal cards stay light and structural, not decorative.

### Shadow Vocabulary
- **Card Rest** (`shadow-sm`): standard card and contained surface, paired with a subtle border.
- **Header Lift** (`0 8px 24px rgba(17,17,17,0.06)`): sticky top header separation.
- **Logo Lift** (`0 8px 18px rgba(17,17,17,0.08)`): small identity mark only.
- **Dialog Lift** (`shadow-lg`): modal content over a `bg-foreground/35` overlay.

### Named Rules

**The Structural Depth Rule.** Use shadows to separate layers that physically overlap. Use borders and spacing for ordinary grouping.

## 5. Components

### Buttons
- **Shape:** compact rounded rectangle, 6px radius by default.
- **Primary:** black background with yellow text, 36px height, 14px medium label, icon gap of 8px.
- **Hover / Focus:** opacity or token background shift; focus uses the yellow ring token with visible 2px ring.
- **Secondary / Ghost / Outline:** secondary uses warm yellow surface; outline uses border plus background hover; ghost is for row/sidebar actions and icon controls.

### Chips
- **Style:** `Badge` uses 12px text, 2px x-padding, 4-6px rounded corners, and semantic fill.
- **State:** success, warning, danger, secondary, and outline variants must carry status meaning. Avoid plain text statuses in dense panels.

### Cards / Containers
- **Corner Style:** 8px maximum default radius.
- **Background:** white card surfaces on warm workbench background.
- **Shadow Strategy:** card rest is subtle; dense sidebars and inner panels may use only border and background.
- **Border:** warm low-contrast border is the default grouping tool.
- **Internal Padding:** 20px for cards and dialog sections; 12px for compact nested operational rows.

### Inputs / Fields
- **Style:** 40px height, 6px radius, warm border, page-background fill, 14px text.
- **Focus:** no outline reset without replacement; use 2px ring with ring token.
- **Error / Disabled:** disabled opacity and cursor state are required; field errors should appear near the field.

### Navigation
- **Style:** fixed left sidebar and sticky top header. Active navigation uses clear contrast, not decorative gradients.
- **Typography:** 14px primary nav, 12px metadata.
- **Responsive:** large screens reserve sidebar width; smaller screens should preserve access without squeezing text into unreadable controls.

### Dialogs And Task Panels

Dialogs use fixed viewport-aware height when they contain tabs or workflow panels. Tabs sit at the top, content scrolls within the active panel, and action controls remain discoverable. Avoid putting a full page of nested cards inside a modal; use sidebars, split panes, borders, and sticky summary areas when the workflow is dense.

## 6. Do's and Don'ts

### Do:
- **Do** use existing shadcn/Radix primitives and local Gooes tokens before adding custom component vocabulary.
- **Do** keep admin screens operational, scannable, and dense enough for repeated use.
- **Do** use Gooes yellow for active state, focus, and primary attention only.
- **Do** show loading, empty, disabled, permission-blocked, and error states near the control or panel they affect.
- **Do** keep icon buttons stable at 32-40px and use lucide-react icons consistently.
- **Do** preserve readable Chinese text at 12-14px in dense metadata and 14-16px in primary content.

### Don't:
- **Don't** use oversized SaaS landing-page composition in authenticated admin surfaces.
- **Don't** use dark control-room dashboards as the default admin direction.
- **Don't** build decorative card stacks or cards inside cards for ordinary page sections.
- **Don't** use generic glass effects, AI-purple gradients, or decorative background orbs.
- **Don't** hide operational density behind excessive whitespace or marketing copy.
- **Don't** use yellow as a blanket background for every panel.
- **Don't** let long project names, stage labels, buttons, tabs, or badges overflow their containers.

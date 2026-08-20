---
name: 好店智装云 Admin
description: Tenant-side renovation operations workbench for project, construction, acceptance, and customer workflows.
colors:
  background: "#f8fafc"
  foreground: "#0c2f45"
  card: "#ffffff"
  primary: "#09598b"
  primary-foreground: "#ffffff"
  secondary: "#e6eef5"
  secondary-foreground: "#0f3a57"
  muted: "#eef3f6"
  muted-foreground: "#616161"
  accent: "#ff7029"
  accent-foreground: "#0c2f45"
  destructive: "hsl(0 74% 48%)"
  destructive-foreground: "#ffffff"
  success: "hsl(139 28% 34%)"
  success-foreground: "#ffffff"
  warning: "hsl(44 100% 48%)"
  warning-foreground: "hsl(46 100% 15%)"
  disabled-surface: "#eef3f6"
  disabled-foreground: "#616161"
  border: "#d3dce4"
  input: "#c6d2dc"
  ring: "#09598b"
  haodian-blue: "#095488"
  haodian-blue-soft: "#d7e7f1"
  haodian-orange: "#ff7029"
  haodian-neutral: "#f8fafc"
  haodian-ink: "#0c2f45"
  legacy-shell-deep-blue: "#0b2f46"
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

# Design System: 好店智装云 Admin

## 1. Overview

**Creative North Star: "The Blue Project Ledger"**

好店智装云 Admin is a product workbench for renovation operations. It should feel like a clear project ledger: concrete, task-first, and readable under daily pressure. Deep blue establishes a trustworthy platform identity, orange provides limited emphasis, and neutral surfaces keep dense project, customer, stage, and acceptance data easy to scan.

The system rejects oversized SaaS landing-page composition, dark control-room dashboards, decorative card stacks, generic glass effects, decorative gradients, glow orbs, and sparse layouts that hide operational density. Familiar admin conventions are an asset here: users should trust buttons, tabs, dialogs, badges, and list panels without pausing to decode them.

The solid-color rule in this document applies to the tenant Admin and platform super-admin only. The independent website adds no new gradients in this brand refresh. Existing H5 and Douyin mini-program gradients used as image-readability overlays are intentionally unchanged and are not governed by the Admin rule.

**Key Characteristics:**
- Compact shadcn/Radix components with 8px maximum default radius.
- Cool neutral workbench background with white operational surfaces.
- Deep-blue primary actions with white foreground for clear hierarchy.
- Orange reserved for small brand accents; current selection and focus use deep blue.
- Semantic badges for success, warning, danger, and disabled states.
- Solid-color Admin surfaces without decorative gradients or simulated glow.

## 2. Colors

The palette is restrained and operational: Haodian deep blue for platform identity and primary interaction, orange for limited emphasis, cool neutral surfaces for information density, and independent semantic colors for business status.

### Primary
- **Haodian Blue** (`hsl(203 88% 29%)`, rendered approximately `#09598b`; brand asset reference `#095488`): shell identity, primary actions, focus ring, and current selection.
- **Haodian Ink** (`hsl(204 70% 16%)`, approximately `#0c2f45`): the canonical foreground and accent foreground for primary text and text on orange accent surfaces.

### Secondary
- **Haodian Orange** (`hsl(20 100% 58%)`, `#ff7029`): small identity marks and scarce emphasis. It is not a primary action or status color.
- **Blue Secondary Surface** (`hsl(205 42% 93%)`, `#e6eef5`): secondary buttons, quiet selected states, and low-emphasis brand panels.
- **Secondary Ink** (`hsl(204 70% 20%)`, `#0f3a57`): readable text on the blue secondary surface.

### Neutral
- **Workbench Neutral** (`hsl(210 33% 98%)`, `#f8fafc`): page and console background.
- **Card White** (`#ffffff`): dialogs, panels, repeated cards, and focused work areas.
- **Muted Neutral Surface** (`hsl(207 33% 95%)`, `#eef3f6`): low-emphasis backgrounds and hover areas.
- **Muted Text** (`#616161`): secondary descriptions, timestamps, hints, and inactive labels.
- **Cool Border** (`hsl(207 24% 86%)`, `#d3dce4`): dividers, card borders, tabs, and form control outlines.

### Status
- **Destructive:** `hsl(0 74% 48%)` with white foreground.
- **Success:** `hsl(139 28% 34%)` with white foreground.
- **Warning:** `hsl(44 100% 48%)` with `hsl(46 100% 15%)` foreground. Brand orange must not replace this warning pair.
- **Disabled:** use the muted surface and muted foreground tokens, plus disabled state, cursor, label, or icon treatment. Never communicate disabled state through color alone.

Status text and meaning-bearing icons at normal UI sizes must keep at least a 4.5:1 contrast ratio and must not rely on color as the only status signal.

### Legacy Compatibility Identifiers

`--goose-yellow`, `--goose-yellow-soft`, `--goose-cream`, `--goose-cream-deep`, `--goose-ink`, `--goose-brown`, `--goose-surface-warm`, `themeTokens.goose`, and `goose-workbench-bg` are all internal compatibility-layer identifiers retained to avoid breaking existing theme storage, CSS selectors, and component references. None of their names defines current color semantics, and new code must not depend on their literal meaning. New code should prefer semantic tokens such as `primary`, `accent`, `foreground`, and `background`; this brand refresh does not rename the compatibility identifiers.

The canonical Haodian Ink is `hsl(204 70% 16%)` (approximately `#0c2f45`). The existing `--goose-ink: #0b2f46` value is only a compatible shell/deep-blue alias and does not define a second canonical foreground.

### Named Rules

**The Blue Leads Rule.** Deep blue owns platform identity, primary actions, focus, and current selection. Do not spread brand color across every panel; neutral surfaces should carry most operational content.

**The Orange Stays Legible Rule.** Orange is a scarce accent, never a substitute for the primary action or a business status. Orange surfaces use Haodian Ink (`hsl(204 70% 16%)`), not white text; the implemented pair has a 5.068:1 contrast ratio and meets WCAG AA for normal text.

**The Semantic Status Rule.** Completion uses success green with white foreground, pending/risk uses the warning token with its dark warning foreground, and destructive/failure uses red with white foreground. Disabled controls use muted surface/foreground plus a non-color state cue. Do not use brand orange or arbitrary brand colors to encode operational status.

**The Solid Admin Rule.** Tenant Admin and platform super-admin surfaces must not use `linear-gradient`, `radial-gradient`, `conic-gradient`, or `bg-gradient-*` for decoration. Do not add glow orbs or imitate a gradient with layered shadows. The independent website adds no new gradient in this refresh; existing H5 and Douyin mini-program image-readability gradients remain outside this Admin-only rule.

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

Depth is mostly conveyed through borders, solid tonal layering, sticky headers, and small shadows. Shadows are allowed for the app shell, dialogs, and brand logo treatment; normal cards stay light and structural, not decorative. Shadows must describe physical overlap, not simulate gradients or ambient glow.

### Shadow Vocabulary
- **Card Rest** (`shadow-sm`): standard card and contained surface, paired with a subtle border.
- **Header Lift** (`0 8px 24px rgba(12,47,69,0.06)`): sticky top header separation.
- **Logo Lift** (`0 8px 18px rgba(12,47,69,0.08)`): small identity mark only.
- **Dialog Lift** (`shadow-lg`): modal content over a `bg-foreground/35` overlay.

### Named Rules

**The Structural Depth Rule.** Use shadows to separate layers that physically overlap. Use borders and spacing for ordinary grouping.

## 5. Components

### Buttons
- **Shape:** compact rounded rectangle, 6px radius by default.
- **Primary:** deep-blue background with white text, 36px height, 14px medium label, icon gap of 8px.
- **Hover / Focus:** opacity or token background shift; focus uses the deep-blue ring token with a visible 2px ring.
- **Secondary / Ghost / Outline:** secondary uses the light-blue secondary surface; outline uses border plus neutral background hover; ghost is for row/sidebar actions and icon controls.

### Chips
- **Style:** `Badge` uses 12px text, 2px x-padding, 4-6px rounded corners, and semantic fill.
- **State:** success, warning, danger, secondary, and outline variants must carry status meaning with the defined status foreground. Pair color with text or an icon, and keep normal-size status content at 4.5:1 or better. Avoid plain text statuses in dense panels.

### Cards / Containers
- **Corner Style:** 8px maximum default radius.
- **Background:** white card surfaces on the cool neutral workbench background.
- **Shadow Strategy:** card rest is subtle; dense sidebars and inner panels may use only border and background.
- **Border:** cool low-contrast border is the default grouping tool.
- **Internal Padding:** 20px for cards and dialog sections; 12px for compact nested operational rows.

### Grouped Tabs
- **Placement:** grouped tabs for peer work areas should sit directly on the
  parent card edge, usually in the card header row. Do not wrap them in a
  separate pill, segmented-control shell, tinted panel, or nested card.
- **Active State:** use text weight plus a 2px bottom border in `primary`.
  Avoid full filled backgrounds for active tabs unless the tab
  controls a compact form field rather than a page/workspace area.
- **Inactive State:** inactive tabs use muted text on the card background with
  no border box. They should read as navigation, not as secondary buttons.
- **Spacing:** keep tab labels at 14px, medium weight, with 20px horizontal
  gap between peer tabs. The tab row may share the same line as compact summary
  metadata, but should not force an extra container around that metadata.
- **Responsive:** on small screens, let the tab row scroll horizontally if
  labels cannot fit. Do not shrink text below 14px, stack tab labels into
  multiple button rows, or let badges overlap the tab row.
- **Use Cases:** use this style for same-level workspace switches such as
  `项目摄像头 / 设备接入`. Reserve heavier segmented controls for dense filters,
  binary modes, or toolbars where the control itself is the task.

### List Pages

List pages are the default pattern for customers, projects, employees, expenses,
permissions, and other repeated-record management screens. The customer list page
is the reference implementation.

#### Page Header
- Use a compact left-aligned title block, not a marketing-style hero.
- Pair the title with a 40-44px icon tile only when it improves recognition.
  The tile uses a border, `bg-card`, muted icon color, and 8px radius.
- Title size should stay around 20px (`text-xl`) with 600 weight.
- Description copy should be one operational sentence and may include the current
  filtered total, for example `当前筛选共 N 条记录`.
- Primary creation action sits on the right on desktop and wraps below on small
  screens. Use the normal primary button vocabulary.

#### Typography
- Keep the global admin font stack: `Avenir Next`, `PingFang SC`,
  `Microsoft YaHei`, `sans-serif`. Do not introduce a separate display font for
  list pages.
- Page titles use 20px (`text-xl`), 600 weight, normal tracking, and balanced
  wrapping when needed.
- Page descriptions use 14px (`text-sm`), muted foreground, and one compact
  operational sentence.
- Toolbar controls use 14px labels and placeholders. Avoid all-caps labels and
  decorative tracked text.
- Table headers use 12px, medium weight, muted foreground, and no uppercase
  tracking. They should guide scanning without competing with row content.
- Table body text uses 14px. Primary identity values such as customer names may
  use semibold weight; ordinary row values stay regular.
- Secondary metadata such as record IDs, timestamps, summaries, and helper text
  uses 12px and muted foreground.
- Use `tabular-nums` for IDs, phone numbers, dates, pagination numbers, totals,
  prices, counts, and other aligned numeric values.
- Avoid monospace for general table content. Reserve monospace only for technical
  identifiers that must visually read as code.

#### List Surface
- Use one top-level `Card` as the record workspace. Do not place cards inside it.
- Prefer a flat surface: border plus white `bg-card`; avoid decorative shadows.
- The card should fill the available page height when the list is the primary
  task. Use a vertical flex layout with `min-h-0` so the table region can scroll.
- Fixed-height list pages should constrain the page root to the available
  viewport height and hide page-level overflow. The browser/document should not
  gain a vertical scrollbar for ordinary list browsing.
- Keep the card header, table area, and footer visually separated by borders and
  tonal layering rather than stacked shadows.
- The list footer stays fixed at the bottom of the card. Pagination controls and
  record counts should not move when the table has few rows.

#### Filter Toolbar
- Filters live in the card header as a compact toolbar.
- Use select/search/button controls with the same height, radius, and border
  language. The customer page uses 36px controls for dense scanning.
- On wide screens, arrange filters in one row with a flexible search field.
  On smaller screens, allow the controls to wrap into two columns or a single
  column without shrinking text.
- Keep controls flat: `bg-card`, no extra shadows, and visible focus rings.
- Search labels and placeholders should name the searchable fields directly.

#### Data Table
- The table is the main content area and should occupy remaining card height.
- Vertical scrolling belongs inside the table region, not on the page. Keep the
  filter toolbar and pagination footer fixed within the card while table rows
  scroll between them.
- Use horizontal overflow for wide datasets instead of compressing columns until
  text becomes unreadable.
- A sticky table header is preferred inside fixed-height list cards.
- Table headers stay quiet: 12px, medium weight, muted foreground, no uppercase
  tracking.
- Row text uses the product body scale. The primary identity cell may use
  semibold weight; secondary IDs, timestamps, and metadata use muted text.
- Use `tabular-nums` for phone numbers, IDs, dates, pagination numbers, and
  numeric totals so columns and footer counts feel stable.
- Status, source, and workflow state should use semantic `Badge` variants, not
  arbitrary colors.
- Row actions stay compact on the right. Use an action menu when there are
  multiple operations.

#### Pagination Footer
- Footer content uses `border-t`, `bg-card`, and compact vertical padding.
- Left side shows page position and record counts. Right side holds previous and
  next controls.
- The page badge belongs in the footer, not the table header. It may show
  `第 page / totalPages 页`.
- Record-count copy should be direct, for example `当前显示 N 条，共 M 条`.
- Disabled pagination buttons must remain visible but subdued.

#### Loading, Empty, And Error States
- Route errors appear above the list card with the standard status alert.
- List refreshes may use a translucent in-card overlay, but the existing table
  structure should remain visible underneath.
- Empty tables should preserve the same card, toolbar, table header, and footer
  structure so the page does not jump.
- Loading states should communicate state near the list or footer. Avoid moving
  loading badges between header and footer.

### Inputs / Fields
- **Style:** 40px height, 6px radius, cool neutral border, page-background fill, 14px text.
- **Focus:** no outline reset without replacement; use 2px ring with ring token.
- **Error / Disabled:** disabled controls use muted surface/foreground plus disabled semantics and cursor treatment; never communicate the state through color alone. Field errors should appear near the field.

### Navigation
- **Style:** fixed left sidebar and sticky top header. Active navigation uses clear contrast, not decorative gradients.
- **Typography:** 14px primary nav, 12px metadata.
- **Responsive:** large screens reserve sidebar width; smaller screens should preserve access without squeezing text into unreadable controls.

### Dialogs And Task Panels

Dialogs use fixed viewport-aware height when they contain tabs or workflow panels. Tabs sit at the top, content scrolls within the active panel, and action controls remain discoverable. Avoid putting a full page of nested cards inside a modal; use sidebars, split panes, borders, and sticky summary areas when the workflow is dense.

## 6. Do's and Don'ts

### Do:
- **Do** use existing shadcn/Radix primitives and local semantic tokens before adding custom component vocabulary.
- **Do** keep admin screens operational, scannable, and dense enough for repeated use.
- **Do** use deep blue for platform identity, primary actions, focus, and current selection.
- **Do** use orange only for small brand accents and pair orange surfaces with the deep-blue accent foreground token.
- **Do** keep business status on success, warning, and destructive semantic tokens.
- **Do** show loading, empty, disabled, permission-blocked, and error states near the control or panel they affect.
- **Do** keep icon buttons stable at 32-40px and use lucide-react icons consistently.
- **Do** preserve readable Chinese text at 12-14px in dense metadata and 14-16px in primary content.

### Don't:
- **Don't** use oversized SaaS landing-page composition in authenticated admin surfaces.
- **Don't** use dark control-room dashboards as the default admin direction.
- **Don't** build decorative card stacks or cards inside cards for ordinary page sections.
- **Don't** use generic glass effects, decorative `linear`/`radial`/`conic` gradients, `bg-gradient-*`, glow orbs, or layered shadows that imitate gradients.
- **Don't** hide operational density behind excessive whitespace or marketing copy.
- **Don't** use orange as a blanket background, primary action color, or replacement for semantic status.
- **Don't** place white text on the orange accent token.
- **Don't** let long project names, stage labels, buttons, tabs, or badges overflow their containers.

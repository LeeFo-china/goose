# TDesign-Inspired Admin Principles

Sources:

- https://tdesign.tencent.com/starter/react/dashboard/base
- https://tdesign.tencent.com/starter/docs/vue/design-token
- https://tdesign.tencent.com/starter/docs/react/custom-config
- https://github.com/Tencent/tdesign-react-starter

## Positioning

TDesign React Starter is a middle/back-office starter. Its useful lessons for Gooes are design language, density, layout rhythm, and token discipline, not a direct dependency choice.

## Visual Tone

- Quiet, operational, and information-dense.
- Neutral surfaces carry most of the UI; brand color marks active state, primary action, and key data.
- Avoid marketing composition: no large hero areas, decorative media panels, or purely atmospheric backgrounds.

## Color System

Use token roles rather than arbitrary colors:

- Brand/action: TDesign brand blue family, centered around `#0052d9`.
- Success: green family for successful/active/completed states.
- Warning: orange/yellow family for pending/risk states.
- Error: red family for failed/destructive states.
- Text: primary, secondary, placeholder, disabled.
- Border/surface: low-contrast gray for dividers and component borders.

Practical guidance:

- Prefer one primary brand color plus semantic status colors.
- Use light status backgrounds for tags and notices.
- Keep page backgrounds neutral; put attention color only where it changes meaning.
- Charts can use a broader sequence, but UI chrome should remain restrained.

## Typography

- Font stack: system UI fonts.
- Body and controls: 14px.
- Section/card title: about 16-20px depending on density.
- KPI number: about 24-28px, strong but not hero-scale.
- Supporting text: secondary/placeholder color.
- Do not scale font size with viewport width.

## Layout

Common starter rhythm:

- App frame: sidebar navigation + top header + scrollable content.
- Page panel margin: about 24px.
- Content card padding: about 24-32px for full-page forms/lists.
- Grid gutters: 16px for dashboards, 24-32px for forms.
- Card/container radius: small, about 3-6px.
- Use full-width page sections or grids; do not nest decorative cards.

## Dashboard Pattern

Recommended composition:

- Top row: KPI cards, usually 4 across desktop, 2 across tablet.
- Middle row: primary chart + secondary chart/card.
- Rank/list row: table cards with filters or segmented date controls.
- Lower row: overview chart + compact KPI list.

Dashboard details:

- KPI cards should include title, value, trend, and small supporting context.
- Charts should use tokenized text, border, and background colors.
- Avoid heavy chart decoration; prioritize labels, legends, and readable axes.

## Form Pattern

- Use grouped sections with compact section titles.
- Use top labels for dense admin forms unless the existing page uses another local convention.
- Prefer 2-column layout on desktop, 1-column on mobile.
- Use structured controls: Select for option sets, DatePicker for dates, Upload for files, Radio/Segmented for mutually exclusive short choices.
- Primary submit action first; secondary reset/cancel nearby but visually quieter.
- Error messages are inline and near the field.

## Table/List Pattern

- Toolbar above table:
  - Left: primary action, secondary actions, selected count.
  - Right: search, filters, export, refresh.
- Table cells should support ellipsis where text can be long.
- Use status tags with semantic colors and light variants.
- Keep row actions text/icon buttons; fixed right action column is acceptable.
- Provide pagination, loading, empty, and error states.

## Navigation

- Sidebar active item uses light brand background and brand text/icon.
- Dark sidebar is acceptable, but content panels should remain neutral and readable.
- Header controls should be compact and icon-led.

## Things To Avoid

- Purple-blue gradient dominance.
- Large radius cards for dense operations.
- Decorative orbs, bokeh, and stock-like backgrounds.
- Visible instructional copy explaining UI mechanics.
- Card inside card for ordinary page sections.
- Text overflow inside buttons, tabs, cards, or table actions.

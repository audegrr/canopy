# Handoff: Canopy — Visual Redesign (“Clairière” direction)

## Overview
This package refreshes the **visual layer** of **Canopy** (the Notion-style app at
`audegrr/canopy`, Next.js + TipTap). It keeps the existing information
architecture, components and behavior, and re-skins them into a cleaner, calmer,
more editorial look with a light “canopy / forest” identity. It also adds a
**dark mode**.

The shipped direction is **Clairière**: crisp white canvas, a single measured
forest-green accent, editorial serif headings (Newsreader) over a clean
sans-serif body (Hanken Grotesk). Two alternate directions (Canopée, Sous-bois)
exist in the prototype behind the top switcher **for reference only** — ship
Clairière unless told otherwise.

## About the design files
These files are **design references created in HTML/CSS** — a prototype showing
the intended look and interactions. They are **not** drop-in production code. The
task is to **recreate this look inside the existing Canopy codebase** (React /
Next.js — `AppShell.tsx`, `PageView.tsx`, `CommandPalette.tsx`,
`DatabaseBlock.tsx`, etc.), using its established patterns, TipTap setup and the
CSS-variable theming in `app/globals.css`.

The prototype hard-codes one sample page (the “Questions” note) just to make the
mock concrete. **Do not import that content** — wire the styling to the real data
and the existing handlers.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii and interaction states are
meant to be used as-is. Recreate faithfully on top of the existing component
structure — this is a styling + small-interaction pass, not a rewrite.

---

## Review-driven decisions (preserve these exactly)
Each of these came from an explicit design-review note. They are easy to miss, so
they are listed first.

1. **Accent color**: from Notion blue (`#2383e2`) → **forest green `#2f6b4f`**
   (light). In dark mode the accent lightens to `#5fae84` for contrast.
2. **Headings use an editorial serif** (Newsreader); body & UI stay sans-serif
   (Hanken Grotesk).
3. **Page H1 is large and bold**: `2.75rem / 700`, letter-spacing −0.02em.
4. **Body line-height is tight: 1.45** (deliberately compact — it was reduced
   several times during review; do not loosen it).
5. **Sidebar rows must NOT shift on hover.** The row action icons (★ favorite /
   + add / ⋯ more) are **absolutely positioned** over the right edge of the row,
   hidden by default and faded in on hover (`opacity 0→1`), sitting on a short
   `linear-gradient(90deg, transparent, var(--side-fade) 38%)` so they mask the
   end of the label cleanly. The label keeps full width at all times → **nothing
   resizes or moves on hover.** Do NOT implement these as in-flow flex children
   (that pushes the text and reads as “the names jump”). The **Trash** items use
   the same absolute/fade pattern for their Restore / Delete actions.
6. **Section label “PAGES”** is uppercase, **body font**, 11px/600,
   letter-spacing .05em, and **slightly muted** (`opacity:.68`) so it matches the
   lighter weight of labels like “SHARED WITH ME”.
7. **Workspace icon stays an emoji** (🔍 for “Job Search”), matching the original.
8. **Zoom control**: `−  | 100% |  +` with **vertical divider lines** (border-left/
   right on the value); value in **body font**, not monospace.
9. **Page toolbar shows ALL actions** on desktop — none hidden behind a “⋯”.
   Monochrome line icons, grouped by thin vertical separators. The set/order
   mirrors the original `PageView` toolbar (see below). **There is no “AI
   assistant” button** — that was an error in an early pass and was removed.
10. **Export menu has no per-item icons** — text only (`Export as PDF / Word /
    Markdown`).
11. **Print button is labelled just “Print”** (not “Print / Save as PDF”).
12. **Toolbar is flush to the right edge** — no trailing gap after the last icon
    (`.pa-inner` padding `8px 16px`, not centered to the content column).
13. **A solid band** (`var(--bg)` + 1px bottom border) sits behind the toolbar so
    page content never shows through / overlaps “Edited just now” when scrolling.
14. **Sidebar footer = two distinct buttons**: the user button (avatar + name +
    email) and a **separate** sign-out button (power icon), each with its own
    independent hover highlight. Not one combined row.
15. **Wordmark alignment**: the “Canopy” wordmark is nudged down ~1.5px so it
    sits visually centered against the tree logo.
16. **Inline `>` in note text is plain text** — not highlighted/chipped.
17. **App UI chrome is in English** (the app is for an English-speaking user).
    Note *content* can be any language.
18. **Logo / favicon**: reuse the existing tree mark
    (`public/canopy_logo@2x.png`, `public/canopy_favicon_no_bg.ico`) as-is, shown
    **without any tile/box** behind it in the sidebar.

---

## Dark mode
- Toggled from the **user menu** (click the user button in the sidebar footer) →
  **Appearance: Light / Dark** segmented control. **No standalone toggle button**
  in the top bar — it lives in user settings, like the original app.
- Persisted to `localStorage('canopy_theme')`; applied as `data-theme="dark"` on
  `<body>`. Default is light.
- Implemented purely by **overriding the same CSS variables** under
  `body[data-theme="dark"] .app{…}` (plus per-direction accent overrides). In the
  real app, hang these off whatever theme mechanism already exists (`useTheme`)
  and reuse the token names below.

Dark tokens (Clairière):
```
--bg:#1a1a18  --text:#e9e7e2  --text-2:#a7a49c  --text-3:#75736c
--border:#2d2c29  --border-strong:#3a3935  --hover:#262521
--side-bg:#161614  --side-text:#d8d6cf  --side-text-2:#8a877f
--side-hover:rgba(255,255,255,.05)  --side-active:rgba(255,255,255,.085)
--side-border:#2a2926  --side-fade:#1d1c1a
--accent:#5fae84  --accent-soft:rgba(95,174,132,.16)  --side-accent:#6fc294
```

---

## Screens / Views
One screen: the **document editor** — left **sidebar**, **top bar**, centered
**page** column.

### Sidebar (width 256px, fixed)
- Background `var(--side-bg)`, right border `var(--side-border)`.
- **Header**: tree logo (30×30, no tile) + “Canopy” wordmark in serif 18px/600
  (nudged down 1.5px).
- **Workspace card** (`.ws-card`, clickable): 26×26 tile with **emoji** 🔍, name
  “Job Search” 13px/600, sub “Workspace”, chevron. Opens the **workspace menu**
  (see below).
- **Quick actions**: “New page”, “New database”.
- **Section label** “PAGES” (see decision #6).
- **Tree rows** (`.nav`): 5px/8px padding, radius 7px. Twist chevron (rotates 90°
  open), page glyph, label (truncates), absolute hover actions ★/+/⋯ (decision #5).
  Active row: bg `var(--side-active)`, label 600, 3px green left accent bar
  (`::before`). **Sub-tree** indented `margin-left:24px` + 1.5px left guide border.
- **Trash** (`.trash`, above footer): collapsible row with trash icon, “Trash”
  label, item count. Expands to a list with an **“Empty trash”** action and, per
  item, **Restore** / **Delete permanently** (absolute/fade actions).
- **Footer**: user button + separate sign-out button (decision #14). Clicking the
  user button opens the **user menu**.

### Workspace menu (from the workspace card)
Anchored popover: header (emoji + name + “3 pages · Free plan” + a settings gear),
then items — **Workspace settings** (gear), **Invite members** (users),
**New workspace** (+). Mirror the existing workspace switcher / settings entry in
`AppShell.tsx`.

### User menu (from the user button)
Anchored popover above the footer: header (avatar + name + email), **Settings**
(gear), **Appearance** row with Light/Dark segmented control, **Sign out**.

### Top bar (height 52px)
Sticky, translucent `var(--topbar-bg)` + `backdrop-filter: blur(8px)`, bottom
border. Left: hamburger that collapses the sidebar (`margin-left:-257px` slide,
`.26s cubic-bezier(.4,0,.2,1)`). Center-left: breadcrumbs. Right: **Zoom**
(decision #8), **Search pill** (icon + “Search” + `⌘K`), **Notifications** bell.

### Page toolbar (sticky band, flush right — decisions #9–13)
`Edited just now` at far left; actions right-aligned in three separator groups:

- **Output**: Export (menu: PDF / Word / Markdown — text only; databases also
  CSV / XLSX), Generate slides, Print, Import from Markdown, Save as template.
- **Review / nav**: Table of contents (panel), Version history (panel), Backlinks
  (panel), Comments (panel + composer), Focus mode (toggle).
- **Page actions**: Favorite (star, toggles green), Lock page (toggle), Share
  (panel: invite field + Copy link).

Maps 1:1 to original handlers: `ExportMenu`, `setPresentationOpen`, `exportPDF`,
`triggerMarkdownImport`, `saveAsTemplate`, `setTocOpen`, `setHistoryOpen`,
`setBacklinksOpen`, `setCommentsOpen`, `focusMode`, `onToggleFavorite`,
`toggleLock`, `setShareOpen`. Keep those handlers/panels; only restyle.

### Sidebar row context menu (⋯) and add menu (+)
**⋯** → `Rename`, `Duplicate`, — `Add sub-page`, `Add database`, — `Add to
favorites`, `Copy link`, `Move to workspace…`, — `Delete` (danger).
**+** → `Add sub-page`, `Add database`. Mirror the existing `contextMenu`
MenuItem list in `AppShell.tsx`.

### Page (content column)
- `max-width: 720px`, centered, `padding: 58px 28px 200px`.
- **Cover row** (hover-only): “Add icon”, “Add cover”.
- **Title**: serif, `2.75rem / 700`, ls −0.02em, line-height 1.1,
  `text-wrap: balance`.
- **Blocks**: `.block` shows left handles (+ / grip) on hover at `left:-46px`.
- **Heading block** `.h-block`: serif 1.55rem/600.
- **Paragraph** `.p-block`: 16px, **line-height 1.45**; `.dim` uses `var(--text-2)`.
- **Callout**: `var(--accent-soft)` surface, 1px green-alpha border, 11px radius,
  leading sparkle icon in accent.

---

## Interactions & behavior
- **Direction switcher** (dark top bar): swaps `data-dir` on `.app`; persisted to
  `localStorage('canopy_dir')`. **Exploration aid — remove it in production** and
  ship the Clairière tokens as the theme.
- **Appearance**: `data-theme` on `<body>`, `localStorage('canopy_theme')`.
- **Sidebar collapse**: `.collapsed` on `.app`.
- **Tree expand/collapse**: `.open` on the `.nav`.
- **Trash expand/collapse**: `.open` on the trash row.
- **Popovers/menus** close on outside click; only one open at a time.
- All hover-revealed affordances use **opacity**, never layout shifts
  (decision #5). Transitions: hovers `.12s`, sidebar slide `.26s`, twist `.16s`.

## Design tokens (Clairière light — ship these)
```
/* surfaces & text */
--bg:#ffffff  --text:#2a2824  --text-2:#6d6b64  --text-3:#a9a79f
--border:#ecebe8  --border-strong:#e0dfdb  --hover:#f4f3f1
/* accent (forest green) */
--accent:#2f6b4f  --accent-soft:#eef4f0
/* sidebar */
--side-bg:#fafaf8  --side-text:#45433d  --side-text-2:#8d8b82
--side-hover:rgba(40,38,32,.05)  --side-active:rgba(40,38,32,.075)
--side-border:#eeede9  --side-fade:#f2f1ee  --side-accent:#2f6b4f
/* radii */
--radius:7px  --radius-sm:5px  --radius-lg:11px
/* type */
--font-head:'Newsreader',Georgia,serif        /* titles & headings */
--font-body:'Hanken Grotesk',-apple-system,sans-serif  /* body & UI */
--font-mono:'JetBrains Mono',ui-monospace,monospace    /* ⌘K chip only */
--title-size:2.75rem  --title-weight:700  --title-spacing:-0.02em
--content-w:720px
```
Type scale: title 2.75rem/700 · heading 1.55rem/600 · body 16px/1.45 · UI
13–13.5px · meta 11–12.5px.

### Alternate directions (reference only — not for shipping)
- **Canopée**: paper bg `#fdfbf7`, sage accent `#4d6b50`, Spectral headings, IBM
  Plex Sans body.
- **Sous-bois**: white canvas, deep-green sidebar rail `#1c3a2d` w/ light text,
  accent `#2c6e49`, Source Serif 4 headings.
Token sets live in `canopy-redesign.css` under `.app[data-dir="canopee"]` /
`.app[data-dir="sousbois"]` (+ dark overrides).

## Fonts
Google Fonts. Clairière needs only **Newsreader** (400–700) and **Hanken Grotesk**
(400–700); **JetBrains Mono** for the `⌘K` chip. (Canopée/Sous-bois also use
Spectral, IBM Plex Sans, Source Serif 4 — skip unless shipping them.)

## Assets
- `public/canopy_logo@2x.png` — existing Canopy tree logo (reused as-is).
- `public/canopy_favicon_no_bg.ico` — transparent-bg favicon (reused as-is).
Both already exist in the repo at these paths. Prototype icons are inline SVGs
(Lucide-style, 1.7px stroke) — match them to whatever icon library the codebase
already uses.

## Files in this package
- `Canopy Redesign.html` — interactive prototype (open in a browser). Inline SVG
  icon defs, the three directions, dark mode, and all interaction JS.
- `canopy-redesign.css` — all styles + tokens (source of truth; `:root` =
  Clairière light, `body[data-theme="dark"]` = dark).
- `public/` — logo + favicon.
- `README.md` — this file.

## Implementation checklist for the Canopy codebase
- [ ] Map Clairière `:root` tokens into `app/globals.css`; replace the blue accent
      and any Notion-blue references.
- [ ] Add the dark token set to the existing theme mechanism (`useTheme`); expose
      it via the **user menu → Appearance**, not a top-bar button.
- [ ] Swap heading/body fonts (Newsreader / Hanken Grotesk); set H1 to 2.75rem/700
      and body line-height to 1.45.
- [ ] Re-skin sidebar; implement **absolute, fade-in** row actions (decision #5)
      for page rows AND trash items — verify nothing shifts on hover.
- [ ] Keep sub-page indentation clearly visible (24px + guide border).
- [ ] Rebuild the page toolbar with all actions visible, grouped, flush-right,
      on a solid band; Export menu text-only; Print labelled “Print”.
- [ ] Wire workspace menu (settings/invite/new) and user menu
      (settings/appearance/sign out) to existing handlers.
- [ ] Split the footer into two independent buttons (user / sign-out).
- [ ] Remove the exploration-only direction switcher and `data-dir` plumbing.

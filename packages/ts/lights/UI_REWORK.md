# UI Rework Plan

> Agent instructions: each ticket is self-contained. Read the "Files" and "Changes" sections carefully. Do not touch files outside the listed scope. Run `yarn nx build @lights/app` to typecheck after each ticket.

---

## Diagnosis

| # | Problem | Where |
|---|---------|-------|
| 1 | No app chrome — project name, save state, and graph status are invisible or buried | `App.tsx`, `SurfacePanel.tsx` |
| 2 | `LayerToolbar` is a 4th layout column — disconnected from the right panel it logically belongs to | `App.tsx`, `LayerToolbar/` |
| 3 | `SurfacePanel` is a 400-line god-component with 4 unrelated modes stitched together | `SurfacePanel.tsx` |
| 4 | Raw Unicode icons (×, ⎘, ✎, ⊹) instead of the Lucide library already in use | everywhere |
| 5 | No breadcrumb — the stage→surface transition is invisible; users get lost | `App.tsx` |
| 6 | No CSS design tokens — 30+ hardcoded hex values duplicated across CSS files | all `.css` files |
| 7 | `<input type="color">` is unstyled and bare in property editors | `SurfacePanel.tsx` |
| 8 | Empty states are lazy `<p>` text with no visual weight or call-to-action | `SlidePanel.tsx`, `SurfacePanel.tsx` |
| 9 | Rename UX is inconsistent: click-on-selected vs. double-click differ per component | `SlidePanel.tsx`, `SurfacePanel.tsx` |
| 10 | Inline `style={{}}` used for layout constraints that belong in CSS | `SurfacePanel.tsx` |

---

## Phasing

```
Phase 1 (blockers)    Phase 2 (parallel)         Phase 3 (parallel)
──────────────────    ───────────────────────     ──────────────────
T1  CSS tokens    ──▶ T3  TopBar                  T7  Layer list icons
T2  App layout    ──▶ T4  SlidePanel redesign      T8  Property editors
                  ──▶ T5  Inspector split          T9  Empty states
                  ──▶ T6  Breadcrumb              T10  Rename UX
```

---

## Ticket T1 — CSS Design Tokens

**Goal**: single source of truth for all colors, radii, and spacing. Zero hardcoded hex values in component CSS files after this ticket.

**Files**: `src/app.css` and all `src/components/**/*.css`

**Changes**:

1. Add a `:root` block at the top of `app.css` with these tokens:

```css
:root {
  /* Surfaces */
  --bg-root:        #0a0a0a;
  --bg-panel:       #111111;
  --bg-stage:       #161616;
  --bg-hover:       #1e1e1e;
  --bg-selected:    #1a2744;
  --bg-input:       #181818;

  /* Borders */
  --border-subtle:  #1a1a1a;
  --border-default: #222222;
  --border-strong:  #2a2a2a;

  /* Text */
  --text-primary:   #cccccc;
  --text-secondary: #aaaaaa;
  --text-muted:     #666666;
  --text-faint:     #444444;

  /* Accent */
  --accent:         #60a5fa;
  --accent-dim:     #1a2744;
  --accent-hover:   #93c5fd;
  --accent-cyan:    #40c4ff;

  /* Danger */
  --danger:         #ef4444;

  /* Radius */
  --radius-sm:      2px;
  --radius-md:      4px;
  --radius-lg:      8px;

  /* Spacing (8px grid) */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 20px;
  --sp-6: 24px;

  /* Typography */
  --font-ui:        system-ui, sans-serif;
  --text-xs:        10px;
  --text-sm:        11px;
  --text-base:      12px;
}
```

2. Replace every hardcoded color, radius, and spacing value in all `.css` files with the matching token. Do a complete pass — leave nothing hardcoded.

**Acceptance**: `grep -r '#[0-9a-fA-F]\{3,6\}' src/components` returns zero results. `grep -r '#[0-9a-fA-F]\{3,6\}' src/app.css` returns only the token definitions in `:root`.

---

## Ticket T2 — App Layout Refactor

**Goal**: Establish the correct 3-column + top bar layout. Remove `LayerToolbar` as a standalone column — it moves into the inspector panel (done in T5). The floating status span is removed (replaced by `TopBar` done in T3).

**Files**: `src/App.tsx`, `src/app.css`

**Current layout (wrong)**:
```
[SlidePanel] [stage-area] [LayerToolbar] [SurfacePanel]
```

**Target layout**:
```
[TopBar                                               ]
[SlidePanel] [          stage-area          ] [Inspector]
```

**Changes**:

1. In `App.tsx`:
   - Remove the `<LayerToolbar />` import and JSX. Its content will be embedded in the inspector (T5).
   - Remove `<span className="status">` — status moves to `TopBar` (T3).
   - Remove the `showVideo` / `setShowVideo` state — it moves into a `StageControls` overlay inside the stage canvas component (T3).
   - Wrap the whole app in a flex-column `div.app-shell` containing:
     - `<TopBar />` (new, T3)
     - `<div className="app-body">` containing `<SlidePanel />`, `<div className="stage-area">...</div>`, `<InspectorPanel />` (renamed from SurfacePanel, T5)

2. In `app.css`, update `.app` → `.app-shell` to `display: flex; flex-direction: column; height: 100vh`. Update `.app-body` to `display: flex; flex: 1; overflow: hidden`.

3. Set fixed widths: `SlidePanel` = 160px, `InspectorPanel` = 240px, stage-area = flex-grow 1.

**Acceptance**: The app renders with a top bar, left slides panel, center canvas, right inspector. No `LayerToolbar` column between canvas and inspector. TypeScript compiles.

---

## Ticket T3 — TopBar Component

**Goal**: Replace the invisible status span with a proper top bar that shows project name, save state, and graph status. Add a video toggle button into the stage canvas area as a proper overlay.

**Files**: Create `src/components/TopBar/TopBar.tsx`, `src/components/TopBar/TopBar.css`, `src/components/TopBar/index.ts`. Update `src/components/index.ts`. Update `src/components/Canvas/Canvas.tsx`.

**TopBar layout**:
```
[● Lights]  [project-name]  ────────────  [● running]
 logo dot    (editable)                   status pill
```

**Changes**:

1. `TopBar.tsx`:
   - Import `useGraph` and `useProject` contexts.
   - Left: a `●` dot (color based on graph status: `--accent` when running, `--danger` when error, `--text-muted` when stopped) followed by the text `"Lights"`.
   - Center: project file name or `"Untitled"`. Show a `•` after the name when `isDirty` is true. Clicking the name does nothing for now (file ops are OS menu only).
   - Right: graph status pill — `<span className="status-pill status-pill--{status}">` showing `"Running"` / `"Stopped"` / `"Error"`.
   - Height: 36px. Background: `var(--bg-panel)`. Bottom border: `1px solid var(--border-subtle)`.

2. `TopBar.css`: style the bar, the dot, the file name, and the status pill. Use CSS custom properties only.

3. In `Canvas.tsx`: add a `<button className="video-toggle">` overlay in the top-left of the canvas container. Use `<Eye size={14} />` / `<EyeOff size={14} />` from lucide-react. This replaces the button that was in App.tsx. The `showVideo` state moves into Canvas.

**Acceptance**: TopBar renders across full width. Status pill changes color with graph state. Video toggle is inside the canvas area, not in App.tsx.

---

## Ticket T4 — SlidePanel Redesign

**Goal**: Slides panel becomes compact thumbnail cards with hover-revealed actions and a proper "New Slide" footer button. Replace Unicode icons with Lucide.

**Files**: `src/components/SlidePanel/SlidePanel.tsx`, `src/components/SlidePanel/SlidePanel.css`

**Target appearance**:
```
┌──────────────────┐
│ SLIDES           │
├──────────────────┤
│ ┌──────────────┐ │
│ │              │ │  ← thumbnail placeholder (dark rect, 16:9)
│ │   Slide 1    │ │  ← name below thumbnail
│ └──────────────┘ │
│ [hover: ⎘  ×  ] │  ← actions appear on hover
├──────────────────┤
│  + New Slide     │  ← footer button
└──────────────────┘
```

**Changes**:

1. Replace `slide-item` row with a card layout:
   - `div.slide-card` (position: relative) containing:
     - `div.slide-thumb` — 100% width, aspect-ratio 16/9, background `var(--bg-stage)`, border-radius `var(--radius-md)`. When selected, border `1px solid var(--accent)`.
     - `span.slide-card-name` — the slide name below the thumb.
     - `div.slide-card-actions` — absolutely positioned bottom-right of the thumb, `opacity: 0`, revealed on `.slide-card:hover`. Contains `<Copy size={12} />` (duplicate) and `<Trash2 size={12} />` (remove) as icon buttons.

2. Move the `+` add button from the panel header into a footer `<button className="slide-add-btn">` spanning the full panel width with `+ New Slide` label. Remove the `+` from the header.

3. Panel header becomes just the label `SLIDES` (uppercase, `var(--text-muted)`, `var(--text-xs)`, letter-spacing 0.08em) — no action buttons.

4. Double-click on the slide name enters rename mode (not single-click-on-selected). This is consistent with the T10 rename UX standardization.

5. Import `Copy`, `Trash2` from `lucide-react`. Remove the Unicode characters.

**Acceptance**: Slides render as cards. Hover reveals icon actions. Footer has "New Slide" button. Double-click renames.

---

## Ticket T5 — Inspector Panel Split

**Goal**: Break `SurfacePanel.tsx` apart into a proper `InspectorPanel` that delegates to focused sub-panels per mode. Move `LayerToolbar` content into an "Add Layer" footer within the inspector. Remove inline `style={{}}` from JSX.

**Files**: 
- Rename `src/components/SurfacePanel/` → `src/components/InspectorPanel/`
- Create sub-components within that folder: `StageModePanel.tsx`, `SurfaceModePanel.tsx`, `VolumeEditorPanel.tsx`
- Delete `src/components/LayerToolbar/LayerToolbar.tsx` (merge content into `SurfaceModePanel.tsx`)
- Update `src/components/index.ts`

**Structure**:

```
InspectorPanel.tsx   — thin router: reads editorMode, renders the right sub-panel
  StageModePanel.tsx — surface list + volume section + graph config (collapsed by default)
  SurfaceModePanel.tsx — layer list + layer properties + add-layer footer
  VolumeEditorPanel.tsx — shape list + shape properties (XYZ grid)
```

**InspectorPanel.tsx** (thin router):
```tsx
export default function InspectorPanel() {
  const { state } = useProject()
  if (state.editorMode === 'surface') return <SurfaceModePanel />
  if (state.editorMode === 'volume-editor') return <VolumeEditorPanel />
  return <StageModePanel />  // covers 'stage' and 'volume-align'
}
```

**StageModePanel.tsx**:
- `PanelSection` component (reusable): `<div className="panel-section">` with a header `<div className="panel-section-header"><span>{title}</span>{action}</div>` and `<div className="panel-section-body">`.
- "Surfaces" section: surface list items using `<Layers size={12} />` icon + name + delete button (Lucide `<Trash2 size={12} />`). Selected = `var(--bg-selected)` bg.
- "Volume" section: if no volume, empty state (see T9). If volume exists, single item with edit + align + delete icon buttons.
- "ML Modules" section: collapsible (chevron toggle). Contains `<GraphConfigPanel />` as-is. Collapsed by default.

**SurfaceModePanel.tsx**:
- Header showing the surface name (double-click to rename, T10).
- `<LayerList />` as-is.
- Layer property section below the list: renders solid/text/detection properties depending on selected layer type. No change in logic, only visual cleanup (see T8).
- Footer `<div className="add-layer-footer">`: four buttons — `+ Solid`, `+ Image`, `+ Text`, `+ Effect` — each with a small Lucide icon. This replaces `LayerToolbar`. The footer is `border-top: 1px solid var(--border-subtle)`, padding `var(--sp-2)`, `display: flex; gap: var(--sp-1)`.

**VolumeEditorPanel.tsx**:
- "Shapes" section: shape list. No inline `style={{ maxHeight: '200px' }}` — use CSS `.shape-list { max-height: 200px; overflow-y: auto }`.
- "Properties" section: XYZ grid (position, rotation, scale). Clean layout using CSS grid — see T8.
- "Add Shape" section: button row for box / sphere / cylinder / cone / grid using text labels (icons can be added later).

**Acceptance**: `SurfacePanel.tsx` deleted. `LayerToolbar.tsx` deleted. `InspectorPanel` renders correctly in all editor modes. No inline `style={{}}` anywhere in the new files. TypeScript compiles.

---

## Ticket T6 — Breadcrumb Navigation

**Goal**: Add a mode-aware breadcrumb strip below the TopBar (above the stage area) so users always know where they are and can click to navigate back.

**Files**: Create `src/components/Breadcrumb/Breadcrumb.tsx`, `src/components/Breadcrumb/Breadcrumb.css`, `src/components/Breadcrumb/index.ts`. Update `src/App.tsx` (or the layout container).

**Breadcrumb states**:

| Editor Mode | Breadcrumb |
|-------------|-----------|
| `stage` | `[slide name]` — non-clickable |
| `surface` | `[slide name]` › `[surface name]` — slide name is clickable (dispatch `surface:exit`) |
| `volume-editor` | `[slide name]` › `Volume` — slide name is clickable (dispatch `volume:editorExit`) |
| `volume-align` | `[slide name]` › `Align Camera` — non-clickable, just informational |

**Changes**:

1. `Breadcrumb.tsx`:
   - Read `editorMode`, `selectedSlideId`, `selectedSurfaceId` from `useProject`.
   - Render a `<nav className="breadcrumb">` with `<span>` segments separated by `<span className="breadcrumb-sep">›</span>`.
   - Clickable segments get `className="breadcrumb-item breadcrumb-item--link"`, non-clickable get `breadcrumb-item`.

2. `Breadcrumb.css`: height 28px, background `var(--bg-panel)`, bottom border `1px solid var(--border-subtle)`, padding `0 var(--sp-3)`. Font: `var(--text-sm)`, color `var(--text-secondary)`. Clickable items: `var(--accent)` on hover, cursor pointer.

3. In `App.tsx` (after T2), render `<Breadcrumb />` inside `.stage-area` above the canvas, only when `editorMode !== 'stage'` (no breadcrumb needed in stage mode — it's the root).

**Acceptance**: Entering surface mode shows `Slide Name › Surface Name` above the canvas. Clicking the slide name exits surface mode. Correct for all non-stage modes.

---

## Ticket T7 — Icon Standardization

**Goal**: Replace all raw Unicode characters used as icon buttons with Lucide icons. No Unicode glyphs as actionable UI elements.

**Files**: All component `.tsx` files.

**Mapping**:

| Current | Lucide component | Usage |
|---------|-----------------|-------|
| `×` (remove/delete) | `<Trash2 size={12} />` | surface remove, layer remove, shape remove, slide remove |
| `+` (add) | `<Plus size={12} />` | surface add, slide add (already replaced in T4/T5) |
| `⎘` (duplicate) | `<Copy size={12} />` | slide duplicate |
| `✎` (edit) | `<Pencil size={12} />` | volume edit |
| `⊹` (align) | `<Crosshair size={12} />` | volume align camera |
| `▶` / `■` (play/stop) | already `<Play>` / `<Square>` | video toggle (already done) |

**Changes**:

1. In `LayerList.tsx`: replace `×` remove buttons with `<Trash2 size={12} />`. Replace eye toggle text/emoji with `<Eye size={12} />` / `<EyeOff size={12} />`.

2. In `StageModePanel.tsx` (from T5): replace `×`, `✎`, `⊹` with the Lucide equivalents.

3. Ensure all icon buttons have `title` attributes for accessibility (they already mostly do — verify and fill gaps).

4. Import all needed icons at the top of each file; remove dead Unicode imports/strings.

**Acceptance**: `grep -r "✎\|⊹\|⎘\|×" src/components` returns zero results in JSX (the `×` in CSS `content` is OK).

---

## Ticket T8 — Property Editor Polish

**Goal**: The layer property editors (solid color, text, detection canvas) and the volume shape property inputs (XYZ grid) need proper visual treatment.

**Files**: `src/components/InspectorPanel/SurfaceModePanel.tsx`, `src/components/InspectorPanel/VolumeEditorPanel.tsx`, `src/components/InspectorPanel/InspectorPanel.css` (shared styles).

### Color Picker (solid layer)

Replace the bare `<input type="color" className="surface-editor-color">` with a swatch-button that triggers the hidden input:

```tsx
<div className="color-field">
  <div
    className="color-swatch"
    style={{ background: solidLayer.color }}
    onClick={() => inputRef.current?.click()}
  />
  <span className="color-value">{solidLayer.color}</span>
  <input ref={inputRef} type="color" className="color-input-hidden" value={solidLayer.color} onChange={...} />
</div>
```

CSS: `.color-swatch` is 20×20px, `border-radius: var(--radius-sm)`, `cursor: pointer`, `border: 1px solid var(--border-strong)`. `.color-input-hidden` is `opacity: 0; width: 0; height: 0; position: absolute`.

### Text Layer

Current: a range slider for font size with a separate `<span>` showing the value.

Replace with a paired `<input type="range">` + `<input type="number">` that stay in sync:

```tsx
<div className="prop-row">
  <label className="prop-label">Size</label>
  <input type="range" min={8} max={200} value={textLayer.fontSize} onChange={...} />
  <input type="number" className="prop-number" min={8} max={200} value={textLayer.fontSize} onChange={...} />
</div>
```

CSS: `.prop-row` is `display: flex; align-items: center; gap: var(--sp-2)`. `.prop-number` is 48px wide, `text-align: right`.

### XYZ Inputs (volume shape)

Current: inline `.xyz-row` with inline `<div key={axis}>` rows.

Replace with a proper CSS grid:

```css
.xyz-grid {
  display: grid;
  grid-template-columns: 20px 1fr;
  gap: 3px var(--sp-2);
  align-items: center;
}
.xyz-axis { font-size: var(--text-xs); color: var(--text-muted); font-weight: 600; }
.xyz-input { width: 100%; background: var(--bg-input); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); color: var(--text-primary); padding: 3px var(--sp-1); font-size: var(--text-sm); }
```

Remove all inline `style={{}}` from the properties section.

**Acceptance**: Color swatches render. Font size range + number input are in sync. XYZ grid has no inline styles. TypeScript compiles.

---

## Ticket T9 — Empty States

**Goal**: Replace lazy `<p className="panel-empty">` text with proper empty states that include an icon, a message, and a contextual call-to-action button.

**Files**: `src/components/SlidePanel/SlidePanel.tsx`, `src/components/InspectorPanel/StageModePanel.tsx`, `src/components/InspectorPanel/SurfaceModePanel.tsx`, shared CSS in `app.css`.

**Shared component** (inline, not a separate file — too small):

```tsx
function EmptyState({ icon: Icon, message, action }: {
  icon: LucideIcon
  message: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="empty-state">
      <Icon size={20} className="empty-state-icon" />
      <span className="empty-state-msg">{message}</span>
      {action && <button className="empty-state-btn" onClick={action.onClick}>{action.label}</button>}
    </div>
  )
}
```

**CSS** (add to `app.css`):
```css
.empty-state { display: flex; flex-direction: column; align-items: center; gap: var(--sp-2); padding: var(--sp-6) var(--sp-4); }
.empty-state-icon { color: var(--text-faint); }
.empty-state-msg { font-size: var(--text-sm); color: var(--text-muted); text-align: center; }
.empty-state-btn { background: var(--bg-hover); border: 1px solid var(--border-default); border-radius: var(--radius-md); color: var(--text-primary); font-size: var(--text-sm); padding: var(--sp-1) var(--sp-3); cursor: pointer; }
.empty-state-btn:hover { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }
```

**Usages**:
- No slides: `<EmptyState icon={Layers} message="No slides yet" action={{ label: '+ New Slide', onClick: () => dispatch({ type: 'slide:add' }) }} />`
- No surfaces: `<EmptyState icon={Square} message="No surfaces" action={{ label: 'Add Surface', onClick: () => dispatch({ type: 'surface:add', slideId: selectedSlideId! }) }} />`
- No slide selected: `<EmptyState icon={MousePointer} message="Select a slide to begin" />`
- No layers: `<EmptyState icon={LayoutTemplate} message="No layers" />`
- No volume: `<EmptyState icon={Box} message="No volume" action={{ label: 'Add Volume', onClick: () => dispatch({ type: 'volume:add', slideId: selectedSlideId! }) }} />`

**Acceptance**: All `<p className="panel-empty">` replaced. Empty states have icons and CTAs. TypeScript compiles.

---

## Ticket T10 — Rename UX Standardization

**Goal**: Consistent double-click-to-rename across `SlidePanel`, `SurfaceModePanel` (surface name header), and `StageModePanel` (surface list items). Single-click on an item selects it; double-click enters rename mode.

**Files**: `src/components/SlidePanel/SlidePanel.tsx`, `src/components/InspectorPanel/StageModePanel.tsx`, `src/components/InspectorPanel/SurfaceModePanel.tsx`

**Current inconsistency**:
- `SlidePanel`: double-click on name triggers rename (correct for selected items, but read the code — it's actually `onClick` on selected items, not `onDoubleClick`).
- `SurfacePanel` header: single `onClick` on the name.
- `SurfacePanel` surface list: single `onClick` if already selected.

**Correct behavior (standardize everywhere)**:
- `onClick` on an item → select it (dispatch `slide:select` / `surface:select`).
- `onDoubleClick` on the **name text only** → enter rename mode.
- Rename input: `onBlur` commits, Enter commits, Escape cancels.
- While in rename mode, clicks on the item don't dispatch selection.

**Shared pattern** (implement identically in all three files):
```tsx
<span
  className="item-name"
  onClick={() => dispatch({ type: '...:select', ...id })}
  onDoubleClick={e => { e.stopPropagation(); startEdit(id, name) }}
>
  {name}
</span>
```

Remove the `if (slide.id === selectedSlideId) startEdit(...)` guard — double-click works on any item whether or not it's already selected.

**Acceptance**: Double-click renames in all three panels. Single-click selects without triggering rename. Escape cancels without committing.

---

## Execution Order

**Agents should work in this order to avoid conflicts:**

1. **T1** alone first — all subsequent tickets depend on CSS tokens being defined.
2. **T2** alone — layout structure must be stable before others render into it.
3. **T3, T4, T5, T6** in parallel — each touches a distinct component.
4. **T7, T8, T9, T10** in parallel — cleanup/polish tickets with no interdependencies.

Each agent should run `yarn nx build @lights/app` at the end of its ticket to confirm no TypeScript errors.

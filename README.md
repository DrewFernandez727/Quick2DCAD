# Quick2DCAD

A browser-based parametric 2D CAD sketcher — draw geometry, snap precisely, and apply geometric/dimensional constraints. Built with React, TypeScript, and FreeCAD's WASM constraint solver.

## Features

- **Drawing tools** — Line (chainable), Circle, Arc (3 modes), Rectangle, Regular Polygon, Point, Trim
- **Smart snapping** — Grid, Endpoint, Midpoint, Center, Quadrant, Intersection, Nearest
- **Ortho lock** — Hold Shift to constrain to 45° axes while drawing
- **Auto-constraining** — Automatically adds coincident/midpoint/pointOnLine constraints when snapping; hold Alt to draw freely
- **Geometric constraints** — Coincident, Horizontal, Vertical, Parallel, Perpendicular, Tangent, Equal, Concentric, Fixed, Midpoint, Point-on-line, Point-on-circle
- **Dimensional constraints** — Distance, H-distance, V-distance, Angle, Radius, Diameter
- **Live dimension display** — Distance, radius, and angle shown near cursor while drawing
- **Constraint solver** — FreeCAD's PlaneGCS WASM solver with iterative fallback
- **Undo/Redo** — 100-entry snapshot history
- **Export** — SVG export + JSON save/load
- **Dark theme** throughout

---

## Setup

```bash
npm install
npm run dev        # dev server at http://localhost:5173
npm run build      # production build to dist/
```

Requires Node 18+.

---

## Keyboard Shortcuts

### Tools
| Key | Tool |
|-----|------|
| `S` | Select / Move |
| `L` | Line |
| `C` | Circle |
| `A` | Arc |
| `R` | Rectangle |
| `G` | Polygon |
| `P` | Point |
| `T` | Trim |
| `Esc` | Cancel current operation / deselect |

### While Drawing
| Key | Action |
|-----|--------|
| `Shift` (hold) | Ortho lock — constrain to nearest 45° axis from last point |
| `Alt` (hold) | Disable auto-constraining for this click |
| `Tab` | Cycle arc drawing mode (Arc tool only) |
| `3`–`9` | Set polygon sides (Polygon tool only) |
| `Delete` / `Backspace` | Delete selected entities |

### Arc Modes (Tab to cycle)
| Mode | Flow |
|------|------|
| **C-R-E** | Click center → click radius point → click end angle |
| **3-Pt** | Click start → click point on arc → click end |
| **S-C-E** | Click start → click center → click end |

### Editing
| Key | Action |
|-----|--------|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` (or `Ctrl+Shift+Z`) | Redo |
| `Ctrl+A` | Select all |
| `F` | Fit view to all geometry (or selected entities) |
| `Ctrl+G` | Toggle grid on/off |

### Navigation
| Input | Action |
|-------|--------|
| Scroll wheel | Zoom in/out (cursor-centered) |
| Middle mouse drag | Pan |
| Space + drag | Pan |
| Right-click | Cancel tool operation |

---

## Constraint Reference

### Geometric Constraints
| Constraint | Description | Requires |
|-----------|-------------|----------|
| Coincident | Merge two points together | 2 points / endpoints |
| Horizontal | Line is exactly horizontal | 1 line |
| Vertical | Line is exactly vertical | 1 line |
| Parallel | Two lines are parallel | 2 lines |
| Perpendicular | Two lines are perpendicular | 2 lines |
| Tangent | Line is tangent to a circle/arc | 1 line + 1 circle/arc |
| Equal | Equal length (lines) or equal radius (circles) | 2 lines or 2 circles |
| Concentric | Circles/arcs share the same center | 2 circles/arcs |
| Fixed | Point is pinned to its current position | 1 point |
| Midpoint | Point lies at the midpoint of a line | 1 point + 1 line |
| Point on line | Point lies anywhere on a line | 1 point + 1 line |
| Point on circle | Point lies on the circumference | 1 point + 1 circle |

### Dimensional Constraints
| Constraint | Description | Input |
|-----------|-------------|-------|
| Distance | Distance between two points | mm |
| H-distance | Horizontal distance between two points | mm |
| V-distance | Vertical distance between two points | mm |
| Angle | Angle between two lines | degrees |
| Radius | Radius of a circle or arc | mm |
| Diameter | Diameter of a circle | mm |

### Applying Constraints
1. Select the required entities (Shift+click for multi-select)
2. Click the constraint button in the right panel
3. For dimensional constraints, enter the value in the dialog that appears

### DOF Color Coding
- **Gray/white** — free (unconstrained)
- **Cyan** — selected
- **Red** — over-constrained (conflicting constraints detected)

---

## Snapping

Snap priority order (highest first):
1. **Intersection** — crossing point of two entities
2. **Endpoint** — start/end of lines, arc endpoints
3. **Center** — center of circles/arcs
4. **Midpoint** — midpoint of lines
5. **Quadrant** — 0°/90°/180°/270° on circles/arcs
6. **Nearest** — closest point on any entity curve
7. **Grid** — snap to grid (disabled when grid is hidden)

Toggle individual snap types in the **Snap** panel on the right sidebar.

### Auto-Constraining
When you end a drawing operation on a snapped point, a constraint is automatically applied:

| You snap to | Constraint added |
|------------|-----------------|
| Midpoint of a line | `midpoint` |
| Center of a circle/arc | `coincident` with center |
| Nearest point on a line | `pointOnLine` |
| Nearest point on a circle | `pointOnCircle` |
| A nearly-horizontal/vertical line (within 2°) | `horizontal` / `vertical` |

**Hold Alt** while clicking to skip auto-constraints for that operation.

---

## Architecture

```
src/
├── main.tsx                    Entry point
├── App.tsx                     Root layout, SVG export
├── geometry/
│   ├── types.ts                All entity, constraint, and viewport types
│   ├── mathUtils.ts            Vectors, distance, angles, intersections
│   └── snap.ts                 Snap detection (7 types, priority-ordered)
├── canvas/
│   ├── SketchCanvas.tsx        Canvas component — mouse/keyboard events, ortho lock
│   ├── renderer.ts             Canvas 2D drawing engine — entities, constraints, overlays
│   └── hitTest.ts              Entity hit testing for click and box-select
├── tools/
│   ├── types.ts                Tool interface
│   ├── SelectTool.ts           Click select, box select, drag-to-move
│   ├── LineTool.ts             Chainable line drawing with auto-constraints
│   ├── CircleTool.ts           Center + radius
│   ├── ArcTool.ts              3 drawing modes (C-R-E, 3-point, S-C-E)
│   ├── RectTool.ts             2-corner rectangle
│   ├── PolygonTool.ts          Regular N-gon (3–9 sides)
│   ├── PointTool.ts            Place a free point
│   ├── TrimTool.ts             Trim entities at intersections
│   └── autoConstraint.ts       Auto-constraint helpers
├── solver/
│   └── ConstraintSolver.ts     PlaneGCS WASM wrapper + iterative fallback
├── state/
│   └── sketchStore.ts          Zustand store: entities, constraints, viewport, history
└── components/
    ├── Toolbar.tsx             Left toolbar
    ├── ConstraintBar.tsx       Constraint panel (apply + list)
    ├── SnapOptions.tsx         Snap toggles + grid size
    ├── PropertiesPanel.tsx     Selected entity properties
    ├── DimensionDialog.tsx     Dimensional constraint input
    └── StatusBar.tsx           Cursor position, snap, ORTHO indicator
```

### Data Model

All geometry is stored as plain serializable objects in the Zustand store:

```ts
{ id, type: 'point',  x, y, construction }
{ id, type: 'line',   p1Id, p2Id, construction }
{ id, type: 'circle', centerId, radius, construction }
{ id, type: 'arc',    centerId, radius, startAngle, endAngle, construction }

{ id, type: ConstraintType, entityIds: EntityId[], value?: number }
```

Coordinate system is Y-up. Viewport: `screenX = worldX * zoom + panX + W/2`, `screenY = -worldY * zoom + panY + H/2`.

---

## File Formats

### JSON (Save / Load)
Saves all entities and constraints. Use File → Save / Open in the toolbar.

### SVG Export
Exports geometry as SVG with dimensions in mm. Construction geometry is rendered as dashed blue lines.

---

## License

MIT

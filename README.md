# Contractor App — Planning Folder

This folder contains the **planning artifacts** for a contractor estimation & proposal app — a friends-only feedback prototype for self-employed general contractors.

> **No application code lives here yet.** This folder is the spec; the app itself will be built in a separate repo when planning is locked.

## Contents

| File | What it is |
|---|---|
| [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) | Full implementation plan — goals, stack, repo layout, phased feature plan, build order, friends rollout, success criteria, risks, design notes for later phases |
| [`Contractor_App_Feature_Inventory.xlsx`](./Contractor_App_Feature_Inventory.xlsx) | Canonical 65-feature inventory across MVP / Phase 2 / Phase 3 / Phase 4. Edit `I-Features` tab to update status / add features. |
| [`build_inventory.py`](./build_inventory.py) | Python script that (re)generates the Excel inventory. Run after editing the feature list in code. |

## Regenerating the inventory

```powershell
pip install openpyxl
python build_inventory.py
```

The script writes `Contractor_App_Feature_Inventory.xlsx` in this folder.

## Workbook tabs (in display order)

| Tab | Purpose |
|---|---|
| `O-Feature-Inventory` | Master view of all 65 features (formula-driven from `I-Features`) |
| `O-Phase-Summary` | Rollup by phase: counts, % complete, effort points |
| `C-Feature-Calcs` | Derived metrics (effort points, status flags) |
| `I-Features` | Source of truth — edit here. Has data validation against picklists. |
| `A-Specific` | Picklists for Phase, Priority, Status, Effort, Category |
| `Z-Validation-Checks` | Workbook integrity checks (must all PASS — A3 on every tab is green when OK) |

## Phase counts

| Phase | Feature count |
|---|---|
| MVP | 21 |
| Phase 2 | 28 |
| Phase 3 | 6 (visualization) |
| Phase 4 | 14 (productize / launch + autonomous agents + shared-catalog backlog) |
| **Total** | **69** |

## Next step

Read [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md), confirm the open questions in §12, then start the W1 build (Next.js skeleton).

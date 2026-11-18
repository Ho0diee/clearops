# ClearOps — Multi-Agent Architecture & Ownership Contract (`AGENTS.md`)

**Project Root:** `C:\Users\ytho0\.gemini\antigravity\scratch\clearops`  
**Lead Architect & Orchestrator:** Gemini 4 Carbon (High)  
**Parallel Feature Workers:** 4 concurrent subagents on Gemini 4 Argon & Hydrogen

---

## 1. Non-Negotiable Visual & UX Rules (Phase 1 Lock)

1. **Zero Custom Stylesheets or Color Overrides:**
   - Do **NOT** create `.css` files inside `src/features/**`.
   - Do **NOT** hardcode raw hex colors (`#...`) or custom inline visual styles that override `src/styles/tokens.css`.
   - Import and compose strictly from `src/components/ui` (`Button`, `Card`, `CardHeader`, `CardBody`, `CardFooter`, `SectionHeading`, `Badge`, `RankBadge`, `TimeBlock`, `Drawer`, `SegmentedControl`, `CheckboxRow`, `TogglePill`, `TextField`, `SelectField`, `TextArea`, `Banner`, `StatCard`, `ProgressBar`, `EmptyState`) and semantic layout classes in `src/styles/tokens.css` (`ops-split-schedule`, `ops-split-hub`, `ops-split-equal`, `ops-grid-stats`, `ops-stack-xs/sm/md/lg`, `ops-row`, `ops-row-wrap`, `ops-row-between`, `ui-divider-list`, `ui-list-row`, `ui-capture-bar`, `ui-command-pill`, `ui-timeline`, `ui-week-grid`, etc.).
2. **Two-Click Budget & Zero Clutter:**
   - Every core action (One-Tap Spillover, Live Voice/Text Calendar Input, Send to Empty Zone, Toggle Waiting-On, Complete Project Checkup, Submit Confidence Check-In, Log Offloaded Task, Complete Reflection & Lock Streak, Export for Gemini) MUST take **2 clicks or fewer**.
   - Never build nested dropdown mazes, multi-step wizards, or secondary sidebars.
3. **Icons:**
   - Import clean 16px/14px icons solely from `lucide-react`.

---

## 2. Locked Shared State & Routing Contract (Phase 2 Lock)

All application state lives in a single central store (`src/store/opsStore.tsx`) typed by `src/types/schema.ts`.

- **Never** create local duplicate stores, separate `localStorage` keys, or isolated mock arrays for domain entities (`blocks`, `reminders`, `ideas`, `checkups`, `pacedGoals`, `pacingLogs`, `offloadedTasks`, `reflections`, `streak`).
- Consume state and actions exclusively via:
  ```tsx
  import { useOpsStore, formatShortDate, getWeekDatesISO, addDaysISO } from '../../store/opsStore';
  ```
- **Routing Contract (`RouteTab`):**
  - `'schedule'` -> `<ScheduleView />`
  - `'ideas'` -> `<IdeasHubView />`
  - `'pacing'` -> `<PacingRoiView />`
  - Slide-over drawer (`state.isReflectionOpen`) -> `<ReflectionDrawer />`
  - Persistent header bar command input -> `<LiveCalendarInput />`

---

## 3. Strict Disjoint File Ownership Matrix

### Read-Only Core Files (Owned Exclusively by Lead Architect — DO NOT MODIFY)
- `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`
- `src/styles/tokens.css`
- `src/components/ui/**`
- `src/types/schema.ts`
- `src/store/seedData.ts`, `src/store/opsStore.tsx`
- `src/App.tsx`, `src/main.tsx`

### Parallel Subagent Ownership Boundaries

| Worker Roster Name | Owned Directory (Read/Write) | Required Named Exports in `index.tsx` | Forbidden Paths |
|---|---|---|---|
| `mobile-schedule` | `src/features/schedule/**` | `export { ScheduleView, LiveCalendarInput }` | Everything outside `src/features/schedule/` |
| `mobile-hub-pacing` | `src/features/ideas/**`, `src/features/pacing/**`, `src/features/reflection/**` | Existing named exports | Everything outside those 3 directories |
| `site-configurator` | `src/features/config/**` | `export { SiteConfigView }` | Everything outside `src/features/config/` |

---

## 4. Detailed Feature Contracts per Subagent

### Subagent 1: `schedule-engine` (`src/features/schedule/**`)
- **`LiveCalendarInput`**:
  - Renders inside `.ops-topbar-center` using `.ui-command-pill`, `.ui-command-input`, `.ui-command-mic`, and `.ui-command-preview`.
  - Supports **text natural language** (e.g., `"Hey, can you add a reminder for Submit Problem Set at 5pm"` or `"Add scheduled event Lab Sync between 2pm and 3:30pm"`) with live parsed preview (`actions.parseLiveCommand`) + Enter/click submit (`actions.submitLiveCommand`) so blocks/reminders populate right in front of the user's eyes.
  - Supports **voice input** via browser `SpeechRecognition` / `webkitSpeechRecognition` mic button (with a clean 1-click sample voice phrase fallback button if the browser environment lacks microphone hardware).
- **`ScheduleView`**:
  - Uses `.ops-split-schedule` (left timeline + right Daily Briefing & Priority Queue rail, matching Phase 1 Main Schedule View mockup).
  - **Clear Calendar**: Clean `Day` / `Week` toggle (`state.scheduleViewMode`, `actions.setScheduleViewMode`), date navigation (`Prev`, `Today`, `Next`), daily hourly timeline (`TimeBlock`) + weekly 7-column overview (`.ui-week-grid`) plus quick inline `+ Add Block` bar (committed Baseline, Empty Zone, or Reminder in <=2 clicks).
  - **Baseline Responsibilities & Why Anchors**: Displays `Why: Family | School | Organization | Health` badges on baseline blocks and an interactive compact **Why Statements Anchor Card** where users can view/edit the core Why statement for each of the 4 pillars (`actions.updateWhyStatement`).
  - **Empty Zones & One-Tap Spillover**: Highlights `kind === 'empty-zone'` blocks in sage-teal (`TimeBlock`), lets open Empty Zones pull an active non-waiting idea in 1 click (`actions.assignIdeaToBlock`), and renders a prominent primary **`Spillover ->`** button (`actions.spilloverEmptyZone(block.id)`) on assigned Empty Zones to push unfinished work into the next open Empty Zone in 1 click. Clicking a `kind === 'reflection'` block opens the Reflection Drawer (`actions.setReflectionOpen(true)`).
  - **Daily Reminder / Briefing Rail**: Renders the **Daily Briefing** notification card (showing remaining baseline count, top priority non-waiting idea, flagged active bottlenecks count, and quick jump links), **Priority Queue** (top non-waiting ranked ideas with 1-click schedule into Empty Zone), and **Reminders** checklist (`actions.toggleReminder`).

### Subagent 2: `ideas-checkups` (`src/features/ideas/**`)
- **`IdeasHubView`**:
  - Top **Fast Quick-Capture Bar** (`.ui-capture-bar`): Idea/bottleneck title, mandatory concrete `Starting step:` input, project selector (`OHCR`, `CBS`, `Personal`, or quick `+ Project`), `Bottleneck` toggle pill, and primary `Add` button (`actions.addIdea`).
  - Uses `.ops-split-hub` below:
    - **Left Column — Ranked Projects & Bottlenecks**:
      - Project filter (`All` + each project) and grouped Project Cards (`OHCR`, `CBS`, `Personal`).
      - Active items ordered strictly by numeric `priorityRank` (`RankBadge` `1`, `2`, `3`...), showing concrete `Starting step:` badge (`tone="zone"`), warm amber `Bottleneck` badge (`actions.toggleIdeaBottleneck`), 1-click rank reorder (`up`/`down` via `actions.moveIdeaRank`), inline starting-step edit or delete (`actions.deleteIdea`), 1-click **`Send to Empty Zone`** (`actions.assignIdeaToNextEmptyZone`), and 1-click **`Waiting On`** `TogglePill` (`actions.toggleWaitingOn`).
    - **Right Column — Waiting-On & Recurring Project Checkups**:
      - **Waiting On (Hidden from Empty Zones)** card listing all `status === 'waiting-on'` items with their `waitingReason` and 1-click `Unblock` toggle so they stay out of daily Empty Zones until ready.
      - **Project Checkups (`CBS`, `OHCR`)** cards: displays cadence & next review date, resurfaced `waiting-on` bottlenecks belonging to that project, standing benchmark checkboxes (`CheckboxRow` + `actions.toggleCheckupBenchmark` + quick add benchmark), editable **Next Week's Deliverables** list (`actions.updateCheckupDeliverables`), and 1-click **`Complete Checkup`** button (`actions.completeProjectCheckup(id, true)`).

### Subagent 3: `pacing-roi` (`src/features/pacing/**`)
- **`PacingRoiView`**:
  - Clean 2-section operations view using shared primitives (`StatCard`, `Card`, `ProgressBar`, `SegmentedControl`, `Badge`, `Button`):
  - **Section A — Multi-Day Goal Delegation & Confidence Pacing Loop**:
    - Quick inline **Delegate Multi-Day Goal** bar (`actions.schedulePacedGoal` — can link an active idea from `state.ideas` or enter custom goal, target days, estimated hours, daily minutes) that schedules sessions across multiple days.
    - Active `PacedGoal` cards showing Day `daysElapsed` of `targetDays`, Expected % (`Math.round((daysElapsed/targetDays)*100)%`) vs Actual % (`ProgressBar`), current daily minutes allocated, scheduled calendar blocks count, and the **Confidence Check-In Prompt** card (e.g., *"4 days in: You are supposed to be 40% done with this project. How confident are you that you are on track?"*).
    - Interactive check-in controls: Actual % slider/input + 1-click Confidence buttons (`Behind Pace -> Add Time`, `On Track -> Hold Steady`, `Ahead / Over-Scheduled -> Trim Future Blocks`) calling `actions.submitConfidenceCheckIn`, plus recent `pacingLogs` audit feed showing exact calendar recalibrations without affecting Protected Streaks.
  - **Section B — Offloaded Responsibilities & Hourly ROI Engine**:
    - Editable **Profitable Work Hourly Rate (`$/hr`)** header control (`state.hourlyRateDollars`, `actions.setHourlyRateDollars`) + aggregate ROI summary `StatCard`s (Total Hours Saved, Total Spend, Value of Reclaimed Time, Net Profitable Impact).
    - Quick-add form to log an offloaded responsibility (`title`, `category`, `hoursSaved`, `costDollars`, `paymentMethod`, `paymentDetail` -> `actions.addOffloadedTask`).
    - Clean ledger rows comparing each offloaded task's implied hourly cost (`costDollars / hoursSaved`) against `state.hourlyRateDollars` with an unmistakable verdict badge (`Pays Off · +$X net` in `tone="streak"` vs `Costs More · -$X net` in `tone="danger"`).

### Subagent 4: `reflection-streaks` (`src/features/reflection/**`)
- **`ReflectionDrawer`**:
  - Uses `<Drawer open={state.isReflectionOpen} onClose={() => actions.setReflectionOpen(false)} title="Daily Reflection & Report" footer={...}>` matching the Phase 1 Reflection Drawer mockup.
  - **Protected Streak Banner** (`Banner tone="streak"`): Prominently displays `{state.streak.currentDays}-Day Protected Streak · Counts Baseline + Reflection Only` (plus best streak & recent 7-day completion dots), explicitly reassuring the user that multi-day timeline recalibrations and Empty Zone spillovers never break streaks.
  - **Daily Report — End-of-Day Baseline Checklist**:
    - Lists all `kind === 'baseline'` blocks for `state.selectedDate` using `CheckboxRow checkTone="green"` synced directly with `actions.toggleBlockCompleted(block.id)` and displaying each block's `Why: <Category>` badge.
    - Quick single-line daily note input (`state.draftDailyNote`, `actions.setDraftDailyNote`).
    - Also offers a 1-click `"Schedule Daily 20:30 Reflection Block"` button if `state.selectedDate` does not yet have a `kind === 'reflection'` block on the calendar.
  - **Guided Self-Reflection**:
    - Displays calm AI reflection prompt card (`.ui-card-subtle`) with 1-click prompt cycle button across `reflectionPrompts` (`"How do you think this week went?..."`) and spacious `TextArea` (`state.draftReflectionText`, `actions.setDraftReflectionText`).
    - Compact expandable/collapsible preview of recent logged reflections (`state.reflections`).
  - **Sticky Footer Actions**:
    - **`Export for Gemini`** (`Button variant="secondary"`): Calls `actions.generateGeminiWeeklyExport()`, copies the formatted weekly reflection + pacing + bottleneck brief to `navigator.clipboard` (with graceful fallback & inline preview toggle + `.md` download link), and triggers toast confirmation.
    - **`Complete Reflection & Lock Streak`** (`Button variant="primary"`): Calls `actions.completeDailyReflection()`.

---

## 5. Verification Requirement Before Reporting Done
Each subagent MUST run `npx tsc --noEmit` inside `C:\Users\ytho0\.gemini\antigravity\scratch\clearops` after writing its slice to verify zero TypeScript errors, while strictly avoiding edits outside its assigned `src/features/<slice>/` folder.

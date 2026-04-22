# BE Learning Platform — Design Spec

## Overview

A professional learning platform that renders the existing BE Learning Roadmap markdown files (~120 files, 5 levels) into a beautiful, interactive web app with GitHub Dark / Terminal aesthetic. Deployed as a static site on GitHub Pages / GitLab Pages.

**Target user:** FE developers learning backend (primary: Đăng Thế Trung, shareable via URL).

## Tech Stack

| Purpose | Technology |
|---------|-----------|
| Build + Dev Server | Vite |
| UI Framework | React |
| Styling | Tailwind CSS + `@tailwindcss/typography` |
| Animation | Framer Motion |
| Markdown → React | `react-markdown` + custom components |
| Code Highlighting | Shiki (theme-aware, build-compatible) |
| Search | Fuse.js (client-side fuzzy search) |
| Routing | React Router (each .md = 1 route) |
| Progress Tracking | localStorage |

**No backend.** Content is fetched at runtime from bundled .md files. Deploy as static site.

## Visual Style: GitHub Dark / Terminal

### Color Palette

| Token | Dark Mode | Light Mode |
|-------|-----------|------------|
| `bg-primary` | `#0d1117` | `#ffffff` |
| `bg-secondary` | `#161b22` | `#f6f8fa` |
| `bg-nav` | `#010409` | `#ffffff` |
| `border` | `#30363d` | `#d0d7de` |
| `text-primary` | `#e6edf3` | `#1f2328` |
| `text-secondary` | `#8b949e` | `#656d76` |
| `accent-green` | `#3fb950` | `#1a7f37` |
| `accent-blue` | `#58a6ff` | `#0969da` |
| `accent-orange` | `#f0883e` | `#bf8700` |
| `accent-red` | `#f85149` | `#cf222e` |
| `accent-purple` | `#d2a8ff` | `#8250df` |

### Typography

- **Headings:** System sans-serif (Inter), weight 700-800
- **Body:** System sans-serif, 14-16px, line-height 1.8
- **Code / Terminal elements:** `SF Mono` → `Fira Code` → `monospace`
- **Logo:** Terminal prompt style `>_` in monospace, accent green

### Design Elements

- Terminal-style dots (red/yellow/green) on code blocks
- File name label on code blocks with copy button
- Monospace badges for level indicators (`LVL 1`, `LVL 2`)
- Green accent for active/progress states
- Orange for unlocked/in-progress secondary states
- Reduced opacity for locked/disabled content

## Layout: Hybrid (Layout C)

### Two Page Types

#### 1. Dashboard Home (`/`)

The landing page showing overall learning progress.

**Structure:**
```
┌─────────────────────────────────────────────┐
│ >_ BE Learning Roadmap    [🔍 Search] [☀️] │  ← Top nav
├─────────────────────────────────────────────┤
│ $ whoami                                    │
│ Chào Trung 👋                               │  ← Welcome (terminal-style)
│ FE dev → Backend journey                    │
├─────────────────────────────────────────────┤
│ Overall Progress  ████████░░░░░ 18%  🔥 5   │  ← Progress bar + streak
├─────────────────────────────────────────────┤
│ ┌─LVL 1──┐  ┌─LVL 2──┐  ┌─LVL 3──┐       │
│ │● ACTIVE │  │UNLOCKED│  │🔒LOCKED│       │  ← Level cards grid
│ │ 65%     │  │ 10%    │  │  —     │       │
│ └─────────┘  └────────┘  └────────┘       │
│ ┌─LVL 4──┐  ┌─LVL 5──┐  ┌─Continue─┐     │
│ │🔒LOCKED│  │🔒LOCKED│  │ Resume → │     │
│ └─────────┘  └────────┘  └──────────┘     │
└─────────────────────────────────────────────┘
```

**Components:**
- `TopNav`: Logo, search bar (⌘K shortcut), dark/light toggle
- `WelcomeSection`: Terminal `$ whoami` style greeting
- `OverallProgress`: Progress bar + percentage + day streak counter
- `LevelCard`: Level badge, title, description, progress bar, lesson count, status indicator (active/unlocked/locked)
- `ContinueCard`: Quick-resume showing last-read lesson

#### 2. Content Page (flexible routing)

**Routing:** Single catch-all route `/level/*` resolved via manifest slug lookup. Each lesson in the manifest has a unique `slug` derived from its file path.

**Route examples:**
- `/level/1/project-structure/folder-overview` — topic/lesson (Level 1)
- `/level/2/mongodb/schema/basic-types` — topic/subtopic/lesson (Level 2 nested)
- `/level/5/database-design` — flat lesson (Level 5)
- `/level/1/checklist` — level checklist page
- `/level/2/mongodb/exercises` — topic-scoped exercises
- `/level/1/exercises` — level-scoped exercises

The manifest builder generates slugs by stripping numeric prefixes and extensions from filenames (e.g., `01-folder-overview.md` → `folder-overview`). The router uses a catch-all `*` param and resolves the matching lesson from the manifest.

The lesson reading page.

**Structure:**
```
┌──────────────────────────────────────────────────────┐
│ >_ Level 2 / Controller / 01    [🔍] [☀️] [☰]      │  ← Top nav + breadcrumb
├──────────────────────────────────┬───────────────────┤
│                                  │ ON THIS PAGE      │
│ [Level 2] [5 min] [Controller]   │ ● Section 1       │  ← Tags
│                                  │   Section 2       │
│ # Controller là gì?             │   Section 3       │  ← Title
│                                  │   Section 4       │
│ Body text rendered from .md...   │                   │  ← TOC (right)
│                                  │ ✓ CHECKLIST       │
│ ┌──────────────────────────┐    │ [x] Item 1        │
│ │ ● ● ● next-api.ts  📋   │    │ [ ] Item 2        │  ← Checklist
│ │ code block with syntax   │    │ [ ] Item 3        │
│ │ highlighting              │    │                   │
│ └──────────────────────────┘    │ LEVEL 2 PROGRESS  │
│                                  │ ████░░░ 10%       │  ← Level progress
│ | FE Concept | BE Equivalent |   │                   │
│ |------------|---------------|   │                   │  ← Styled table
│                                  │                   │
│ ← Previous          Next 02 →   │                   │  ← Bottom nav
├──────────────────────────────────┴───────────────────┤
```

**Components:**
- `TopNav`: Same as dashboard + breadcrumb + hamburger menu
- `Breadcrumb`: `Level > Topic > Lesson` with clickable links
- `LessonMeta`: Tags for level, read time, topic category
- `MarkdownRenderer`: `react-markdown` with custom component overrides
  - `CodeBlock`: Terminal dots, filename, syntax highlight via Shiki, copy button
  - `Table`: Styled with alternating rows, rounded borders
  - `InlineCode`: Highlighted with background
  - `Heading`: With anchor links for TOC
  - `Blockquote`: Styled callout
- `TableOfContents`: Right sidebar, auto-generated from headings, active section highlight (green left border), scroll-spy
- `LessonChecklist`: Interactive checkboxes, persisted to localStorage
- `LevelProgress`: Mini progress bar for current level
- `BottomNav`: Previous/Next lesson navigation
- `SidebarSlideOver`: Full navigation tree, triggered by ☰ hamburger, overlay with backdrop

## Features

### 1. Progress Tracking (localStorage)

```
localStorage keys:
  - "progress:{levelId}:{lessonSlug}" → boolean (lesson marked complete)
  - "checklist:{levelId}:{itemIndex}" → boolean (per-level checklist items)
  - "last-read" → { levelId, topicId, lessonId, slug }
  - "streak" → { count, lastDate }
```

**Checklist model:** Checklists are **per-level**, not per-lesson. Each level has a `checklist.md` file with checkbox items. These are parsed at build time and shown in the right sidebar of every lesson within that level. Users can also view the full checklist via `/level/:levelId/checklist`.

- Level cards on dashboard calculate progress from completed checklist items
- Overall progress = total completed / total lessons
- "Continue" card reads `last-read` from localStorage
- Day streak increments when user visits on consecutive days

### 2. Search (Fuse.js)

- Index built at build time from all markdown content
- Search modal triggered by `⌘K` or clicking search bar
- Fuzzy search across: title, headings, body text
- Results grouped by level with highlighted matches
- Keyboard navigation (↑↓ Enter Esc)

### 3. Code Highlighting (Shiki)

- Theme: `github-dark` for dark mode, `github-light` for light mode
- Language detection from markdown code fence (```ts, ```bash, etc.)
- Terminal dots decoration (red/yellow/green circles)
- Filename label from markdown comment or code fence meta
- Copy-to-clipboard button

### 4. Table of Contents

- Auto-generated from h2/h3 headings in markdown
- Scroll-spy: active section highlighted with green left border
- Sticky position on right sidebar
- Hidden on mobile (available via dropdown or at top of article)

### 5. Light/Dark Mode

- Default: dark mode (matches GitHub Dark aesthetic)
- Toggle in top nav
- Persisted to localStorage
- Uses Tailwind `dark:` variant with class strategy
- Smooth transition animation via Framer Motion

### 6. Breadcrumb Navigation

- Format: `Level Name / Topic Name / Lesson Title`
- Each segment clickable
- Level link → dashboard scrolled to that level
- Topic link → first lesson of that topic

## Responsive Behavior

| Breakpoint | Layout Changes |
|-----------|---------------|
| Desktop (≥1024px) | Full layout: content + right TOC |
| Tablet (768-1023px) | TOC moves to collapsible top section |
| Mobile (<768px) | Single column, TOC as dropdown, hamburger for nav, bottom nav simplified |

**Dashboard responsive:**
- Desktop: 3-column grid for level cards
- Tablet: 2-column grid
- Mobile: Single column stack

## Content Pipeline

1. Markdown files live in their existing folder structure (`level-1-read-understand/`, etc.)
2. At build time (Vite plugin or script): scan all `.md` files, extract metadata (title from first `#`, headings for TOC, word count for read time)
3. Generate a manifest JSON with normalized structure:
   ```
   {
     levels: [{
       id, title, description, estimatedTime,
       hasContent: boolean,  // false if dir exists but no .md files
       topics: [{
         id, title,
         lessons: [{ id, title, slug, filePath, wordCount, readTime }],
         subtopics: [{  // for nested dirs (e.g., level-2/02-mongodb/03-schema/)
           id, title,
           lessons: [{ id, title, slug, filePath, wordCount, readTime }]
         }],
         exercises: [{ id, title, filePath }],  // topic-level exercises
         cheatsheet: { filePath } | null
       }],
       checklist: [{ text, index }],  // parsed from checklist.md
       exercises: [{ id, title, filePath }]  // level-root exercises
     }]
   }
   ```
4. **Structure normalization rules:**
   - **Recursive scan:** The builder walks the directory tree recursively. Subdirs of a level = topics. Subdirs of a topic = subtopics. Max depth: 3 (level/topic/subtopic/lesson.md).
   - If a level has flat `.md` files (no subdirs) → auto-create one topic per file (topic.id = file prefix)
   - `checklist.md` → parsed into checklist items array, not treated as a lesson
   - `README.md` → level description, not treated as a lesson. If no README exists, description is derived from the level directory name.
   - `exercises/` → can exist at level root OR inside a topic. Both are supported and scoped accordingly.
   - `cheatsheet.md` → treated as a special reference lesson, scoped to its parent topic
   - **Empty levels:** If a level directory has scaffolding (subdirs) but zero `.md` files, it is included in the manifest with `hasContent: false`. Dashboard shows it as "Coming Soon" instead of locked.

   **Real structure examples:**
   - Level 1: `level-1/01-project-structure/01-folder-overview.md` → 2-level (topic/lesson)
   - Level 2: `level-2/02-mongodb/03-schema/01-basic-types.md` → 3-level (topic/subtopic/lesson)
   - Level 2: `level-2/02-mongodb/exercises/01-basic-10.md` → topic-scoped exercises
   - Level 5: `level-5/01-database-design.md` → flat (auto-topic)
   - Level 4: empty dirs, no .md files → `hasContent: false`
5. At runtime: React Router uses a catch-all route, resolves lesson via manifest slug lookup, fetches `.md` content, renders via `react-markdown`
6. Manifest drives: dashboard cards, breadcrumbs, prev/next navigation, search index, sidebar tree

## Level Locking

All levels are accessible (no hard lock). The "LOCKED" visual state is cosmetic — levels with 0% progress show as locked/dimmed, but users can click into any level. This avoids blocking exploration while still providing visual progression.

## File Structure (Proposed)

```
be-learning-platform/
├── public/
│   └── content/              ← Markdown files copied here at build
│       ├── level-1/
│       ├── level-2/
│       └── ...
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── TopNav.tsx
│   │   │   ├── Breadcrumb.tsx
│   │   │   ├── SidebarSlideOver.tsx
│   │   │   └── BottomNav.tsx
│   │   ├── dashboard/
│   │   │   ├── WelcomeSection.tsx
│   │   │   ├── OverallProgress.tsx
│   │   │   ├── LevelCard.tsx
│   │   │   └── ContinueCard.tsx
│   │   ├── content/
│   │   │   ├── MarkdownRenderer.tsx
│   │   │   ├── CodeBlock.tsx
│   │   │   ├── StyledTable.tsx
│   │   │   └── TableOfContents.tsx
│   │   ├── features/
│   │   │   ├── SearchModal.tsx
│   │   │   ├── LessonChecklist.tsx
│   │   │   └── ThemeToggle.tsx
│   │   └── ui/
│   │       ├── Badge.tsx
│   │       ├── ProgressBar.tsx
│   │       └── ...
│   ├── hooks/
│   │   ├── useProgress.ts
│   │   ├── useSearch.ts
│   │   ├── useTheme.ts
│   │   └── useScrollSpy.ts
│   ├── lib/
│   │   ├── manifest.ts       ← Content manifest loader
│   │   ├── markdown.ts       ← Markdown processing utils
│   │   └── storage.ts        ← localStorage wrapper
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   └── Lesson.tsx
│   ├── styles/
│   │   └── globals.css       ← Tailwind + custom theme tokens
│   ├── App.tsx
│   └── main.tsx
├── scripts/
│   └── build-manifest.ts     ← Scans .md files, generates manifest
├── tailwind.config.ts
├── vite.config.ts
└── package.json
```

## Deployment

- Build: `vite build` → static files in `dist/`
- Deploy: Push to GitHub/GitLab → GitHub Pages / GitLab Pages auto-deploy
- No backend, no API, no database
- All state in localStorage (per-browser)

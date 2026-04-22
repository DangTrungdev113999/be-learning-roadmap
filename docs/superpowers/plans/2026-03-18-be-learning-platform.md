# BE Learning Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a professional learning platform that renders ~120 markdown files into an interactive web app with GitHub Dark / Terminal aesthetic, progress tracking, search, and responsive design.

**Architecture:** Vite + React SPA with React Router catch-all routing. Markdown content is copied to `public/content/` and fetched at runtime via `react-markdown`. A build-time script generates a manifest JSON that drives navigation, search, and progress tracking. All user state lives in localStorage.

**Tech Stack:** Vite, React 18, TypeScript, Tailwind CSS, Framer Motion, react-markdown, Shiki, Fuse.js, React Router v7

**Spec:** `docs/superpowers/specs/2026-03-18-be-learning-platform-design.md`

---

## File Map

```
be-learning-platform/
├── public/
│   └── content/                  ← Markdown files copied at build time
├── scripts/
│   └── build-manifest.ts         ← Scans .md files, generates manifest.json
├── src/
│   ├── main.tsx                   ← React entry point
│   ├── App.tsx                    ← Router setup
│   ├── types.ts                   ← TypeScript type definitions
│   ├── styles/
│   │   └── globals.css            ← Tailwind imports + custom theme tokens
│   ├── lib/
│   │   ├── manifest.ts            ← Load and query manifest
│   │   ├── storage.ts             ← localStorage wrapper (progress, streak, theme)
│   │   └── search-index.ts        ← Fuse.js index builder
│   ├── hooks/
│   │   ├── useTheme.ts            ← Dark/light mode toggle
│   │   ├── useProgress.ts         ← Lesson completion + checklist state
│   │   ├── useScrollSpy.ts        ← Active heading detection for TOC
│   │   └── useSearch.ts           ← Search query + results
│   ├── components/
│   │   ├── ui/
│   │   │   ├── ProgressBar.tsx    ← Reusable progress bar
│   │   │   └── Badge.tsx          ← Level/tag badges
│   │   ├── layout/
│   │   │   ├── TopNav.tsx         ← Logo, search, theme toggle, hamburger
│   │   │   ├── Breadcrumb.tsx     ← Level > Topic > Lesson
│   │   │   ├── BottomNav.tsx      ← Previous/Next lesson
│   │   │   └── SidebarSlideOver.tsx ← Full nav tree overlay
│   │   ├── dashboard/
│   │   │   ├── WelcomeSection.tsx ← Terminal whoami greeting
│   │   │   ├── OverallProgress.tsx ← Total progress + streak
│   │   │   ├── LevelCard.tsx      ← Level card with status
│   │   │   └── ContinueCard.tsx   ← Resume last lesson
│   │   ├── content/
│   │   │   ├── MarkdownRenderer.tsx ← react-markdown + custom components
│   │   │   ├── CodeBlock.tsx      ← Shiki syntax highlight + terminal dots
│   │   │   ├── StyledTable.tsx    ← Table with GitHub styling
│   │   │   └── TableOfContents.tsx ← Right sidebar TOC with scroll-spy
│   │   └── features/
│   │       ├── SearchModal.tsx    ← Cmd+K search overlay
│   │       ├── LessonChecklist.tsx ← Per-level checklist in sidebar
│   │       └── ThemeToggle.tsx    ← Dark/light switch
│   └── pages/
│       ├── Dashboard.tsx          ← Home page
│       └── Lesson.tsx             ← Content page
├── tailwind.config.ts
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## Task 1: Project Scaffolding + Tailwind Theme

**Files:**
- Create: `be-learning-platform/package.json`
- Create: `be-learning-platform/vite.config.ts`
- Create: `be-learning-platform/tsconfig.json`
- Create: `be-learning-platform/tailwind.config.ts`
- Create: `be-learning-platform/src/main.tsx`
- Create: `be-learning-platform/src/App.tsx`
- Create: `be-learning-platform/src/styles/globals.css`
- Create: `be-learning-platform/index.html`

- [ ] **Step 1: Create project with Vite**

```bash
cd /Users/trungdt/Desktop/be-learning-roadmap
npm create vite@latest be-learning-platform -- --template react-ts
cd be-learning-platform
```

- [ ] **Step 2: Install core dependencies**

```bash
npm install react-router-dom framer-motion react-markdown remark-gfm rehype-raw shiki fuse.js
npm install -D tailwindcss @tailwindcss/typography autoprefixer postcss
```

- [ ] **Step 3: Configure Tailwind with GitHub Dark theme tokens**

Write `tailwind.config.ts` with custom `gh` color tokens mapped to CSS variables. Extend font families with mono (SF Mono, Fira Code) and sans (Inter). Enable `darkMode: 'class'`. Add `@tailwindcss/typography` plugin.

Key colors: `gh-bg-primary`, `gh-bg-secondary`, `gh-bg-nav`, `gh-border`, `gh-text-primary`, `gh-text-secondary`, `gh-accent-green/blue/orange/red/purple`.

- [ ] **Step 4: Write globals.css with CSS custom properties for dark/light**

Write `src/styles/globals.css` with:
- Tailwind directives (`@tailwind base/components/utilities`)
- `:root` with dark mode values (default)
- `.light` class with light mode values
- Body base styles: `bg-gh-bg-primary`, `text-gh-text-primary`, Inter font, smooth transition

Dark mode color tokens from spec:
```
--bg-primary: #0d1117; --bg-secondary: #161b22; --bg-nav: #010409;
--border-color: #30363d; --text-primary: #e6edf3; --text-secondary: #8b949e;
--accent-green: #3fb950; --accent-blue: #58a6ff; --accent-orange: #f0883e;
--accent-red: #f85149; --accent-purple: #d2a8ff;
```

Light mode tokens from spec:
```
--bg-primary: #ffffff; --bg-secondary: #f6f8fa; --bg-nav: #ffffff;
--border-color: #d0d7de; --text-primary: #1f2328; --text-secondary: #656d76;
--accent-green: #1a7f37; --accent-blue: #0969da; --accent-orange: #bf8700;
--accent-red: #cf222e; --accent-purple: #8250df;
```

- [ ] **Step 5: Write minimal App.tsx with router shell**

Write `src/App.tsx` with BrowserRouter, two routes: `/` (Dashboard placeholder) and `/level/*` (Lesson placeholder).

Write `src/main.tsx` with React 18 `createRoot`, import globals.css.

- [ ] **Step 6: Verify dev server starts**

```bash
npm run dev
```

Expected: Vite dev server starts, browser shows "Dashboard" at `/`, "Lesson" at `/level/anything`.

- [ ] **Step 7: Commit**

```bash
git add be-learning-platform/
git commit -m "feat: scaffold Vite + React + Tailwind project with GitHub Dark theme tokens"
```

---

## Task 2: Build Manifest Script

**Files:**
- Create: `be-learning-platform/scripts/build-manifest.ts`
- Create: `be-learning-platform/src/lib/manifest.ts`
- Create: `be-learning-platform/src/types.ts`

- [ ] **Step 1: Define TypeScript types for manifest**

Write `src/types.ts` with interfaces: `Lesson` (id, title, slug, filePath, wordCount, readTime), `Subtopic` (id, title, lessons), `Exercise` (id, title, filePath), `ChecklistItem` (text, index), `Topic` (id, title, lessons, subtopics, exercises, cheatsheet), `Level` (id, title, description, estimatedTime, hasContent, topics, checklist, exercises), `Manifest` (levels, totalLessons, generatedAt).

- [ ] **Step 2: Write build-manifest.ts**

Write `scripts/build-manifest.ts` — a Node script using `fs` and `path` that:

1. Defines the 5 level directories with their metadata (id, title, estimatedTime)
2. For each level directory, recursively scans the file tree:
   - Subdirectories = topics. Sub-subdirectories = subtopics. Max depth 3.
   - `.md` files: extract title from first `# ` heading, compute word count and read time (200 wpm)
   - Generate slug by stripping numeric prefix (`/^\d+-/`) and `.md` extension
   - Special files: `checklist.md` → parse `- [ ]` items into checklist array. `README.md` → extract as level description. `cheatsheet.md` → attach to parent topic. Files in `exercises/` dirs → exercises array scoped to parent (level or topic).
   - If level has subdirs but zero lesson `.md` files → `hasContent: false`
   - If level has flat `.md` files (no subdirs) → auto-create one topic per file
3. Copies all `.md` files to `public/content/level-{id}/` preserving relative structure
4. Writes `public/content/manifest.json`

Install dev dependency: `npm install -D tsx`

Add to `package.json` scripts:
```json
"build:manifest": "npx tsx scripts/build-manifest.ts",
"prebuild": "npm run build:manifest",
"predev": "npm run build:manifest"
```

- [ ] **Step 3: Write manifest.ts loader**

Write `src/lib/manifest.ts` with:
- `loadManifest()`: fetches `/content/manifest.json`, caches result
- `findLessonBySlugPath(manifest, slugPath)`: walks manifest tree matching URL slug parts to level → topic → subtopic → lesson. Returns `{ lesson, level, topic, breadcrumb[] }` or null.
- `getAdjacentLessons(manifest, currentSlug)`: returns `{ prev, next }` for bottom nav
- `flattenLessons(manifest)`: returns all lessons in order across all levels/topics/subtopics
- `getLessonUrl(levelId, topic, subtopic, lesson)`: constructs URL path from manifest data

- [ ] **Step 4: Run manifest build, verify output**

```bash
npm run build:manifest
```

Expected: `public/content/manifest.json` exists with correct level structure. Verify with:
```bash
node -e "const m = require('./public/content/manifest.json'); console.log('Levels:', m.levels.length, 'Lessons:', m.totalLessons)"
```

Should output something like: `Levels: 5 Lessons: 100+`

- [ ] **Step 5: Commit**

```bash
git add be-learning-platform/
git commit -m "feat: add build-manifest script and manifest loader"
```

---

## Task 3: Theme System + Core UI Components

**Files:**
- Create: `src/hooks/useTheme.ts`
- Create: `src/components/features/ThemeToggle.tsx`
- Create: `src/components/ui/ProgressBar.tsx`
- Create: `src/components/ui/Badge.tsx`

- [ ] **Step 1: Write useTheme hook**

Write `src/hooks/useTheme.ts`:
- State: `'dark' | 'light'`, initialized from `localStorage.getItem('theme')` or default `'dark'`
- Effect: toggles `.light` class on `document.documentElement`, saves to localStorage
- Returns `{ theme, toggle }`

- [ ] **Step 2: Write ThemeToggle component**

Write `src/components/features/ThemeToggle.tsx`:
- Button with sun/moon icon
- Framer Motion rotation animation on toggle
- Styled: `w-8 h-8`, `bg-gh-bg-secondary`, `border border-gh-border`, rounded

- [ ] **Step 3: Write ProgressBar component**

Write `src/components/ui/ProgressBar.tsx`:
- Props: `value` (0-100), `color` (default green), `size` ('sm'|'md')
- Outer: rounded track with `bg-gh-bg-secondary`
- Inner: filled bar with transition animation

- [ ] **Step 4: Write Badge component**

Write `src/components/ui/Badge.tsx`:
- Props: `children`, `variant` ('green'|'orange'|'blue'|'default')
- Monospace font, small text, colored background with 15% opacity
- E.g. green variant: `text-gh-accent-green bg-gh-accent-green/15`

- [ ] **Step 5: Verify components render**

Temporarily render all components in App.tsx. Check: theme toggle switches dark/light, progress bar fills, badges show correct colors.

- [ ] **Step 6: Commit**

```bash
git add be-learning-platform/src/
git commit -m "feat: add theme system, ProgressBar, and Badge components"
```

---

## Task 4: localStorage Hooks (Progress + Streak)

**Files:**
- Create: `src/lib/storage.ts`
- Create: `src/hooks/useProgress.ts`

- [ ] **Step 1: Write storage utility**

Write `src/lib/storage.ts`:
- `storage.get<T>(key, fallback)`: parse JSON from localStorage, return fallback on error
- `storage.set(key, value)`: JSON.stringify to localStorage
- `storage.remove(key)`: remove item

- [ ] **Step 2: Write useProgress hook**

Write `src/hooks/useProgress.ts`:
- `isLessonComplete(levelId, slug)` → reads `progress:{levelId}:{slug}`
- `toggleLesson(levelId, slug)` → toggles boolean
- `isChecklistItemDone(levelId, index)` → reads `checklist:{levelId}:{index}`
- `toggleChecklistItem(levelId, index)` → toggles boolean
- `setLastRead(data)` / `getLastRead()` → `last-read` key
- `getStreak()` → manages `streak` key with consecutive day logic:
  - Same day: return current count
  - Yesterday: increment and save
  - Older: reset to 1

Uses `useState` counter to force re-renders when localStorage changes.

- [ ] **Step 3: Verify localStorage works**

Call `useProgress()` in App temporarily, toggle a lesson, check localStorage in DevTools.

- [ ] **Step 4: Commit**

```bash
git add be-learning-platform/src/lib/storage.ts be-learning-platform/src/hooks/useProgress.ts
git commit -m "feat: add localStorage-based progress tracking and streak"
```

---

## Task 5: TopNav + Layout Shell

**Files:**
- Create: `src/components/layout/TopNav.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write TopNav component**

Write `src/components/layout/TopNav.tsx`:
- Props: `breadcrumb?` (array of `{label, to}`), `onMenuClick?`, `onSearchClick?`
- Layout: sticky top, `z-50`, flex between left (logo + breadcrumb) and right (search + theme + menu)
- Logo: `>_` in monospace green, links to `/`
- Breadcrumb: segments separated by `/`, each linked except last
- Search bar: styled input with magnifying glass icon + `⌘K` kbd tag
- ThemeToggle component
- Hamburger button (only shown when `onMenuClick` provided)

- [ ] **Step 2: Update App.tsx with layout shell**

Wrap routes with a layout component. Dashboard renders TopNav without breadcrumb/menu. Lesson route renders TopNav with breadcrumb + menu.

- [ ] **Step 3: Verify nav renders correctly on both routes**

Check: logo links to `/`, search bar renders, theme toggle works, breadcrumb shows on lesson route.

- [ ] **Step 4: Commit**

```bash
git add be-learning-platform/src/
git commit -m "feat: add TopNav with breadcrumb, search bar, and theme toggle"
```

---

## Task 6: Dashboard Page

**Files:**
- Create: `src/pages/Dashboard.tsx`
- Create: `src/components/dashboard/WelcomeSection.tsx`
- Create: `src/components/dashboard/OverallProgress.tsx`
- Create: `src/components/dashboard/LevelCard.tsx`
- Create: `src/components/dashboard/ContinueCard.tsx`

- [ ] **Step 1: Write WelcomeSection**

Terminal `$ whoami` style greeting. Framer Motion fade-in. Green monospace prompt, large bold greeting, secondary text with description.

- [ ] **Step 2: Write OverallProgress**

Card showing:
- "Overall Progress" label (uppercase, letter-spacing)
- Full-width progress bar (green gradient)
- Percentage number (large, green, bold)
- Lesson count (e.g. "16/90 lessons")
- Day streak with fire emoji (separated by border-left)

Uses `useProgress` to calculate totals from manifest.

- [ ] **Step 3: Write LevelCard**

Card for each level:
- Top accent bar (green for active, none for others)
- Level badge: `LVL {n}` in monospace with colored background
- Status indicator: `IN PROGRESS` (green), `UNLOCKED` (gray), `COMING SOON` (dimmed)
- Title + description
- ProgressBar
- Lesson count + estimated time
- Reduced opacity for locked/coming-soon levels
- Framer Motion hover scale effect
- Links to first lesson of the level

- [ ] **Step 4: Write ContinueCard**

Shows last-read lesson from localStorage:
- "Continue" label with arrow icon
- Lesson title (bold)
- Breadcrumb context (level > topic)
- "Resume →" link in green
- Fallback: hidden if no last-read data

- [ ] **Step 5: Write Dashboard page**

Compose: TopNav (no breadcrumb) → WelcomeSection → OverallProgress → grid of LevelCards + ContinueCard. Responsive grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`. Load manifest on mount with `useEffect`.

- [ ] **Step 6: Wire Dashboard into App.tsx router**

Replace placeholder with `<Dashboard />` on `/` route.

- [ ] **Step 7: Verify dashboard renders with real manifest data**

Run `npm run dev`. Check: 5 level cards with correct titles, progress bars at 0%, "Coming Soon" for empty levels, ContinueCard hidden (no history yet).

- [ ] **Step 8: Commit**

```bash
git add be-learning-platform/src/
git commit -m "feat: add Dashboard page with level cards, progress, and continue card"
```

---

## Task 7: Markdown Renderer + Code Highlighting

**Files:**
- Create: `src/components/content/MarkdownRenderer.tsx`
- Create: `src/components/content/CodeBlock.tsx`
- Create: `src/components/content/StyledTable.tsx`

- [ ] **Step 1: Write CodeBlock with Shiki**

Write `src/components/content/CodeBlock.tsx`:
- Props: `children` (code string), `language`, `filename`
- Uses `codeToHtml()` from Shiki with `github-dark` theme
- Header bar: terminal dots (3 colored circles), filename label, copy button
- Body: rendered HTML from Shiki in a scrollable pre
- Copy button: copies raw code, shows "Copied" feedback for 2s
- Styling: rounded border, `bg-gh-bg-secondary`

- [ ] **Step 2: Write StyledTable**

Write `src/components/content/StyledTable.tsx`:
- Wraps `<table>` with overflow-x-auto container + rounded border
- Header cells: `bg-gh-bg-secondary`, semibold, secondary text color
- Body cells: standard padding, bottom border
- Last row: no bottom border

- [ ] **Step 3: Write MarkdownRenderer**

Write `src/components/content/MarkdownRenderer.tsx`:
- Uses `react-markdown` with `remark-gfm` + `rehype-raw` plugins
- Custom component overrides:
  - `code`: fenced blocks → `CodeBlock` (detect via `className` language match), inline → styled `<code>` with blue text + bg
  - `table` → `StyledTable`
  - `h2` → add slug `id` for anchor links, bottom border, `scroll-mt-16`
  - `h3` → add slug `id`, `scroll-mt-16`
  - `blockquote` → blue left border callout
  - `p` → relaxed line height
  - `ul/ol` → proper spacing
  - `strong` → primary text color
  - `a` → blue colored links with hover underline

- [ ] **Step 4: Test with a real markdown file**

Temporarily fetch and render `/content/level-2/01-controller/01-what-is-controller.md` on the lesson route. Verify: headings styled with IDs, code blocks have terminal dots + syntax highlighting, tables render with borders, inline code highlighted in blue.

- [ ] **Step 5: Commit**

```bash
git add be-learning-platform/src/components/content/
git commit -m "feat: add MarkdownRenderer with Shiki code blocks and styled tables"
```

---

## Task 8: Content Page (Lesson)

**Files:**
- Create: `src/pages/Lesson.tsx`
- Create: `src/components/content/TableOfContents.tsx`
- Create: `src/components/layout/Breadcrumb.tsx`
- Create: `src/components/layout/BottomNav.tsx`
- Create: `src/hooks/useScrollSpy.ts`

- [ ] **Step 1: Write useScrollSpy hook**

Write `src/hooks/useScrollSpy.ts`:
- Input: array of heading `id` strings
- Uses `IntersectionObserver` with `rootMargin: '-80px 0px -60% 0px'`
- Returns the `id` of the currently visible/active heading
- Cleans up observer on unmount

- [ ] **Step 2: Write TableOfContents**

Write `src/components/content/TableOfContents.tsx`:
- Props: `content` (markdown string), `activeId` (from useScrollSpy)
- Extracts `h2`/`h3` headings from markdown via regex
- Renders sticky sidebar list
- Active heading: green left border + green text + subtle background
- Inactive: gray text, transparent border
- h3 items indented slightly

- [ ] **Step 3: Write Breadcrumb component**

Write `src/components/layout/Breadcrumb.tsx`:
- Props: `items` array of `{label, to}`
- Renders segments separated by `/`
- All except last segment are `<Link>` with blue color
- Last segment is plain text with primary color

- [ ] **Step 4: Write BottomNav**

Write `src/components/layout/BottomNav.tsx`:
- Props: `prev` and `next` (Lesson | null)
- Top border separator
- Left side: "Previous" label + lesson title (or dimmed "—" if null)
- Right side: "Next" label + lesson title in blue + arrow
- Links to lesson URLs

- [ ] **Step 5: Write Lesson page**

Write `src/pages/Lesson.tsx`:
1. Get slug path from `useParams('*')`
2. Load manifest via `loadManifest()`
3. Find lesson via `findLessonBySlugPath(manifest, slugPath)`
4. Fetch `.md` content from lesson's `filePath`
5. Set `last-read` in localStorage on mount
6. Layout:
   - TopNav with breadcrumb + hamburger + search callbacks
   - Main area (flex): content column + right TOC column
   - Content column: LessonMeta tags (Badge components) → title → MarkdownRenderer → BottomNav
   - Right column (sticky, `w-52`, hidden on mobile): TableOfContents + LessonChecklist + LevelProgress
7. Handle loading state and 404 (lesson not found)

- [ ] **Step 6: Wire Lesson page into App.tsx**

Replace lesson placeholder with `<Lesson />` on `/level/*` route.

- [ ] **Step 7: Verify content page renders a real lesson**

Navigate to `/level/2/controller/what-is-controller`. Check: breadcrumb correct, markdown renders beautifully, TOC shows headings with scroll-spy, bottom nav has next lesson link, meta tags show level + read time.

- [ ] **Step 8: Commit**

```bash
git add be-learning-platform/src/
git commit -m "feat: add Lesson page with TOC, breadcrumb, and bottom navigation"
```

---

## Task 9: Sidebar Slide-Over + Checklist

**Files:**
- Create: `src/components/layout/SidebarSlideOver.tsx`
- Create: `src/components/features/LessonChecklist.tsx`

- [ ] **Step 1: Write SidebarSlideOver**

Write `src/components/layout/SidebarSlideOver.tsx`:
- Props: `isOpen`, `onClose`, `manifest`, `currentSlug`
- Framer Motion `AnimatePresence`:
  - Backdrop: fixed black overlay, opacity 0→0.5, closes on click
  - Panel: slides from left (`x: -100%` → `0`), `w-72`, full height, `z-50`
- Content: full navigation tree from manifest
  - Level headers (collapsible)
  - Topic items (indented)
  - Lesson links (further indented)
  - Current lesson highlighted with green accent
- Scrollable overflow

- [ ] **Step 2: Write LessonChecklist**

Write `src/components/features/LessonChecklist.tsx`:
- Props: `levelId`, `checklist` (ChecklistItem[])
- Renders checkboxes from level's checklist data
- Uses `useProgress().isChecklistItemDone` / `toggleChecklistItem`
- Completed items: green check, strikethrough text, reduced opacity
- Uncompleted: empty checkbox, normal text
- Header: "CHECKLIST" in uppercase small text

- [ ] **Step 3: Integrate sidebar + checklist into Lesson page**

- Wire hamburger ☰ onClick to toggle sidebar open state
- Pass manifest + current slug to SidebarSlideOver
- Add LessonChecklist below TOC in right column

- [ ] **Step 4: Verify sidebar opens/closes, checklist persists**

Test: click ☰ → sidebar slides in with nav tree, current lesson highlighted. Click backdrop → closes. Check/uncheck checklist items → refresh page → state persists.

- [ ] **Step 5: Commit**

```bash
git add be-learning-platform/src/
git commit -m "feat: add sidebar slide-over navigation and per-level checklist"
```

---

## Task 10: Search Modal (Fuse.js)

**Files:**
- Create: `src/lib/search-index.ts`
- Create: `src/hooks/useSearch.ts`
- Create: `src/components/features/SearchModal.tsx`

- [ ] **Step 1: Write search index builder**

Write `src/lib/search-index.ts`:
- `buildSearchIndex(manifest)`: creates Fuse.js instance from flattened lessons
- Search items: `{ title, slug, levelTitle, levelId }`
- Fuse options: keys `['title', 'levelTitle']`, threshold `0.4`, `includeMatches: true`
- Caches instance after first build

- [ ] **Step 2: Write useSearch hook**

Write `src/hooks/useSearch.ts`:
- State: `query` string, `results` array, `isOpen` boolean
- `setQuery(q)`: runs Fuse search, debounced 150ms
- `open()` / `close()`: toggle modal visibility
- `selectedIndex`: for keyboard navigation
- Returns `{ query, setQuery, results, isOpen, open, close, selectedIndex, setSelectedIndex }`

- [ ] **Step 3: Write SearchModal**

Write `src/components/features/SearchModal.tsx`:
- Framer Motion fade-in overlay + scale-in modal
- Input field at top with autofocus
- Results list below, grouped by level
- Each result: lesson title (with match highlights), level badge
- Keyboard: ↑↓ to navigate, Enter to select, Esc to close
- Click result → navigate to lesson URL via `useNavigate()`, close modal
- Empty state: "Type to search across all lessons"

- [ ] **Step 4: Wire Cmd+K keyboard shortcut globally**

In App.tsx, add `useEffect` with `keydown` listener:
- `(e.metaKey || e.ctrlKey) && e.key === 'k'` → `e.preventDefault()`, open search
- Pass `onSearchClick` to TopNav

- [ ] **Step 5: Verify search works**

Type a lesson title → see results grouped by level. Click result → navigate to lesson. Press Esc → close. Press Cmd+K → opens from any page.

- [ ] **Step 6: Commit**

```bash
git add be-learning-platform/src/
git commit -m "feat: add Fuse.js search with Cmd+K modal and keyboard navigation"
```

---

## Task 11: Responsive Design + Animations

**Files:**
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/pages/Lesson.tsx`
- Modify: `src/components/content/TableOfContents.tsx`
- Modify: `src/components/layout/TopNav.tsx`

- [ ] **Step 1: Dashboard responsive grid**

Ensure level cards use: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`. Verify stacking on mobile, 2-col on tablet, 3-col on desktop.

- [ ] **Step 2: Lesson page responsive layout**

- Desktop (`lg:` and up): content + right TOC sidebar (flex row)
- Tablet/Mobile (`< lg`): hide right TOC sidebar, add collapsible TOC toggle at top of content area (click to expand/collapse heading list)
- BottomNav: simplify on mobile (shorter titles, truncate with ellipsis)

- [ ] **Step 3: TopNav responsive**

- Mobile: hide "Search..." text in search bar, show only magnifying glass icon
- Keep theme toggle and hamburger always visible

- [ ] **Step 4: Add Framer Motion page transitions**

Wrap Dashboard and Lesson page content with:
```tsx
<motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
```

- [ ] **Step 5: Add stagger animation to level cards**

Use Framer Motion `variants` with `staggerChildren: 0.05` on the grid container, `fadeInUp` variant on each LevelCard.

- [ ] **Step 6: Test on mobile viewport (Chrome DevTools)**

Verify: Dashboard cards stack, TopNav adapts, TOC hidden on mobile with toggle available, content readable and scrollable, sidebar works on mobile.

- [ ] **Step 7: Commit**

```bash
git add be-learning-platform/src/
git commit -m "feat: add responsive design and page transition animations"
```

---

## Task 12: Final Polish + Build Verification

**Files:**
- Modify: `be-learning-platform/vite.config.ts`
- Create: `be-learning-platform/.gitignore`

- [ ] **Step 1: Configure Vite for static deployment**

Update `vite.config.ts`:
- Set `base: './'` for relative paths (GitHub Pages compatibility)
- Set `build.outDir: 'dist'`

- [ ] **Step 2: Handle SPA routing on GitHub Pages**

GitHub Pages doesn't support client-side routing natively. Create a `public/404.html` that redirects to `index.html` preserving the path:

```html
<!DOCTYPE html>
<html>
<head>
  <script>
    // Redirect 404 to index.html with path preserved as query param
    // GitHub Pages serves this on any unknown route
    var path = window.location.pathname + window.location.search + window.location.hash;
    window.location.replace(window.location.origin + '/?redirect=' + encodeURIComponent(path));
  </script>
</head>
</html>
```

Then in `src/main.tsx`, add redirect handling before React renders:

```ts
// Handle GitHub Pages SPA redirect
const redirect = new URLSearchParams(window.location.search).get('redirect')
if (redirect) {
  window.history.replaceState(null, '', redirect)
}
```

Alternative: use `HashRouter` instead of `BrowserRouter` (`/#/level/...` URLs). Simpler but uglier URLs.

- [ ] **Step 3: Add .gitignore**

```
node_modules/
dist/
public/content/
.DS_Store
```

`public/content/` is gitignored because it's generated by `build:manifest`.

- [ ] **Step 3: Run production build**

```bash
cd be-learning-platform
npm run build
```

Expected: Build succeeds, `dist/` created with all static files.

- [ ] **Step 4: Preview production build**

```bash
npm run preview
```

Walk through all features:
- Dashboard loads with level cards
- Click a level → navigates to first lesson
- Lesson renders markdown beautifully
- Code blocks have syntax highlighting + terminal dots
- Theme toggle works (dark ↔ light)
- Cmd+K search opens and returns results
- Checklist items persist after refresh
- Breadcrumb navigation works
- Previous/Next navigation works
- Sidebar slide-over shows full nav tree
- Responsive: test mobile, tablet, desktop viewports

- [ ] **Step 5: Commit**

```bash
git add be-learning-platform/
git commit -m "feat: configure Vite build for static deployment, add .gitignore"
```

- [ ] **Step 6: Final verification checklist**

- [ ] Dashboard shows 5 level cards with correct data
- [ ] Content page renders markdown with syntax highlighting
- [ ] Dark/light theme toggle works and persists
- [ ] Search modal opens with Cmd+K, returns results, navigates on select
- [ ] Checklist items persist across page reloads
- [ ] TOC scroll-spy highlights active section
- [ ] Breadcrumb navigation works on all page types
- [ ] Previous/Next navigation works between lessons
- [ ] Sidebar slide-over shows full nav tree
- [ ] Responsive layout works on mobile/tablet/desktop
- [ ] Production build succeeds and preview works

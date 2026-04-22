import fs from 'node:fs';
import path from 'node:path';
import type {
  Lesson,
  Subtopic,
  Exercise,
  ChecklistItem,
  Topic,
  Level,
  Manifest,
} from '../src/types';

// ─── Constants ───────────────────────────────────────────────────────────────

const CONTENT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const OUTPUT_DIR = path.resolve(import.meta.dirname, '..', 'public', 'content');
const WORDS_PER_MINUTE = 200;

interface LevelMeta {
  dir: string;
  id: number;
  title: string;
  estimatedTime: string;
}

const LEVELS: LevelMeta[] = [
  { dir: 'level-1-read-understand', id: 1, title: 'Read & Understand', estimatedTime: '1-2 tu\u1EA7n' },
  { dir: 'level-2-write-api', id: 2, title: 'Write API', estimatedTime: '2-4 tu\u1EA7n' },
  { dir: 'level-3-full-feature', id: 3, title: 'Full Feature', estimatedTime: '1-2 th\u00E1ng' },
  { dir: 'level-4-distributed-system', id: 4, title: 'Distributed System', estimatedTime: '2-3 th\u00E1ng' },
  { dir: 'level-5-architecture', id: 5, title: 'Architecture', estimatedTime: '6+ th\u00E1ng' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripNumericPrefix(name: string): string {
  return name.replace(/^\d+-/, '');
}

function toSlug(filename: string): string {
  return stripNumericPrefix(filename.replace(/\.md$/, ''));
}

function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : 'Untitled';
}

function countWords(content: string): number {
  // Strip markdown syntax for more accurate word count
  const text = content
    .replace(/```[\s\S]*?```/g, '') // remove code blocks
    .replace(/`[^`]*`/g, '')        // remove inline code
    .replace(/[#*_\[\]()>~|-]/g, ' ') // remove markdown chars
    .replace(/https?:\/\/\S+/g, '')   // remove URLs
    .trim();
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

function computeReadTime(wordCount: number): number {
  return Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));
}

function extractSearchText(content: string): string {
  return content
    .replace(/^#\s+.+$/m, '')              // remove title (h1)
    .replace(/```[\s\S]*?```/g, '')         // remove code blocks
    .replace(/`([^`]*)`/g, '$1')            // keep inline code text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // keep link/image text
    .replace(/https?:\/\/\S+/g, '')         // remove URLs
    .replace(/[#*_~>|]/g, '')               // remove markdown chars
    .replace(/^-{3,}$/gm, '')              // remove horizontal rules
    .replace(/^\s*[-*+]\s+/gm, '')          // remove list markers
    .replace(/^\s*\d+\.\s+/gm, '')          // remove ordered list markers
    .replace(/\n{2,}/g, '\n')              // collapse blank lines
    .trim();
}

function parseChecklist(content: string): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const regex = /^- \[[ x]\] (.+)$/gm;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = regex.exec(content)) !== null) {
    items.push({ text: match[1].trim(), index });
    index++;
  }
  return items;
}

function isDirectory(fullPath: string): boolean {
  try {
    return fs.statSync(fullPath).isDirectory();
  } catch {
    return false;
  }
}

function readFileContent(fullPath: string): string {
  return fs.readFileSync(fullPath, 'utf-8');
}

function getSortedEntries(dirPath: string): string[] {
  try {
    return fs.readdirSync(dirPath).sort();
  } catch {
    return [];
  }
}

function isSpecialFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  return lower === 'readme.md' || lower === 'checklist.md' || lower === 'cheatsheet.md';
}

function buildLessonFromFile(
  filePath: string,
  filename: string,
  relativeContentPath: string,
): Lesson {
  const content = readFileContent(filePath);
  const wordCount = countWords(content);
  return {
    id: toSlug(filename),
    title: extractTitle(content),
    slug: toSlug(filename),
    filePath: relativeContentPath,
    wordCount,
    readTime: computeReadTime(wordCount),
    searchText: extractSearchText(content),
  };
}

function buildExerciseFromFile(
  filePath: string,
  filename: string,
  relativeContentPath: string,
): Exercise {
  const content = readFileContent(filePath);
  return {
    id: toSlug(filename),
    title: extractTitle(content),
    filePath: relativeContentPath,
  };
}

// ─── Content path helpers ────────────────────────────────────────────────────

function contentRelPath(levelId: number, ...segments: string[]): string {
  return ['level-' + levelId, ...segments].join('/');
}

// ─── Copy file to public/content ─────────────────────────────────────────────

function copyToPublic(srcPath: string, relPath: string): void {
  const destPath = path.join(OUTPUT_DIR, relPath);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(srcPath, destPath);
}

// ─── Scan subtopics (depth 3: topic > subtopic > lesson) ────────────────────

function scanSubtopic(
  subtopicDir: string,
  subtopicName: string,
  levelId: number,
  topicName: string,
): Subtopic {
  const lessons: Lesson[] = [];

  for (const entry of getSortedEntries(subtopicDir)) {
    const fullPath = path.join(subtopicDir, entry);
    if (!isDirectory(fullPath) && entry.endsWith('.md') && !isSpecialFile(entry)) {
      const relPath = contentRelPath(levelId, topicName, subtopicName, entry);
      lessons.push(buildLessonFromFile(fullPath, entry, relPath));
      copyToPublic(fullPath, relPath);
    }
  }

  return {
    id: stripNumericPrefix(subtopicName),
    title: stripNumericPrefix(subtopicName).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    lessons,
  };
}

// ─── Scan exercises directory ────────────────────────────────────────────────

function scanExercises(
  exercisesDir: string,
  levelId: number,
  ...parentSegments: string[]
): Exercise[] {
  const exercises: Exercise[] = [];

  for (const entry of getSortedEntries(exercisesDir)) {
    const fullPath = path.join(exercisesDir, entry);
    if (!isDirectory(fullPath) && entry.endsWith('.md')) {
      const relPath = contentRelPath(levelId, ...parentSegments, 'exercises', entry);
      exercises.push(buildExerciseFromFile(fullPath, entry, relPath));
      copyToPublic(fullPath, relPath);
    }
  }

  return exercises;
}

// ─── Scan topic directory ────────────────────────────────────────────────────

function scanTopic(
  topicDir: string,
  topicName: string,
  levelId: number,
): Topic {
  const lessons: Lesson[] = [];
  const subtopics: Subtopic[] = [];
  let exercises: Exercise[] = [];
  let cheatsheet: string | null = null;

  for (const entry of getSortedEntries(topicDir)) {
    const fullPath = path.join(topicDir, entry);

    if (isDirectory(fullPath)) {
      if (entry === 'exercises') {
        exercises = scanExercises(fullPath, levelId, topicName);
      } else {
        // Could be a subtopic directory — check if it contains .md files
        const subEntries = getSortedEntries(fullPath);
        const hasMdFiles = subEntries.some(e => e.endsWith('.md') && !isDirectory(path.join(fullPath, e)));
        if (hasMdFiles) {
          subtopics.push(scanSubtopic(fullPath, entry, levelId, topicName));
        }
      }
    } else if (entry.endsWith('.md')) {
      if (entry.toLowerCase() === 'cheatsheet.md') {
        const relPath = contentRelPath(levelId, topicName, entry);
        cheatsheet = relPath;
        copyToPublic(fullPath, relPath);
      } else if (!isSpecialFile(entry)) {
        const relPath = contentRelPath(levelId, topicName, entry);
        lessons.push(buildLessonFromFile(fullPath, entry, relPath));
        copyToPublic(fullPath, relPath);
      }
    }
  }

  // Derive topic title from directory name
  const titleFromDir = stripNumericPrefix(topicName)
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  return {
    id: stripNumericPrefix(topicName),
    title: titleFromDir,
    lessons,
    subtopics,
    exercises,
    cheatsheet,
  };
}

// ─── Scan a level directory ──────────────────────────────────────────────────

function scanLevel(meta: LevelMeta): Level {
  const levelDir = path.join(CONTENT_ROOT, meta.dir);
  let description = '';
  let checklist: ChecklistItem[] = [];
  let levelExercises: Exercise[] = [];
  const topics: Topic[] = [];
  const flatLessonFiles: { filename: string; fullPath: string }[] = [];

  if (!fs.existsSync(levelDir)) {
    return {
      id: meta.id,
      title: meta.title,
      description: '',
      estimatedTime: meta.estimatedTime,
      hasContent: false,
      topics: [],
      checklist: [],
      exercises: [],
    };
  }

  let hasSubdirs = false;

  for (const entry of getSortedEntries(levelDir)) {
    const fullPath = path.join(levelDir, entry);

    if (isDirectory(fullPath)) {
      if (entry === 'exercises') {
        levelExercises = scanExercises(fullPath, meta.id);
      } else {
        hasSubdirs = true;
        topics.push(scanTopic(fullPath, entry, meta.id));
      }
    } else if (entry.endsWith('.md')) {
      if (entry.toLowerCase() === 'readme.md') {
        const content = readFileContent(fullPath);
        description = extractDescription(content);
        const relPath = contentRelPath(meta.id, entry);
        copyToPublic(fullPath, relPath);
      } else if (entry.toLowerCase() === 'checklist.md') {
        const content = readFileContent(fullPath);
        checklist = parseChecklist(content);
        const relPath = contentRelPath(meta.id, entry);
        copyToPublic(fullPath, relPath);
      } else {
        // Flat lesson file at level root (no subdirs)
        flatLessonFiles.push({ filename: entry, fullPath });
      }
    }
  }

  // If level has flat .md files with no topic subdirs, auto-create one topic per file
  if (!hasSubdirs && flatLessonFiles.length > 0) {
    for (const { filename, fullPath } of flatLessonFiles) {
      const relPath = contentRelPath(meta.id, filename);
      const lesson = buildLessonFromFile(fullPath, filename, relPath);
      copyToPublic(fullPath, relPath);
      topics.push({
        id: lesson.slug,
        title: lesson.title,
        lessons: [lesson],
        subtopics: [],
        exercises: [],
        cheatsheet: null,
      });
    }
  }

  // Count total lessons across topics
  const totalLessonsInLevel = topics.reduce((sum, t) => {
    const topicLessons = t.lessons.length;
    const subtopicLessons = t.subtopics.reduce((s, st) => s + st.lessons.length, 0);
    return sum + topicLessons + subtopicLessons;
  }, 0);

  return {
    id: meta.id,
    title: meta.title,
    description,
    estimatedTime: meta.estimatedTime,
    hasContent: totalLessonsInLevel > 0,
    topics,
    checklist,
    exercises: levelExercises,
  };
}

function extractDescription(readmeContent: string): string {
  // Extract content after first heading, take the first paragraph(s)
  const lines = readmeContent.split('\n');
  let started = false;
  const descLines: string[] = [];

  for (const line of lines) {
    if (!started) {
      // Skip until after first heading
      if (line.startsWith('# ')) {
        started = true;
      }
      continue;
    }
    // Stop at next heading or code block
    if (line.startsWith('#') || line.startsWith('```')) break;
    // Skip empty lines at the start
    if (descLines.length === 0 && line.trim() === '') continue;
    // Stop at second empty line (end of first paragraph block)
    if (line.trim() === '' && descLines.length > 0 && descLines[descLines.length - 1] === '') break;
    descLines.push(line.trim());
  }

  return descLines.join(' ').replace(/\s+/g, ' ').replace(/\*\*/g, '').trim();
}

// ─── Count total lessons ─────────────────────────────────────────────────────

function countTotalLessons(levels: Level[]): number {
  let total = 0;
  for (const level of levels) {
    for (const topic of level.topics) {
      total += topic.lessons.length;
      for (const subtopic of topic.subtopics) {
        total += subtopic.lessons.length;
      }
    }
  }
  return total;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  console.log('Building manifest...');
  console.log('Content root: ' + CONTENT_ROOT);
  console.log('Output dir: ' + OUTPUT_DIR);

  // Clean output directory
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true });
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const levels = LEVELS.map(scanLevel);
  const totalLessons = countTotalLessons(levels);

  const manifest: Manifest = {
    levels,
    totalLessons,
    generatedAt: new Date().toISOString(),
  };

  const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  // Print summary
  console.log('\n--- Manifest Summary ---');
  for (const level of levels) {
    const topicCount = level.topics.length;
    let lessonCount = 0;
    for (const topic of level.topics) {
      lessonCount += topic.lessons.length;
      for (const subtopic of topic.subtopics) {
        lessonCount += subtopic.lessons.length;
      }
    }
    const topicExercises = level.topics.reduce((s, t) => s + t.exercises.length, 0);
    console.log(
      'Level ' + level.id + ': ' + level.title +
      ' \u2014 ' + topicCount + ' topics, ' + lessonCount + ' lessons, ' +
      level.checklist.length + ' checklist items, ' +
      level.exercises.length + ' level exercises, ' +
      topicExercises + ' topic exercises' +
      (level.hasContent ? '' : ' (no content)')
    );
  }
  console.log('\nTotal lessons: ' + totalLessons);
  console.log('Manifest written to: ' + manifestPath);
}

main();

export interface Lesson {
  id: string;
  title: string;
  slug: string;
  filePath: string;
  wordCount: number;
  readTime: number;
  searchText: string;
}

export interface Subtopic {
  id: string;
  title: string;
  lessons: Lesson[];
}

export interface Exercise {
  id: string;
  title: string;
  filePath: string;
}

export interface ChecklistItem {
  text: string;
  index: number;
}

export interface Topic {
  id: string;
  title: string;
  lessons: Lesson[];
  subtopics: Subtopic[];
  exercises: Exercise[];
  cheatsheet: string | null;
}

export interface Level {
  id: number;
  title: string;
  description: string;
  estimatedTime: string;
  hasContent: boolean;
  topics: Topic[];
  checklist: ChecklistItem[];
  exercises: Exercise[];
}

export interface Manifest {
  levels: Level[];
  totalLessons: number;
  generatedAt: string;
}

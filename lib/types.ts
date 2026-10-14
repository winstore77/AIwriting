export const GENRES = [
  "판타지",
  "무협",
  "로맨스",
  "현대판타지",
  "SF",
  "미스터리",
  "공포",
  "대체역사",
] as const;

export type Genre = (typeof GENRES)[number];

export const TONES = ["유지", "긴장", "서정", "유머", "속도"] as const;
export type Tone = (typeof TONES)[number];

export interface Character {
  id: string;
  name: string;
  role: string;
  trait: string;
  desire: string;
  voice: string;
}

export interface Chapter {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
}

export interface Novel {
  id: string;
  title: string;
  genre: Genre;
  logline: string;
  tone: string;
  cover: number;
  characters: Character[];
  world: string;
  outline: string;
  intent: string;
  scenario: string;
  chapters: Chapter[];
  createdAt: number;
  updatedAt: number;
}

export interface AiSettings {
  provider: "local" | "remote";
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface Suggestion {
  title: string;
  summary: string;
  prose: string;
}

export interface StoryPlan {
  intent: string;
  world: string;
  characters: Character[];
}

export interface AiResult {
  text?: string;
  suggestions?: Suggestion[];
  plan?: StoryPlan;
  engine: "local" | "remote";
}

export type AiAction =
  | { type: "continue"; tone: Tone; instruction: string }
  | { type: "rewrite"; source: string; tone: Tone; instruction: string }
  | { type: "scene"; prompt: string; tone: Tone }
  | { type: "suggest"; tone: Tone }
  | { type: "opening"; tone: Tone }
  | { type: "scenario"; tone: Tone }
  | { type: "plan"; tone: Tone }
  | { type: "revise"; source: string; tone: Tone; instruction: string; focus: "intent" | "character" | "prose" };

export interface AiContext {
  title: string;
  genre: Genre;
  logline: string;
  characters: Character[];
  world: string;
  intent: string;
  scenario: string;
  chapterTitle: string;
  content: string;
}

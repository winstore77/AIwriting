import type { AiSettings, Novel } from "./types";
import { seedNovels } from "./seed";

export const NOVEL_KEY = "inkwell.novels.v1";
export const SETTINGS_KEY = "inkwell.settings.v1";

export const defaultSettings: AiSettings = {
  provider: "local",
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
};

export function loadNovels(): Novel[] {
  if (typeof window === "undefined") return seedNovels();
  try {
    const raw = localStorage.getItem(NOVEL_KEY);
    if (!raw) {
      const seeded = seedNovels();
      localStorage.setItem(NOVEL_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw) as Novel[];
    if (!Array.isArray(parsed)) return seedNovels();
    return parsed;
  } catch {
    return seedNovels();
  }
}

export function saveNovels(novels: Novel[]) {
  localStorage.setItem(NOVEL_KEY, JSON.stringify(novels));
}

export function loadSettings(): AiSettings {
  if (typeof window === "undefined") return defaultSettings;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings;
    return { ...defaultSettings, ...(JSON.parse(raw) as AiSettings) };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(settings: AiSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function uid(): string {
  return crypto.randomUUID();
}

export function countChars(text: string): number {
  return text.replace(/\s/g, "").length;
}

export function exportNovel(novel: Novel): string {
  const people = novel.characters
    .map((c) => `- ${c.name} / ${c.role} / ${c.trait}`)
    .join("\n");
  const chapters = novel.chapters
    .map((ch) => `## ${ch.title}\n\n${ch.content.trim() || "(비어 있음)"}`)
    .join("\n\n");
  return `# ${novel.title}\n\n${novel.genre} · ${novel.logline}\n\n## 인물\n${people || "- 없음"}\n\n## 세계\n${novel.world || "없음"}\n\n## 개요\n${novel.outline || "없음"}\n\n${chapters}\n`;
}

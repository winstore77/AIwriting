"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AiSettings, Chapter, Novel } from "./types";
import { loadNovels, loadSettings, saveNovels, saveSettings, uid } from "./storage";

interface Store {
  ready: boolean;
  novels: Novel[];
  settings: AiSettings;
  setSettings: (settings: AiSettings) => void;
  upsert: (novel: Novel) => void;
  remove: (id: string) => void;
  create: (input: Pick<Novel, "title" | "genre" | "logline" | "tone" | "cover"> & { protagonist?: string }) => Novel;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [novels, setNovels] = useState<Novel[]>([]);
  const [settings, setSettingsState] = useState<AiSettings>({
    provider: "local",
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  });

  const novelsRef = useRef<Novel[]>([]);

  useEffect(() => {
    const loaded = loadNovels();
    novelsRef.current = loaded;
    setNovels(loaded);
    setSettingsState(loadSettings());
    setReady(true);
  }, []);

  function writeNovels(next: Novel[]) {
    novelsRef.current = next;
    saveNovels(next);
    setNovels(next);
  }

  const api = useMemo<Store>(() => {
    return {
      ready,
      novels,
      settings,
      setSettings: (next) => {
        setSettingsState(next);
        saveSettings(next);
      },
      upsert: (novel) => {
        const prev = novelsRef.current;
        const next = prev.some((item) => item.id === novel.id)
          ? prev.map((item) => (item.id === novel.id ? novel : item))
          : [novel, ...prev];
        writeNovels(next);
      },
      remove: (id) => {
        writeNovels(novelsRef.current.filter((item) => item.id !== id));
      },
      create: (input) => {
        const stamp = Date.now();
        const chapter: Chapter = {
          id: uid(),
          title: "1화. 프롤로그",
          content: "",
          updatedAt: stamp,
        };
        const novel: Novel = {
          id: uid(),
          title: input.title.trim() || "제목 없는 원고",
          genre: input.genre,
          logline: input.logline.trim(),
          tone: input.tone.trim() || "담백한 서술",
          cover: input.cover,
          world: "",
          outline: "",
          intent: "",
          scenario: "",
          characters: input.protagonist?.trim()
            ? [{ id: uid(), name: input.protagonist.trim(), role: "주인공", trait: "", desire: "", voice: "" }]
            : [],
          chapters: [chapter],
          createdAt: stamp,
          updatedAt: stamp,
        };
        writeNovels([novel, ...novelsRef.current]);
        return novel;
      },
    };
  }, [novels, ready, settings]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("Store missing");
  return ctx;
}

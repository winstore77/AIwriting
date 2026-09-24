"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TONES, type Character, type Novel, type Suggestion, type Tone } from "@/lib/types";
import { countChars, exportNovel, uid } from "@/lib/storage";
import { useStore } from "@/lib/store";
import { generate } from "@/lib/ai/generate";
import { SettingsModal } from "./LibraryView";

export function StudioView({ id }: { id: string }) {
  const { ready, novels, upsert, remove, settings } = useStore();
  const router = useRouter();
  const novel = novels.find((n) => n.id === id);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [tab, setTab] = useState<"write" | "people" | "world">("write");
  const [tone, setTone] = useState<Tone>("유지");
  const [instruction, setInstruction] = useState("");
  const [scenePrompt, setScenePrompt] = useState("");
  const [preview, setPreview] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<"chapters" | "ai" | null>("ai");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selection, setSelection] = useState("");
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (novel && !chapterId) setChapterId(novel.chapters[0]?.id ?? null);
  }, [novel, chapterId]);

  const chapter = novel?.chapters.find((c) => c.id === chapterId) ?? novel?.chapters[0];

  const chars = useMemo(
    () => (novel ? novel.chapters.reduce((sum, ch) => sum + countChars(ch.content), 0) : 0),
    [novel],
  );

  if (!ready) return <div className="app-loading">원고를 펼치는 중</div>;
  if (!novel || !chapter) {
    return (
      <div className="app-loading">
        <div>
          <p>이 작품을 찾지 못했습니다.</p>
          <Link href="/">서고로</Link>
        </div>
      </div>
    );
  }

  function patch(next: Novel) {
    upsert({ ...next, updatedAt: Date.now() });
  }

  function patchChapter(content: string) {
    patch({
      ...novel!,
      chapters: novel!.chapters.map((ch) =>
        ch.id === chapter!.id ? { ...ch, content, updatedAt: Date.now() } : ch,
      ),
    });
  }

  function insertAtCursor(text: string) {
    const el = areaRef.current;
    const current = chapter!.content;
    if (!el) {
      patchChapter(`${current}${current.endsWith("\n") || !current ? "" : "\n\n"}${text}`);
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? start;
    const gap = start > 0 && current[start - 1] !== "\n" ? "\n\n" : "";
    const next = current.slice(0, start) + gap + text + current.slice(end);
    patchChapter(next);
    requestAnimationFrame(() => {
      const pos = start + gap.length + text.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  async function run(kind: "continue" | "rewrite" | "scene" | "suggest") {
    setBusy(true);
    setError("");
    setStatus(settings.provider === "remote" ? "외부 모델이 집필 중" : "잉크가 번지는 중");
    setPreview("");
    setSuggestions([]);
    try {
      const ctx = {
        title: novel!.title,
        genre: novel!.genre,
        logline: novel!.logline,
        characters: novel!.characters,
        world: `${novel!.world}\n${novel!.outline}`,
        chapterTitle: chapter!.title,
        content: chapter!.content,
      };
      const action =
        kind === "continue"
          ? { type: "continue" as const, tone, instruction }
          : kind === "rewrite"
            ? { type: "rewrite" as const, tone, instruction, source: selection || chapter!.content.slice(-500) }
            : kind === "scene"
              ? { type: "scene" as const, tone, prompt: scenePrompt || instruction || "장면을 한 걸음 앞으로" }
              : { type: "suggest" as const, tone };
      const result = await generate(action, ctx, settings);
      if (result.suggestions) setSuggestions(result.suggestions);
      if (result.text) setPreview(result.text);
      setStatus(result.engine === "remote" ? "외부 모델" : "잉크웰 엔진");
    } catch (err) {
      setError(err instanceof Error ? err.message : "생성에 실패했습니다.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  function download() {
    const blob = new Blob([exportNovel(novel!)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${novel!.title}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="studio">
      <header className="studio-top">
        <Link href="/">서고</Link>
        <h1 className="studio-title">{novel.title}</h1>
        <span className="count">{novel.genre} · {chars.toLocaleString()}자</span>
        <button className="btn small drawer-toggle" onClick={() => setPanel(panel === "chapters" ? null : "chapters")}>화</button>
        <button className="btn small drawer-toggle" onClick={() => setPanel(panel === "ai" ? null : "ai")}>조수</button>
        <Link className="btn small" href={`/read/${novel.id}?ch=${chapter.id}`}>읽기</Link>
        <button className="btn small" onClick={download}>내보내기</button>
        <button className="btn small" onClick={() => setSettingsOpen(true)}>엔진</button>
      </header>
      <div className="studio-body">
        <aside className={`side ${panel === "chapters" ? "open" : ""}`}>
          <h4>화</h4>
          {novel.chapters.map((ch, index) => (
            <button key={ch.id} className={`chapter ${ch.id === chapter.id ? "on" : ""}`} onClick={() => setChapterId(ch.id)}>
              <span>{ch.title}</span>
              <small>{countChars(ch.content).toLocaleString()}자</small>
            </button>
          ))}
          <div className="chapter-tools">
            <button
              className="btn small primary"
              onClick={() => {
                const ch = { id: uid(), title: `${novel.chapters.length + 1}화`, content: "", updatedAt: Date.now() };
                patch({ ...novel, chapters: [...novel.chapters, ch] });
                setChapterId(ch.id);
              }}
            >화 추가</button>
            <button
              className="btn small"
              onClick={() => {
                if (novel.chapters.length === 1) return;
                const rest = novel.chapters.filter((ch) => ch.id !== chapter.id);
                patch({ ...novel, chapters: rest });
                setChapterId(rest[0].id);
              }}
            >이 화 삭제</button>
          </div>
          <div className="danger-zone">
            <button
              className="btn small danger"
              onClick={() => {
                if (confirm(`「${novel.title}」을 서고에서 지울까요? 이 작업은 되돌릴 수 없습니다.`)) {
                  remove(novel.id);
                  router.push("/");
                }
              }}
            >작품 삭제</button>
          </div>
        </aside>
        <section className="paper-wrap">
          <div className="paper">
            <input
              className="chapter-name"
              value={chapter.title}
              onChange={(e) =>
                patch({
                  ...novel,
                  chapters: novel.chapters.map((ch) => (ch.id === chapter.id ? { ...ch, title: e.target.value } : ch)),
                })
              }
            />
            <textarea
              ref={areaRef}
              className="manuscript"
              value={chapter.content}
              placeholder="첫 문장을 적거나, 오른쪽에서 이어쓰기를 누르세요."
              onChange={(e) => patchChapter(e.target.value)}
              onSelect={(e) => {
                const el = e.currentTarget;
                const text = el.value.slice(el.selectionStart, el.selectionEnd).trim();
                setSelection(text);
              }}
            />
          </div>
        </section>
        <aside className={`ai ${panel === "ai" ? "open" : ""}`}>
          <div className="tabs">
            <button className={tab === "write" ? "on" : ""} onClick={() => setTab("write")}>집필</button>
            <button className={tab === "people" ? "on" : ""} onClick={() => setTab("people")}>인물</button>
            <button className={tab === "world" ? "on" : ""} onClick={() => setTab("world")}>설정</button>
          </div>
          {tab === "write" && (
            <>
              <div className="tones">
                {TONES.map((t) => (
                  <button key={t} className={`chip ${tone === t ? "on" : ""}`} onClick={() => setTone(t)}>{t}</button>
                ))}
              </div>
              <textarea
                rows={3}
                placeholder="이 장면에서 원하는 것. 예: 세린이 봉인 문서를 꺼낸다"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
              />
              <input
                placeholder="장면 요청. 예: 골목에서 추적자와 마주친다"
                value={scenePrompt}
                onChange={(e) => setScenePrompt(e.target.value)}
              />
              <div className="ai-actions">
                <button className="btn primary small" disabled={busy} onClick={() => run("continue")}>이어쓰기</button>
                <button className="btn small" disabled={busy} onClick={() => run("scene")}>장면 쓰기</button>
                <button className="btn small" disabled={busy} onClick={() => run("rewrite")}>
                  {selection ? "선택 다시 쓰기" : "끝부분 다시 쓰기"}
                </button>
                <button className="btn small" disabled={busy} onClick={() => run("suggest")}>전개 세 갈래</button>
              </div>
              <p className={`status-line ${error ? "error" : ""}`}>{error || status}</p>
              {preview && (
                <div className="preview">
                  {preview}
                  <div className="chapter-tools">
                    <button className="btn small primary" onClick={() => { insertAtCursor(preview); setPreview(""); }}>여기에 넣기</button>
                    <button className="btn small" onClick={() => setPreview("")}>버리기</button>
                  </div>
                </div>
              )}
              {suggestions.map((s) => (
                <button
                  key={s.title}
                  className="suggest"
                  onClick={() => {
                    insertAtCursor(s.prose);
                    setSuggestions([]);
                  }}
                >
                  <strong>{s.title}</strong>
                  <span>{s.summary}</span>
                </button>
              ))}
            </>
          )}
          {tab === "people" && (
            <PeopleEditor novel={novel} onChange={patch} />
          )}
          {tab === "world" && (
            <>
              <h4>한 줄</h4>
              <textarea rows={3} value={novel.logline} onChange={(e) => patch({ ...novel, logline: e.target.value })} />
              <h4>세계</h4>
              <textarea rows={5} value={novel.world} onChange={(e) => patch({ ...novel, world: e.target.value })} />
              <h4>개요</h4>
              <textarea rows={5} value={novel.outline} onChange={(e) => patch({ ...novel, outline: e.target.value })} />
            </>
          )}
        </aside>
      </div>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function PeopleEditor({ novel, onChange }: { novel: Novel; onChange: (n: Novel) => void }) {
  const [draft, setDraft] = useState({ name: "", role: "", trait: "" });

  function update(id: string, partial: Partial<Character>) {
    onChange({
      ...novel,
      characters: novel.characters.map((c) => (c.id === id ? { ...c, ...partial } : c)),
    });
  }

  return (
    <>
      {novel.characters.map((c) => (
        <div key={c.id} className="person">
          <label className="field">이름<input value={c.name} onChange={(e) => update(c.id, { name: e.target.value })} /></label>
          <label className="field">역할<input value={c.role} onChange={(e) => update(c.id, { role: e.target.value })} /></label>
          <label className="field">특징<input value={c.trait} onChange={(e) => update(c.id, { trait: e.target.value })} /></label>
          <button className="btn small danger" onClick={() => onChange({ ...novel, characters: novel.characters.filter((x) => x.id !== c.id) })}>빼기</button>
        </div>
      ))}
      <h4>인물 추가</h4>
      <label className="field">이름<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="하란" /></label>
      <label className="field">역할<input value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} placeholder="검객" /></label>
      <label className="field">특징<input value={draft.trait} onChange={(e) => setDraft({ ...draft, trait: e.target.value })} placeholder="조급하다" /></label>
      <button
        className="btn small"
        onClick={() => {
          if (!draft.name.trim()) return;
          onChange({ ...novel, characters: [...novel.characters, { id: uid(), ...draft }] });
          setDraft({ name: "", role: "", trait: "" });
        }}
      >추가</button>
    </>
  );
}

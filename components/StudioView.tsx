"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TONES, type AiContext, type Character, type Novel, type Suggestion, type Tone } from "@/lib/types";
import { countChars, exportNovel, uid } from "@/lib/storage";
import { useStore } from "@/lib/store";
import { generate } from "@/lib/ai/generate";
import { SettingsModal } from "./LibraryView";

type Stage = "scenario" | "plan" | "draft" | "revise";

const STAGES: { id: Stage; label: string }[] = [
  { id: "scenario", label: "1. 시나리오" },
  { id: "plan", label: "2. 기획 · 인물" },
  { id: "draft", label: "3. 집필" },
  { id: "revise", label: "4. 수정" },
];

function storyContext(novel: Novel, chapterTitle: string, content: string): AiContext {
  return {
    title: novel.title,
    genre: novel.genre,
    logline: novel.logline,
    characters: novel.characters,
    world: novel.world,
    intent: novel.intent,
    scenario: novel.scenario,
    chapterTitle,
    content,
  };
}

export function StudioView({ id }: { id: string }) {
  const { ready, novels, upsert, remove, settings } = useStore();
  const router = useRouter();
  const novel = novels.find((n) => n.id === id);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
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
  const [focus, setFocus] = useState<"intent" | "character" | "prose">("intent");
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

  const current: Stage = stage ?? (novel.scenario.trim() && novel.intent.trim() ? "draft" : "scenario");

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
  }

  function replaceTarget(text: string) {
    const current = chapter!.content;
    const el = areaRef.current;
    if (el && selection && el.selectionEnd > el.selectionStart) {
      const next = current.slice(0, el.selectionStart) + text + current.slice(el.selectionEnd);
      patchChapter(next);
      return;
    }
    const chunks = current.trimEnd().split(/\n\n/);
    if (chunks.length <= 1) {
      patchChapter(text);
      return;
    }
    chunks[chunks.length - 1] = text;
    patchChapter(chunks.join("\n\n"));
  }

  async function run(kind: "continue" | "rewrite" | "scene" | "suggest" | "scenario" | "plan" | "opening" | "revise") {
    setBusy(true);
    setError("");
    setStatus(settings.provider === "remote" ? "외부 모델이 집필 중" : "잉크가 번지는 중");
    setPreview("");
    setSuggestions([]);
    try {
      const ctx = storyContext(
        novel!,
        kind === "scenario" || kind === "plan" ? "전체 시나리오" : chapter!.title,
        kind === "scenario" ? novel!.scenario : chapter!.content,
      );
      const action =
        kind === "continue"
          ? { type: "continue" as const, tone, instruction }
          : kind === "rewrite"
            ? { type: "rewrite" as const, tone, instruction, source: selection || chapter!.content.slice(-500) }
            : kind === "scene"
              ? { type: "scene" as const, tone, prompt: scenePrompt || instruction || "장면을 한 걸음 앞으로" }
              : kind === "suggest"
                ? { type: "suggest" as const, tone }
                : kind === "scenario"
                  ? { type: "scenario" as const, tone: "유지" as const }
                  : kind === "plan"
                    ? { type: "plan" as const, tone: "유지" as const }
                    : kind === "opening"
                      ? { type: "opening" as const, tone: "유지" as const }
                      : { type: "revise" as const, tone, instruction, focus, source: selection || chapter!.content.slice(-700) };
      const result = await generate(action, ctx, settings);
      if (result.plan) {
        const characters = result.plan.characters.map((person) => {
          const prev = novel!.characters.find((item) => item.name === person.name);
          return { ...person, id: prev?.id || uid() };
        });
        patch({
          ...novel!,
          intent: result.plan.intent,
          world: result.plan.world || novel!.world,
          characters: characters.length ? characters : novel!.characters,
        });
        setStage("plan");
        setStatus("시나리오에서 기획의도와 인물을 읽어 왔습니다.");
      }
      if (kind === "scenario" && result.text) {
        patch({ ...novel!, scenario: novel!.scenario.trim() ? novel!.scenario : result.text });
        if (novel!.scenario.trim()) setPreview(result.text);
        setStatus("시나리오 초고");
      } else if (kind === "opening" && result.text) {
        if (!chapter!.content.trim()) {
          patch({
            ...novel!,
            chapters: novel!.chapters.map((ch) =>
              ch.id === chapter!.id ? { ...ch, content: result.text!, updatedAt: Date.now() } : ch,
            ),
          });
        } else {
          const nextChapter = { id: uid(), title: `${novel!.chapters.length + 1}화`, content: result.text, updatedAt: Date.now() };
          patch({ ...novel!, chapters: [...novel!.chapters, nextChapter] });
          setChapterId(nextChapter.id);
        }
        setStage("draft");
        setStatus("시나리오와 기획에 맞춰 본문을 썼습니다.");
      } else {
        if (result.suggestions) setSuggestions(result.suggestions);
        if (result.text && kind !== "scenario") setPreview(result.text);
        if (!result.plan) setStatus(result.engine === "remote" ? "외부 모델" : "잉크웰 엔진");
      }
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

  const writing = current === "draft" || current === "revise";

  return (
    <div className="studio">
      <header className="studio-top">
        <Link href="/">서고</Link>
        <h1 className="studio-title">{novel.title}</h1>
        <nav className="steps">
          {STAGES.map((item) => (
            <button key={item.id} className={`step ${current === item.id ? "on" : ""}`} onClick={() => setStage(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
        <span className="count">{novel.genre} · {chars.toLocaleString()}자</span>
        <button className="btn small drawer-toggle" onClick={() => setPanel(panel === "chapters" ? null : "chapters")}>차례</button>
        <button className="btn small drawer-toggle" onClick={() => setPanel(panel === "ai" ? null : "ai")}>조수</button>
        <Link className="btn small" href={`/read/${novel.id}?ch=${chapter.id}`}>읽기</Link>
        <button className="btn small" onClick={download}>내보내기</button>
        <button className="btn small" onClick={() => setSettingsOpen(true)}>엔진</button>
      </header>
      <div className="studio-body">
        <aside className={`side ${panel === "chapters" ? "open" : ""}`}>
          {writing ? (
            <>
              <h4>화</h4>
              {novel.chapters.map((ch) => (
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
            </>
          ) : (
            <>
              <h4>작업 순서</h4>
              <p className="rail-note">시나리오를 먼저 확정하고, 기획의도와 인물을 읽은 뒤에 본문을 씁니다.</p>
              {STAGES.map((item) => (
                <button key={item.id} className={`chapter ${current === item.id ? "on" : ""}`} onClick={() => setStage(item.id)}>
                  <span>{item.label}</span>
                </button>
              ))}
            </>
          )}
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
          {current === "scenario" && (
            <div className="paper">
              <input className="chapter-name" value="전체 시나리오" readOnly />
              <textarea
                className="manuscript"
                value={novel.scenario}
                placeholder="발단부터 결말까지, 회차가 아니라 이야기의 뼈대를 먼저 적으세요."
                onChange={(e) => patch({ ...novel, scenario: e.target.value })}
              />
            </div>
          )}
          {current === "plan" && <PlanSheet novel={novel} onChange={patch} />}
          {writing && (
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
                placeholder="시나리오와 인물을 지키며 이 화를 쓰세요."
                onChange={(e) => patchChapter(e.target.value)}
                onSelect={(e) => {
                  const el = e.currentTarget;
                  setSelection(el.value.slice(el.selectionStart, el.selectionEnd).trim());
                }}
              />
            </div>
          )}
        </section>

        <aside className={`ai ${panel === "ai" ? "open" : ""}`}>
          {current === "scenario" && (
            <>
              <h4>시나리오</h4>
              <p className="guide">본문을 쓰기 전에 이야기의 시작과 끝, 인물의 선택을 고정합니다.</p>
              <div className="ai-actions">
                <button className="btn primary small" disabled={busy} onClick={() => run("scenario")}>시나리오 초고</button>
                <button className="btn small" disabled={busy || !novel.scenario.trim()} onClick={() => run("plan")}>기획과 인물 파악</button>
              </div>
            </>
          )}
          {current === "plan" && (
            <>
              <h4>파악</h4>
              <p className="guide">기획의도는 이 소설이 남기려는 감정입니다. 등장인물은 자리고, 캐릭터는 욕망과 말투입니다.</p>
              <div className="ai-actions">
                <button className="btn small" disabled={busy || !novel.scenario.trim()} onClick={() => run("plan")}>시나리오에서 다시 파악</button>
                <button className="btn primary small" disabled={busy || !novel.intent.trim()} onClick={() => run("opening")}>이 설정으로 1화 쓰기</button>
                <button className="btn small" onClick={() => setStage("draft")}>집필로 이동</button>
              </div>
            </>
          )}
          {current === "draft" && (
            <>
              <h4>집필</h4>
              <p className="guide">{novel.intent.trim() ? novel.intent.slice(0, 90) : "기획의도를 먼저 적으면 이어쓰기가 그 감정을 따라갑니다."}</p>
              <div className="tones">
                {TONES.map((item) => (
                  <button key={item} className={`chip ${tone === item ? "on" : ""}`} onClick={() => setTone(item)}>{item}</button>
                ))}
              </div>
              <textarea rows={3} placeholder="이 장면에서 원하는 것" value={instruction} onChange={(e) => setInstruction(e.target.value)} />
              <input placeholder="장면 요청" value={scenePrompt} onChange={(e) => setScenePrompt(e.target.value)} />
              <div className="ai-actions">
                <button className="btn primary small" disabled={busy} onClick={() => run("continue")}>이어쓰기</button>
                <button className="btn small" disabled={busy} onClick={() => run("scene")}>장면 쓰기</button>
                <button className="btn small" disabled={busy} onClick={() => run("suggest")}>전개 세 갈래</button>
                <button className="btn small" onClick={() => setStage("revise")}>수정으로</button>
              </div>
            </>
          )}
          {current === "revise" && (
            <>
              <h4>수정</h4>
              <p className="guide">고칠 문단을 선택한 뒤, 기획의도나 캐릭터에 맞게 다시 씁니다. 선택하지 않으면 마지막 문단을 고칩니다.</p>
              <div className="tones">
                <button className={`chip ${focus === "intent" ? "on" : ""}`} onClick={() => setFocus("intent")}>기획의도</button>
                <button className={`chip ${focus === "character" ? "on" : ""}`} onClick={() => setFocus("character")}>캐릭터</button>
                <button className={`chip ${focus === "prose" ? "on" : ""}`} onClick={() => setFocus("prose")}>문장</button>
              </div>
              <textarea rows={3} placeholder="고칠 방향. 예: 세린이 문서를 더 믿게" value={instruction} onChange={(e) => setInstruction(e.target.value)} />
              <div className="ai-actions">
                <button className="btn primary small" disabled={busy || !chapter.content.trim()} onClick={() => run("revise")}>선택 부분 고치기</button>
                <button className="btn small" onClick={() => setStage("draft")}>집필로</button>
              </div>
            </>
          )}
          <p className={`status-line ${error ? "error" : ""}`}>{error || status}</p>
          {preview && (
            <div className="preview">
              {preview}
              <div className="chapter-tools">
                {current === "scenario" ? (
                  <button className="btn small primary" onClick={() => { patch({ ...novel, scenario: preview }); setPreview(""); }}>시나리오로 바꾸기</button>
                ) : current === "revise" ? (
                  <button className="btn small primary" onClick={() => { replaceTarget(preview); setPreview(""); }}>고친 문단으로 바꾸기</button>
                ) : (
                  <button className="btn small primary" onClick={() => { insertAtCursor(preview); setPreview(""); }}>여기에 넣기</button>
                )}
                <button className="btn small" onClick={() => setPreview("")}>버리기</button>
              </div>
            </div>
          )}
          {suggestions.map((item) => (
            <button key={item.title} className="suggest" onClick={() => { insertAtCursor(item.prose); setSuggestions([]); }}>
              <strong>{item.title}</strong>
              <span>{item.summary}</span>
            </button>
          ))}
        </aside>
      </div>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function PlanSheet({ novel, onChange }: { novel: Novel; onChange: (novel: Novel) => void }) {
  const [draft, setDraft] = useState({ name: "", role: "", trait: "", desire: "", voice: "" });

  function update(id: string, partial: Partial<Character>) {
    onChange({
      ...novel,
      characters: novel.characters.map((person) => (person.id === id ? { ...person, ...partial } : person)),
    });
  }

  return (
    <div className="paper bible">
      <p className="eyebrow">기획의도</p>
      <h2>이 소설이 남기려는 것</h2>
      <textarea className="bible-text" value={novel.intent} placeholder="독자가 어떤 감정을 가져가야 하는지 적습니다." onChange={(e) => onChange({ ...novel, intent: e.target.value })} />
      <p className="eyebrow">등장인물 · 캐릭터</p>
      {novel.characters.map((person) => (
        <div key={person.id} className="cast-card">
          <label>이름<input value={person.name} onChange={(e) => update(person.id, { name: e.target.value })} /></label>
          <label>역할<input value={person.role} onChange={(e) => update(person.id, { role: e.target.value })} /></label>
          <label className="wide">특징<input value={person.trait} onChange={(e) => update(person.id, { trait: e.target.value })} /></label>
          <label className="wide">욕망<textarea rows={2} value={person.desire} onChange={(e) => update(person.id, { desire: e.target.value })} /></label>
          <label className="wide">말투<textarea rows={2} value={person.voice} onChange={(e) => update(person.id, { voice: e.target.value })} /></label>
          <button className="btn small danger" onClick={() => onChange({ ...novel, characters: novel.characters.filter((item) => item.id !== person.id) })}>빼기</button>
        </div>
      ))}
      <div className="cast-card">
        <label>이름<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <label>역할<input value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} /></label>
        <label className="wide">특징<input value={draft.trait} onChange={(e) => setDraft({ ...draft, trait: e.target.value })} /></label>
        <label className="wide">욕망<input value={draft.desire} onChange={(e) => setDraft({ ...draft, desire: e.target.value })} /></label>
        <label className="wide">말투<input value={draft.voice} onChange={(e) => setDraft({ ...draft, voice: e.target.value })} /></label>
        <button
          className="btn small"
          onClick={() => {
            if (!draft.name.trim()) return;
            onChange({ ...novel, characters: [...novel.characters, { id: uid(), ...draft }] });
            setDraft({ name: "", role: "", trait: "", desire: "", voice: "" });
          }}
        >인물 추가</button>
      </div>
      <p className="eyebrow">세계</p>
      <textarea className="bible-text" value={novel.world} onChange={(e) => onChange({ ...novel, world: e.target.value })} />
    </div>
  );
}

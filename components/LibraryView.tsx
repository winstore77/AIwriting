"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GENRES, type Genre } from "@/lib/types";
import { countChars } from "@/lib/storage";
import { useStore } from "@/lib/store";
import { generate } from "@/lib/ai/generate";

export function LibraryView() {
  const { ready, novels } = useStore();
  const [filter, setFilter] = useState<Genre | "전체">("전체");
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    genre: "판타지" as Genre,
    logline: "",
    tone: "담백하고 장면 중심",
    protagonist: "",
    cover: 0,
    opening: true,
  });

  const visible = useMemo(
    () => novels.filter((n) => filter === "전체" || n.genre === filter),
    [novels, filter],
  );

  if (!ready) return <div className="app-loading">서고를 여는 중</div>;

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <div className="seal">墨</div>
          <div>
            <div className="brand-name">잉크웰</div>
            <div className="brand-sub">웹소설 작업실</div>
          </div>
        </div>
        <div className="top-actions">
          <button className="btn" onClick={() => setSettingsOpen(true)}>집필 엔진</button>
          <button className="btn primary" onClick={() => setOpen(true)}>새 작품</button>
        </div>
      </header>
      <main className="library">
        <section className="hero">
          <h1>다음 문장을<br />같이 씁니다.</h1>
          <p>장르와 인물, 직전 원고를 읽고 장면을 이어 쓰는 작업실입니다. 원고는 이 브라우저에 남습니다.</p>
        </section>
        <div className="filters">
          <button className={`chip ${filter === "전체" ? "on" : ""}`} onClick={() => setFilter("전체")}>전체</button>
          {GENRES.map((g) => (
            <button key={g} className={`chip ${filter === g ? "on" : ""}`} onClick={() => setFilter(g)}>{g}</button>
          ))}
        </div>
        <div className="grid">
          <button className="new-card" onClick={() => setOpen(true)}>
            <strong>빈 원고</strong>
            <span>표지와 첫 문장을 정합니다</span>
          </button>
          {visible.map((novel) => {
            const chars = novel.chapters.reduce((sum, ch) => sum + countChars(ch.content), 0);
            return (
              <a key={novel.id} className="book" href={`/novel/${novel.id}`}>
                <article className={`cover cover-${novel.cover % 6}`}>
                  <div>
                    <div className="genre">{novel.genre}</div>
                    <h3>{novel.title}</h3>
                  </div>
                  <div className="meta">{novel.logline}</div>
                </article>
                <div className="book-foot">
                  <span>{novel.chapters.length}화</span>
                  <span>{chars.toLocaleString()}자</span>
                </div>
              </a>
            );
          })}
        </div>
      </main>
      {open && (
        <CreateModal form={form} setForm={setForm} onClose={() => setOpen(false)} />
      )}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </>
  );
}

function CreateModal({
  form,
  setForm,
  onClose,
}: {
  form: {
    title: string;
    genre: Genre;
    logline: string;
    tone: string;
    protagonist: string;
    cover: number;
    opening: boolean;
  };
  setForm: (v: typeof form) => void;
  onClose: () => void;
}) {
  const { upsert, create, settings } = useStore();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const novel = create({ ...form, cover: Math.floor(Math.random() * 6) });
    if (form.opening) {
      try {
        const result = await generate(
          { type: "opening", tone: "유지" },
          {
            title: novel.title,
            genre: novel.genre,
            logline: novel.logline,
            characters: novel.characters,
            world: "",
            chapterTitle: novel.chapters[0].title,
            content: "",
          },
          settings,
        );
        if (result.text) {
          const next = {
            ...novel,
            chapters: [{ ...novel.chapters[0], content: result.text, updatedAt: Date.now() }],
            updatedAt: Date.now(),
          };
          upsert(next);
        }
      } catch {
        /* keep empty chapter */
      }
    }
    setBusy(false);
    onClose();
    router.push(`/novel/${novel.id}`);
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>새 작품</h2>
        <p className="hint">표지색은 임의로 고르고, 원하면 첫 장면을 바로 씁니다.</p>
        <label className="field">제목
          <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="검이 이름을 잊은 날" />
        </label>
        <div className="row">
          <label className="field">장르
            <select value={form.genre} onChange={(e) => setForm({ ...form, genre: e.target.value as Genre })}>
              {GENRES.map((g) => <option key={g}>{g}</option>)}
            </select>
          </label>
          <label className="field">주인공
            <input value={form.protagonist} onChange={(e) => setForm({ ...form, protagonist: e.target.value })} placeholder="이름" />
          </label>
        </div>
        <label className="field">한 줄 소개
          <textarea value={form.logline} onChange={(e) => setForm({ ...form, logline: e.target.value })} placeholder="주인공이 무엇을 잃고, 무엇을 찾아가는지" />
        </label>
        <label className="field">문장 결
          <input value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={form.opening} onChange={(e) => setForm({ ...form, opening: e.target.checked })} />
          첫 장면을 이어서 써 두기
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>닫기</button>
          <button className="btn primary" disabled={busy}>{busy ? "쓰는 중" : "작품 만들기"}</button>
        </div>
      </form>
    </div>
  );
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { settings, setSettings } = useStore();
  const [draft, setDraft] = useState(settings);
  return (
    <div className="modal-back" onClick={onClose}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          setSettings(draft);
          onClose();
        }}
      >
        <h2>집필 엔진</h2>
        <p className="hint">기본은 브라우저 안의 잉크웰 엔진입니다. 외부 모델을 연결하면 같은 버튼이 그 모델로 이어 씁니다.</p>
        <label className="field">엔진
          <select value={draft.provider} onChange={(e) => setDraft({ ...draft, provider: e.target.value as "local" | "remote" })}>
            <option value="local">잉크웰 엔진</option>
            <option value="remote">OpenAI 호환 모델</option>
          </select>
        </label>
        <label className="field">API 키
          <input type="password" value={draft.apiKey} onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })} placeholder="sk-..." />
        </label>
        <label className="field">Base URL
          <input value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} />
        </label>
        <label className="field">모델
          <input value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>닫기</button>
          <button className="btn primary">저장</button>
        </div>
      </form>
    </div>
  );
}

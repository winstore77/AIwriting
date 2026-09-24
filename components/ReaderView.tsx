"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";

export function ReaderView({ id }: { id: string }) {
  const { ready, novels } = useStore();
  const novel = novels.find((n) => n.id === id);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!novel) return;
    const ch = new URLSearchParams(window.location.search).get("ch");
    const found = novel.chapters.findIndex((chapter) => chapter.id === ch);
    if (found >= 0) setIndex(found);
  }, [novel]);

  if (!ready) return <div className="app-loading">책을 펼치는 중</div>;
  if (!novel) {
    return (
      <div className="app-loading">
        <Link href="/">서고로</Link>
      </div>
    );
  }

  const chapter = novel.chapters[Math.min(index, novel.chapters.length - 1)];

  return (
    <main className="reader">
      <Link href={`/novel/${novel.id}`}>← 작업실</Link>
      <div className="genre" style={{ marginTop: 18, color: "var(--gold)" }}>{novel.genre}</div>
      <h1>{novel.title}</h1>
      <p className="logline">{novel.logline}</p>
      <div className="reader-nav">
        <button className="btn" disabled={index === 0} onClick={() => setIndex((n) => n - 1)}>이전</button>
        <select value={index} onChange={(e) => setIndex(Number(e.target.value))}>
          {novel.chapters.map((ch, i) => (
            <option key={ch.id} value={i}>{ch.title}</option>
          ))}
        </select>
        <button className="btn" disabled={index >= novel.chapters.length - 1} onClick={() => setIndex((n) => n + 1)}>다음</button>
      </div>
      <h2>{chapter?.title}</h2>
      <article>{chapter?.content || "아직 이 화는 비어 있습니다."}</article>
    </main>
  );
}

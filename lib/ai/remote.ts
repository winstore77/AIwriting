import type { AiAction, AiContext, AiResult } from "../types";
import type { AiSettings } from "../types";

function actionGuide(action: AiAction): string {
  switch (action.type) {
    case "continue":
      return `직전 원고에 이어 2~4문단을 써라. 톤: ${action.tone}. 추가 지시: ${action.instruction || "없음"}. 앞 문장을 반복하지 말고 장면이 앞으로 나가게 할 것.`;
    case "rewrite":
      return `아래 문단을 같은 사실 관계로 다시 써라. 톤: ${action.tone}. 지시: ${action.instruction || "없음"}.\n\n${action.source}`;
    case "scene":
      return `다음 요청으로 새 장면을 2~4문단 써라. 톤: ${action.tone}.\n요청: ${action.prompt}`;
    case "opening":
      return `작품의 첫 장면을 3문단으로 써라. 로그라인을 설명문으로 베끼지 말고 장면으로 보여줄 것. 톤: ${action.tone}.`;
    case "suggest":
      return `다음 전개 세 가지를 JSON 배열로만 답하라. 각 항목은 {"title","summary","prose"} 이고 prose는 삽입 가능한 2문단이다. 다른 말은 하지 마라.`;
    case "scenario":
      return "회차 원고가 아니라 작가가 보는 전체 시나리오를 써라. 발단, 전개, 위기, 절정, 결말의 다섯 단락으로 쓰고, 각 단락에서 인물이 무엇을 선택하고 무엇을 잃는지 보여라.";
    case "plan":
      return `시나리오와 한 줄을 읽고 JSON 객체만 답하라. 다른 말은 하지 마라. 형식: {"intent":"기획의도 3~5문장","world":"세계 한 단락","characters":[{"name":"","role":"","trait":"","desire":"","voice":""}]}. intent는 이 소설이 독자에게 전달하려는 감정과 주제다. role은 등장인물의 자리고, trait·desire·voice는 그 사람의 캐릭터다.`;
    case "revise":
      return `아래 문단을 고쳐 본문만 써라. 초점: ${action.focus === "intent" ? "기획의도에 맞게" : action.focus === "character" ? "인물의 욕망과 말투에 맞게" : "문장만 다듬기"}. 지시: ${action.instruction || "없음"}. 사실 관계는 유지하고 메타 설명은 넣지 마라.\n\n${action.source}`;
  }
}

export async function runRemote(action: AiAction, ctx: AiContext, settings: AiSettings): Promise<AiResult> {
  const system = [
    "너는 한국어 웹소설 작가다.",
    "대사는 「」를 쓴다. 문단을 나눠 호흡을 만든다.",
    "설정을 무시하지 말고, 없는 인물을 함부로 추가하지 마라.",
    "설명조로 메타 발언을 하지 마라. 본문만 써라.",
  ].join(" ");

  const user = [
    `제목: ${ctx.title}`,
    `장르: ${ctx.genre}`,
    `한 줄: ${ctx.logline}`,
    `기획의도: ${ctx.intent || "없음"}`,
    `전체 시나리오:\n${ctx.scenario || "없음"}`,
    `인물: ${ctx.characters.map((c) => `${c.name}(${c.role}, 특징 ${c.trait}, 욕망 ${c.desire}, 말투 ${c.voice})`).join(" / ") || "없음"}`,
    `세계: ${ctx.world || "없음"}`,
    `챕터: ${ctx.chapterTitle}`,
    `원고 끝부분:\n${ctx.content.slice(-1800) || "(빈 원고)"}`,
    "",
    actionGuide(action),
  ].join("\n");

  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: settings.apiKey,
      baseUrl: settings.baseUrl,
      model: settings.model,
      system,
      user,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "생성에 실패했습니다." }));
    throw new Error(typeof err.error === "string" ? err.error : "생성에 실패했습니다.");
  }

  const data = (await response.json()) as { text: string };
  if (action.type === "plan") {
    const start = data.text.indexOf("{");
    const end = data.text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(data.text.slice(start, end + 1)) as {
        intent?: string;
        world?: string;
        characters?: { name?: string; role?: string; trait?: string; desire?: string; voice?: string }[];
      };
      const characters = (parsed.characters ?? [])
        .filter((c) => c.name?.trim())
        .map((c, index) => ({
          id: `remote-${index}`,
          name: c.name!.trim(),
          role: c.role?.trim() || "조연",
          trait: c.trait?.trim() || "",
          desire: c.desire?.trim() || "",
          voice: c.voice?.trim() || "",
        }));
      if (parsed.intent?.trim() && characters.length) {
        return { plan: { intent: parsed.intent.trim(), world: parsed.world?.trim() || "", characters }, engine: "remote" };
      }
    }
    throw new Error("기획과 인물을 읽지 못했습니다. 다시 파악해 보세요.");
  }
  if (action.type === "suggest") {
    const start = data.text.indexOf("[");
    const end = data.text.lastIndexOf("]");
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(data.text.slice(start, end + 1)) as AiResult["suggestions"];
      if (Array.isArray(parsed) && parsed.length) return { suggestions: parsed, engine: "remote" };
    }
    throw new Error("전개 제안을 읽지 못했습니다. 다시 생성해 보세요.");
  }
  return { text: data.text.trim(), engine: "remote" };
}

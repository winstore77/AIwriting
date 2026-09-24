import type { AiAction, AiContext, AiResult, Genre, Suggestion, Tone } from "../types";

type Rng = () => number;

function rng(seed: number): Rng {
  let s = seed || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(rand: Rng, items: T[]): T {
  return items[Math.floor(rand() * items.length) % items.length];
}

function hasBatchim(word: string): boolean {
  if (!word) return false;
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return false;
  return (c - 0xac00) % 28 !== 0;
}

function josa(word: string, kind: "은는" | "이가" | "을를" | "과와" | "으로로"): string {
  const batchim = hasBatchim(word);
  const code = word ? word.charCodeAt(word.length - 1) : 0;
  const rieul = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 === 8;
  switch (kind) {
    case "은는":
      return batchim ? "은" : "는";
    case "이가":
      return batchim ? "이" : "가";
    case "을를":
      return batchim ? "을" : "를";
    case "과와":
      return batchim ? "과" : "와";
    case "으로로":
      return batchim && !rieul ? "으로" : "로";
  }
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+?)(은는|이가|을를|과와|으로로)?\}/g, (_, key: string, particle?: string) => {
    const word = vars[key] ?? "";
    if (!word) return "";
    if (!particle) return word;
    return word + josa(word, particle as "은는");
  });
}

function keywords(text: string): string[] {
  const stop = new Set([
    "그리고", "그러나", "하지만", "그래서", "그것", "이것", "저것", "사람", "자신", "이미", "아직", "다시", "그냥", "정말", "너무", "아주", "하나의", "없는", "있는", "했다", "였다", "이었다",
  ]);
  const found: string[] = [];
  const cleaned = text.replace(/[「」"'“”.,!?…~]/g, " ");
  for (const raw of cleaned.split(/\s+/)) {
    const word = raw.replace(/(은|는|이|가|을|를|의|에|와|과|도|로|으로|에서|까지|부터|만|나|다)$/g, "");
    if (word.length >= 2 && !stop.has(word) && !found.includes(word)) found.push(word);
    if (found.length >= 6) break;
  }
  return found;
}

function quotesOf(text: string): string[] {
  return [...text.matchAll(/「([^」]{1,80})」/g)].map((m) => m[1]);
}

interface Voice {
  places: string[];
  objects: string[];
  air: string[];
  motions: string[];
  feelings: string[];
  hooks: string[];
}

const VOICES: Record<Genre, Voice> = {
  판타지: {
    places: ["성벽 아래 골목", "꺼진 봉화대", "이끼 낀 성소", "이름 없는 숲길", "등잔이 흔들리는 객잔"],
    objects: ["검집", "낡은 부적", "금 간 수정", "피 묻은 지도", "봉인된 문"],
    air: ["쇳내", "젖은 재 냄새", "차갑게 식은 마력", "멀리서 울리는 종"],
    motions: ["검집에 손을 얹었다", "숨을 죽이며 발걸음을 늦췄다", "등불을 손바닥으로 가렸다", "흉터 난 손을 천천히 폈다"],
    feelings: ["방금 삼킨 이름이 목구멍에 걸렸다", "잊힌 문장이 혀끝에 남아 있었다", "이 침묵은 자비가 아니었다"],
    hooks: ["등불 하나가 사람을 비추기보다, 지워진 이름을 찾으러 오듯 켜졌다.", "멀리서 문이 열리고, 그 틈으로 아직 부르지 못한 이름이 새어 나왔다.", "검이 아주 작게 울렸다. 대답을 요구하는 소리가 아니었다."],
  },
  무협: {
    places: ["객잔 뒷마당", "안개 낀 죽림", "무너진 산문", "달빛 아래 돌다리", "피 냄새 밴 협곡"],
    objects: ["검", "술잔", "비급의 찢긴 페이지", "허리춤의 패", "식어 가는 차"],
    air: ["칼바람", "소나무 진액 냄새", "식지 않은 살기", "멀리 떨어지는 낙엽"],
    motions: ["검자루를 어루만졌다", "발끝으로 중심을 낮췄다", "소매를 걷어 올렸다", "술잔을 내려놓으며 시선을 들었다"],
    feelings: ["내공은 아직 단전 아래서 잠잠했다", "한 초식의 빈틈이 마음보다 먼저 드러났다", "원한은 칼보다 늦게 식는다"],
    hooks: ["산문 너머에서 누군가 검을 뽑는 기척이 났다.", "바람이 죽림을 가를 때, 그 속에 사람의 숨이 하나 섞여 있었다.", "패 위의 이름이 달빛에 젖어, 방금 전까지 없던 글자처럼 번졌다."],
  },
  로맨스: {
    places: ["비 오는 서가", "마지막 손님만 남은 카페", "닫히기 직전의 골목", "창가 자리", "종이 냄새가 밴 작업실"],
    objects: ["우산", "접힌 원고", "식어 가는 커피", "책갈피", "젖은 소매"],
    air: ["창에 붙는 비", "종이 냄새", "낮은 음악", "바닥을 구르는 물방울"],
    motions: ["우산을 접어 입구에 세웠다", "책등을 손가락으로 더듬었다", "말 대신 잔을 조금 돌렸다", "창밖을 보다가 시선을 거뒀다"],
    feelings: ["하고 싶은 말은 언제나 한 박자 늦었다", "다정함은 큰 문장보다 작은 버릇에 숨어 있었다", "이 정적은 불편하지 않아서 더 위험했다"],
    hooks: ["문이 닫히기 전, 그가 이름을 부르듯 작게 책을 내려놓았다.", "비는 그치지 않았고, 둘 사이의 거리만 종이 한 장만큼 좁아졌다.", "불 꺼진 간판 아래서, 다음 문장은 아직 누구의 것도 아니었다."],
  },
  현대판타지: {
    places: ["심야의 편의점", "폐쇄된 지하철 승강장", "옥상 물탱크 옆", "네온이 번진 골목", "서버실처럼 추운 지하"],
    objects: ["깨진 휴대폰", "손등의 문양", "영수증", "꺼지지 않는 알림", "피 묻은 교통카드"],
    air: ["형광등 잡음", "젖은 아스팔트", "오존 냄새", "멀리 깔리는 사이렌"],
    motions: ["화면을 주머니에 넣었다", "문양을 소매로 가렸다", "계단참에서 뒤를 돌아봤다", "이어폰을 한쪽만 뺐다"],
    feelings: ["현실의 규칙이 한 줄 어긋난 기분이었다", "설명하지 못할 힘이 손끝에서 식어 갔다", "평범한 밤으로 돌아가기엔 이미 늦었다"],
    hooks: ["알림이 하나 떴다. 발신자는 없고, 문장만 있었다.", "승강장 끝에서 같은 얼굴이 이쪽을 보고 있었다. 유리 너머가 아니었다.", "손등의 문양이 맥박에 맞춰, 이번엔 숨기지 못하고 빛났다."],
  },
  SF: {
    places: ["관측 갑판", "산소가 얇은 복도", "폐기된 도크", "항법실", "유리 너머로 행성이 도는 휴게실"],
    objects: ["균열 난 헬멧", "식은 배급식", "로그 태블릿", "잠긴 해치", "깜빡이는 경고등"],
    air: ["재활용된 공기", "금속이 식는 소리", "낮은 진동", "먼 엔진의 맥"],
    motions: ["해치 잠금을 확인했다", "로그의 시간을 두 번 봤다", "장갑을 벗지 않은 채 벽을 짚었다", "무전을 열었다가 도로 닫았다"],
    feelings: ["기록과 기억은 같은 초를 가리키지 않았다", "침묵은 고장이 아니라 선택처럼 들렸다", "살아 있다는 표시는 경고등뿐이었다"],
    hooks: ["로그의 마지막 줄은 아직 쓰이지 않은 시각이었다.", "해치 밖에서 같은 호출부호가 다시 울렸다. 배 안에는 그 사람이 없었다.", "행성이 한 바퀴 도는 동안, 함선은 같은 문장을 세 번 반복하고 있었다."],
  },
  미스터리: {
    places: ["테이프가 남은 현관", "밤의 기록 보관소", "불 꺼진 사무실", "비에 젖은 버스 정류장", "시계가 멈춘 응접실"],
    objects: ["빠진 페이지", "식은 찻잔", "지문 없는 손잡이", "접힌 사진", "시간이 안 맞는 영수증"],
    air: ["먼지", "식은 홍차", "젖은 코트", "종이 넘기는 소리"],
    motions: ["사진의 모서리를 맞댔다", "서랍을 열기 전에 손을 멈췄다", "진술을 한 줄씩 지웠다", "창문의 빗장을 확인했다"],
    feelings: ["빠진 것은 단서가 아니라 사람이었다", "너무 깔끔한 현장은 거짓말과 닮아 있었다", "기억은 알리바이를 도와주지 않았다"],
    hooks: ["영수증의 시각은, 그가 여기 없었다고 말한 바로 그 시간이었다.", "사진 속에서 누군가 카메라를 보고 있었다. 어제까지는 없던 얼굴이었다.", "문이 안에서 잠겨 있었다. 열쇠는 그의 주머니에 있었다."],
  },
  공포: {
    places: ["끝이 안 보이는 복도", "물이 고인 지하", "문이 하나 더 있는 방", "꺼진 아파트 계단", "거울이 많은 현관"],
    objects: ["젖은 발자국", "꺼지지 않는 손전등", "남의 목소리", "닫히지 않는 문", "천장"],
    air: ["곰팡내", "너무 가까운 숨", "물 떨어지는 소리", "전기가 죽은 정막"],
    motions: ["뒤를 돌아보지 않으려다 돌아봤다", "손전등을 낮췄다", "문을 열다 말았다", "자기 이름을 입 안에서만 굴렸다"],
    feelings: ["여기 있던 사람은 자신이 아니었다", "소리가 멈추자 더 가까워진 기분이었다", "세어 보면 발이 하나 많았다"],
    hooks: ["복도 끝의 문이 닫혀 있는데, 경첩이 안에서 움직였다.", "손전등 불빛이 벽을 훑다 멈추자, 그림자가 한 박자 늦게 따라왔다.", "누군가 그의 목소리로, 아직 하지 않은 문장을 먼저 말했다."],
  },
  대체역사: {
    places: ["밤의 정청", "등불이 남은 사랑", "비 맞은 성문", "먹물 냄새 밴 서고", "말발굽이 멀어지는 돌길"],
    objects: ["어명", "젖은 밀서", "녹슨 도장", "식은 수라", "접힌 지도"],
    air: ["먹물", "향", "젖은 흙", "멀리 치는 경점"],
    motions: ["도장을 쥐었다 놓았다", "밀서를 소매에 넣었다", "무릎을 꿇기 전에 시선을 들었다", "붓을 내리며 문장을 지웠다"],
    feelings: ["기록되는 역사와 살아남는 역사는 달랐다", "충성도 역모도 같은 먹물로 쓰였다", "한 글자가 성을 바꿀 수 있었다"],
    hooks: ["밀서의 마지막 이름은, 내일 사초에서 지워질 이름이었다.", "성문이 열리기 전, 등롱 하나가 반대편에서 같은 신호를 보냈다.", "붓끝의 먹이 마르기 전에, 복도에서 군화가 멈췄다."],
  },
};

function cast(ctx: AiContext) {
  const names = ctx.characters.map((c) => c.name).filter(Boolean);
  return {
    hero: names[0] || "그",
    other: names[1] || "상대",
    third: names[2] || "목소리",
    role: ctx.characters[0]?.role || "주인공",
    trait: ctx.characters[0]?.trait || "쉽게 입을 열지 않는",
  };
}

function vars(ctx: AiContext, rand: Rng) {
  const voice = VOICES[ctx.genre];
  const people = cast(ctx);
  const keys = keywords(`${ctx.logline} ${ctx.world} ${ctx.content.slice(-400)}`);
  return {
    ...people,
    place: pick(rand, voice.places),
    object: pick(rand, voice.objects),
    air: pick(rand, voice.air),
    motion: pick(rand, voice.motions),
    feeling: pick(rand, voice.feelings),
    hook: pick(rand, voice.hooks),
    key: keys[0] || ctx.genre,
    key2: keys[1] || ctx.title,
    chapter: ctx.chapterTitle || "이 장면",
  };
}

function paragraphs(rand: Rng, lines: string[], v: Record<string, string>, count: number): string {
  const used = new Set<number>();
  const out: string[] = [];
  let guard = 0;
  while (out.length < count && guard < 30) {
    const i = Math.floor(rand() * lines.length);
    guard++;
    if (used.has(i)) continue;
    used.add(i);
    const text = fill(lines[i], v)
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
    if (text.length > 8) out.push(text);
  }
  return out.join("\n\n");
}

const CONTINUE: string[] = [
  "{hero은는} {place}에서 {motion}. {air이가} 먼저 장면을 스쳤고, {object은는} 아직 그의 손 가까이에 있었다.",
  "「{key}에 대해 더 말하지 마.」\n\n{other은는} 그렇게 말했지만 눈은 {hero}의 손을 보고 있었다. {feeling}.",
  "{chapter}의 공기는 {air으로로} 기울어 있었다. {hero은는} {key2을를} 떠올리다가, 입 밖에 내지 못한 문장을 삼켰다.",
  "{other이가} 한 걸음 먼저 {place}의 끝을 가리켰다. {hero은는} 대답 대신 {motion}.",
  "「지금 돌아가면, {key은는} 그대로 남을 거야.」\n\n{hero은는} 그 말을 삼키듯 받았다. {feeling}.",
  "{object이가} 아주 작게 움직였다. 착각이라고 하기엔, {hero}의 숨이 먼저 맞춰져 있었다.",
  "{place}의 불빛은 사람을 비추지 않고 빈자리를 비췄다. {hero은는} 그 빈자리가 누구의 것인지 알고 있었다.",
  "{third이가} 낮게 이름을 불렀다. {hero은는} 돌아보지 않은 채 {motion}. {key2은는} 이미 장면 안에 들어와 있었다.",
];

const TONE_LINE: Record<Tone, string[]> = {
  유지: ["{hero은는} 서두르지 않았다. 다음 한 수가 장면을 정할 터였다."],
  긴장: ["숨이 반 박자 빨라졌다. {object}에 손이 닿기도 전에, 누군가의 기척이 {place을를} 가로질렀다.", "말이 끝나기 전에 불이 꺼졌다."],
  서정: ["{air이가} 길게 남았다. {hero은는} 그 여운 속에서 {key을를} 오래 굴렸다.", "서두를 이유가 없는 밤이었다. 그래서 더 선명했다."],
  유머: ["「대단한 표정이네. 방금 세계가 무너진 사람 같아.」\n\n{other은는} 웃었고, {hero은는} 부정하지 못했다.", "비장함은 삼 초를 넘기지 못했다. {object이가} 하필 그 순간 굴러떨어졌다."],
  속도: ["생각할 틈은 없었다. {hero은는} {place을를} 가로질렀다.", "{other}의 고함이 뒤에서 잘렸다. {hero은는} 이미 {object을를} 쥐고 있었다."],
};

const REWRITE: string[] = [
  "{hero은는} 같은 장면을 다른 호흡으로 다시 밟았다. {place}의 {air은는} 여전했고, 달라진 것은 문장의 각도뿐이었다.",
  "「{quote}」\n\n그 대사는 남기되, {hero은는} 반응을 늦췄다. {feeling}.",
  "{key}와 {key2이가} 한 문단 안에서 다시 만났다. {other은는} 설명하지 않았고, {hero은는} {motion}.",
  "장면의 뼈대는 그대로였다. {object이가} 먼저 보이고, 이어서 {hero}의 선택이 따라왔다.",
];

const SCENE: string[] = [
  "{prompt}\n\n{hero은는} 그 요구를 {place}의 공기에 풀어 놓았다. {air이가} 스치고, {object이가} 손끝에 걸렸다.",
  "{other은는} 상황을 한 문장으로 정리하지 않았다. 대신 {hero을를} 보며 낮게 말했다.\n\n「{key}, 지금부터다.」",
  "{hero은는} {motion}. 핵심은 대사가 아니라 거리였다. 둘 사이에는 {object} 하나만큼의 틈이 있었다.",
  "{feeling}. 그리고 장면은 {place}에서 멈추지 않고, {key2} 쪽으로 한 걸음 기울었다.",
];

const OPENING: string[] = [
  "{place}에 도착했을 때, {hero은는} 아직 {role}이라는 말로는 설명되지 않는 얼굴이었다. {trait}. {air이가} 그 뒤를 따랐다.",
  "{object이가} {hero}의 곁에 있었다. 그것을 집어 드는 순간이 시작이 될지, 끝이 될지는 {chapter이가} 결정해야 했다.",
  "{other이가} 멀리서 {hero을를} 알아보고도 바로 다가오지 않았다. {key은는} 이미 둘 사이에 놓여 있었다.",
  "{hero은는} 아직 입 밖에 내지 못한 일이 있었다. {key은는} 그 일의 가장자리에 걸쳐 있었다.",
];

const SUGGEST_TITLES = [
  ["갈등을 앞으로", "숨기던 이해관계가 한 문장으로 터진다."],
  ["비밀의 가장자리", "인물이 아는 것과 말하는 것이 어긋난다."],
  ["장소가 바뀐다", "다음 장면은 다른 공기로 넘어간다."],
] as const;

function suggestionProse(i: number): string[] {
  if (i === 0) {
    return [
      "{other은는} 더 이상 에두르지 않았다.\n\n「{key을를} 지키려면 {hero이가} 빠져야 해.」\n\n{hero은는} {object을를} 내려다봤다. 거절은 쉽고, 그 뒤의 장면은 쉽지 않았다.",
      "{place}의 공기가 싸늘해졌다. {feeling}.",
    ];
  }
  if (i === 1) {
    return [
      "{hero은는} 알고 있는 이름을 삼켰다. {other이가} 묻는 눈빛을 보내도, {key2은는} 입 밖으로 나오지 않았다.",
      "「다 말했어?」\n\n{hero은는} 고개를 끄덕였다. 거짓말치고는 너무 조용했다. {object}만이 그 침묵을 듣고 있었다.",
    ];
  }
  return [
    "장면은 {place}에서 끊겼다. 다음 공기는 달랐다. {air} 대신 다른 온기가 먼저 닿았다.",
    "{hero은는} 새로운 문턱에서 {motion}. {other}의 목소리는 아직 뒤에 남아 있었다.\n\n「거기서 기다릴게. 오래는 아니야.」",
  ];
}

export function runLocal(action: AiAction, ctx: AiContext): AiResult {
  const seed = hash(
    `${action.type}|${ctx.title}|${ctx.content.slice(-280)}|${"instruction" in action ? action.instruction : ""}|${"prompt" in action ? action.prompt : ""}|${"source" in action ? action.source.slice(0, 120) : ""}|${Date.now()}`,
  );
  const rand = rng(seed);
  const v: Record<string, string> = {
    ...vars(ctx, rand),
    logline: ctx.logline.trim() || `${ctx.title}의 첫 문장은 아직 누구도 쓰지 않았다.`,
    quote: quotesOf("source" in action ? action.source : ctx.content)[0] || "그만하자",
    prompt: "prompt" in action ? action.prompt.trim() : "",
  };
  const tone: Tone = "tone" in action ? action.tone : "유지";

  if (action.type === "suggest") {
    const suggestions: Suggestion[] = SUGGEST_TITLES.map(([title, summary], i) => ({
      title,
      summary,
      prose: suggestionProse(i).map((line) => fill(line, v)).join("\n\n"),
    }));
    return { suggestions, engine: "local" };
  }

  if (action.type === "opening" || (action.type === "continue" && !ctx.content.trim())) {
    const body = paragraphs(rand, OPENING, v, 3);
    return { text: body, engine: "local" };
  }

  if (action.type === "rewrite") {
    const sourceKeys = keywords(action.source);
    if (sourceKeys[0]) v.key = sourceKeys[0];
    if (sourceKeys[1]) v.key2 = sourceKeys[1];
    const body = paragraphs(rand, [...REWRITE, ...TONE_LINE[tone]], v, 3);
    return { text: body, engine: "local" };
  }

  if (action.type === "scene") {
    const promptKeys = keywords(action.prompt);
    if (promptKeys[0]) v.key = promptKeys[0];
    if (promptKeys[1]) v.key2 = promptKeys[1];
    const body = paragraphs(rand, [...SCENE, ...TONE_LINE[tone]], v, 3);
    return { text: body, engine: "local" };
  }

  const instruction = action.instruction.trim().replace(/\s+/g, " ");
  const note = instruction ? (/[.!?…」]$/.test(instruction) ? instruction : `${instruction}.`) : "";
  const body = paragraphs(rand, [...CONTINUE, ...TONE_LINE[tone], "{hook}"], v, tone === "속도" ? 2 : 3);
  const text = [body, note].filter(Boolean).join("\n\n");
  return { text, engine: "local" };
}

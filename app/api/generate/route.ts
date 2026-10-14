import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    system?: string;
    user?: string;
  };

  const apiKey = body.apiKey?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "API 키가 없습니다. 설정에서 키를 입력하세요." }, { status: 400 });
  }

  const base = (body.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = body.model?.trim() || "gpt-4o-mini";

  try {
    const upstream = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.9,
        messages: [
          { role: "system", content: body.system ?? "" },
          { role: "user", content: body.user ?? "" },
        ],
      }),
    });

    const payload = (await upstream.json()) as {
      error?: { message?: string };
      choices?: { message?: { content?: string } }[];
    };

    if (!upstream.ok) {
      return NextResponse.json(
        { error: payload.error?.message || "외부 모델이 요청을 거절했습니다." },
        { status: upstream.status },
      );
    }

    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) {
      return NextResponse.json({ error: "모델이 빈 응답을 보냈습니다." }, { status: 502 });
    }
    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ error: "모델 서버에 연결하지 못했습니다." }, { status: 502 });
  }
}

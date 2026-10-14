import type { AiAction, AiContext, AiResult, AiSettings } from "../types";
import { runLocal } from "./engine";
import { runRemote } from "./remote";

export async function generate(action: AiAction, ctx: AiContext, settings: AiSettings): Promise<AiResult> {
  if (settings.provider === "remote") {
    if (!settings.apiKey.trim()) {
      throw new Error("외부 모델을 쓰려면 설정에서 API 키를 입력하세요.");
    }
    return runRemote(action, ctx, settings);
  }
  return runLocal(action, ctx);
}

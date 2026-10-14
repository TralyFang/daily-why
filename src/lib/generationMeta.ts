export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface GenerationMeta {
  model: string;
  promptTokens: number;
  completionTokens: number;
  neurons: number | null;
  attempts: number;
}

export const GENERATION_META_MARKER = "<!--daily-why-ai-meta:";

const MODEL_DISPLAY_NAMES: Record<string, string> = {
  "@cf/qwen/qwen3.8-27b": "Qwen 3.8 27B",
  "@cf/zai-org/glm-4.7-flash": "GLM-4.7 Flash",
  "@cf/meta/llama-4-scout-17b-16e-instruct": "Llama 4 Scout",
};

// Neurons per 1M tokens, from Cloudflare Workers AI pricing
const NEURON_RATES: Record<string, { input: number; output: number }> = {
  "@cf/qwen/qwen3.8-27b": { input: 40909, output: 290909 },
  "@cf/zai-org/glm-4.7-flash": { input: 5500, output: 36400 },
  "@cf/meta/llama-4-scout-17b-16e-instruct": { input: 24545, output: 77273 },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readTokenUsage(raw: unknown): TokenUsage {
  const usage = asRecord(raw);
  if (!usage) return { promptTokens: 0, completionTokens: 0 };
  const prompt = Number(usage.prompt_tokens ?? usage.promptTokens ?? usage.input_tokens ?? 0);
  const completion = Number(usage.completion_tokens ?? usage.completionTokens ?? usage.output_tokens ?? 0);
  return {
    promptTokens: Number.isFinite(prompt) ? prompt : 0,
    completionTokens: Number.isFinite(completion) ? completion : 0,
  };
}

export function extractAiUsage(response: unknown): TokenUsage {
  const record = asRecord(response);
  if (!record) return { promptTokens: 0, completionTokens: 0 };
  if (record.usage) return readTokenUsage(record.usage);
  const result = asRecord(record.result);
  if (result?.usage) return readTokenUsage(result.usage);
  return { promptTokens: 0, completionTokens: 0 };
}

export function estimateNeurons(model: string, usage: TokenUsage): number | null {
  const rate = NEURON_RATES[model];
  if (!rate) return null;
  return Math.round(
    (usage.promptTokens / 1_000_000) * rate.input +
      (usage.completionTokens / 1_000_000) * rate.output
  );
}

export function friendlyModelName(model: string): string {
  return MODEL_DISPLAY_NAMES[model] || model.replace(/^@cf\/[^/]+\//, "");
}

export function formatNeuronCount(count: number): string {
  if (count >= 1000) {
    const kilo = count / 1000;
    const digits = kilo >= 10 ? kilo.toFixed(1) : kilo.toFixed(2);
    return `${digits.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1")}k`;
  }
  return String(count);
}

export function formatGenerationMeta(meta: GenerationMeta): string {
  const parts = [friendlyModelName(meta.model)];
  if (meta.promptTokens > 0 || meta.completionTokens > 0) {
    parts.push(`输入 ${meta.promptTokens.toLocaleString("zh-CN")}`);
    parts.push(`输出 ${meta.completionTokens.toLocaleString("zh-CN")}`);
  }
  if (meta.neurons != null && meta.neurons > 0) {
    parts.push(`约 ${formatNeuronCount(meta.neurons)} Neurons`);
  }
  if (meta.attempts > 1) {
    parts.push(`${meta.attempts} 次调用`);
  }
  return parts.join(" · ");
}

export function splitGenerationMeta(content: string): { body: string; meta: GenerationMeta | null } {
  const match = content.match(/\n\n<!--daily-why-ai-meta:([\s\S]*?)-->\s*$/);
  if (!match || match.index == null) return { body: content, meta: null };
  try {
    return {
      body: content.slice(0, match.index).trimEnd(),
      meta: JSON.parse(match[1]) as GenerationMeta,
    };
  } catch {
    return { body: content, meta: null };
  }
}

export function appendGenerationMeta(content: string, meta: GenerationMeta): string {
  const { body } = splitGenerationMeta(content);
  return `${body.trim()}\n\n${GENERATION_META_MARKER}${JSON.stringify(meta)}-->`;
}

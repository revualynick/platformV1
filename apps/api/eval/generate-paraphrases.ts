/**
 * Grow the sensitive dataset with the local model (qwen3:8b on Ollama):
 * each sensitive message rewritten three ways, same meaning and the same
 * seriousness, different voice. Labels are inherited from the original, so
 * a rewrite that drifts in seriousness becomes label noise; the report on
 * the frozen file lets a person spot-check that before relying on it.
 *
 * Output: eval/data/paraphrases.json, then frozen (committed) so every run
 * uses identical inputs. Runs with the thermal guard.
 *
 *   pnpm exec tsx eval/generate-paraphrases.ts [--per 3] [--model qwen3:8b]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { SNAPSHOTS } from "./lib/snapshots.js";
import { ThermalGuard } from "./lib/thermal.js";

const { values: args } = parseArgs({
  options: {
    per: { type: "string", default: "3" },
    model: { type: "string", default: "qwen3:8b" },
    ollama: { type: "string", default: "http://localhost:11434" },
  },
});

export interface Paraphrase {
  id: string;
  baseId: string;
  text: string;
}

const PROMPT = (message: string, n: number) => `You help test a workplace feedback chatbot. Below is a message an employee sent in a work check-in chat.

Rewrite it ${n} different ways, as ${n} different people might write it. Keep the SAME meaning and the SAME level of seriousness: do not make it more or less worrying, more or less positive, or add new facts. Vary the voice: length, formality, slang, punctuation, typos, British English. Keep names as they are.

Message: ${JSON.stringify(message)}

Reply with JSON only: {"variants": ["...", "...", "..."]}`;

async function main() {
  const per = Number(args.per);
  const guard = new ThermalGuard();
  const bases = SNAPSHOTS.filter((s) => s.sensitive);
  const out: Paraphrase[] = [];
  for (const [i, s] of bases.entries()) {
    await guard.beforeCall();
    const res = await fetch(`${args.ollama}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: args.model,
        stream: false,
        think: false,
        format: "json",
        keep_alive: "2m",
        options: { num_predict: 400, num_ctx: 2048, temperature: 0.9 },
        messages: [{ role: "user", content: PROMPT(s.input.reply, per) }],
      }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { message?: { content?: string } };
    let variants: string[] = [];
    try {
      variants = (JSON.parse(body.message?.content ?? "{}").variants ?? []).filter((v: unknown) => typeof v === "string" && v.trim());
    } catch {
      /* unusable output: skip this base */
    }
    variants.slice(0, per).forEach((text, k) => out.push({ id: `${s.id}~p${k + 1}`, baseId: s.id, text: text.trim() }));
    console.log(`${i + 1}/${bases.length} ${s.id}: ${variants.length} variant(s) | ${guard.summary()}`);
  }
  mkdirSync(new URL("./data/", import.meta.url), { recursive: true });
  writeFileSync(new URL("./data/paraphrases.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote ${out.length} paraphrases | ${guard.summary()}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

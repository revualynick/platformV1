import { DemoChat } from "@/components/demo-chat";

export default function DemoPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-stone-800">
          Demo Chat
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Test the full conversation flow with a live LLM — no chat platform
          required.
        </p>
      </div>
      <DemoChat />
    </div>
  );
}

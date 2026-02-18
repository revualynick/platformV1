"use server";

import {
  startDemoConversation,
  sendDemoReply,
  type DemoStartResponse,
  type DemoReplyResponse,
} from "@/lib/api";

export async function startDemo(): Promise<
  DemoStartResponse | { error: string }
> {
  try {
    return await startDemoConversation();
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to start conversation",
    };
  }
}

export async function replyToDemo(
  conversationId: string,
  message: string,
): Promise<DemoReplyResponse | { error: string }> {
  try {
    return await sendDemoReply(conversationId, message);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to send reply",
    };
  }
}

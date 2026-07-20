"use server";

import {
  startAssessmentSession,
  submitAssessmentSession,
} from "@/lib/api";
import { requireLiveSession } from "@/lib/session-utils";
import { redirect } from "next/navigation";

export async function startAssessment(framework: string, context?: string) {
  const guard = await requireLiveSession();
  if (!guard.ok) return { success: false, error: guard.error };

  if (framework !== "colour" && framework !== "cdm") {
    return { success: false, error: "Invalid framework" };
  }

  try {
    const session = await startAssessmentSession({ framework, context });
    return { success: true, sessionId: session.id };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to start assessment" };
  }
}

export async function submitAssessment(
  sessionId: string,
  responses: Record<string, string>,
) {
  const guard = await requireLiveSession();
  if (!guard.ok) return { success: false, error: guard.error };

  if (!sessionId) return { success: false, error: "Missing session ID" };

  const responseCount = Object.keys(responses).length;
  if (responseCount === 0) return { success: false, error: "No responses provided" };

  try {
    const result = await submitAssessmentSession(sessionId, responses);
    return {
      success: true,
      profileId: result.profile.id,
      sessionId: result.session.id,
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to submit assessment" };
  }
}

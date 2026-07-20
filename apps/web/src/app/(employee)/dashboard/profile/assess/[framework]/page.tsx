import { auth } from "@/lib/auth";
import { isDemoSession } from "@/lib/session-utils";
import { redirect } from "next/navigation";
import { getAssessmentQuestions } from "@/lib/api";
import { QuizWizard } from "./quiz-wizard";

interface Props {
  params: Promise<{ framework: string }>;
  searchParams: Promise<{ context?: string }>;
}

export default async function AssessPage({ params, searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.id || isDemoSession(session)) {
    redirect("/login");
  }

  const { framework } = await params;
  const { context } = await searchParams;

  if (framework !== "colour" && framework !== "cdm") {
    redirect("/dashboard/profile");
  }

  let questions: Array<{
    id: string;
    framework: string;
    questionType: string;
    text: string;
    options: Array<{ key: string; text: string }>;
    sortOrder: number;
  }> = [];

  try {
    const res = await getAssessmentQuestions(framework);
    questions = res.data;
  } catch {
    redirect("/dashboard/profile");
  }

  if (questions.length === 0) {
    redirect("/dashboard/profile");
  }

  const title = framework === "colour"
    ? "Communication Style Assessment"
    : "Critical Decision Making Assessment";

  const subtitle = framework === "colour"
    ? "Answer each question with the response that feels most natural to you. There are no right or wrong answers."
    : "Read each scenario and choose the response closest to how you would actually act. There are no right or wrong answers.";

  return (
    <div className="mx-auto max-w-2xl py-8">
      <QuizWizard
        framework={framework}
        context={context ?? "onboarding"}
        questions={questions}
        title={title}
        subtitle={subtitle}
      />
    </div>
  );
}

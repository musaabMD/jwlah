import { SECTIONS } from "./constants";
import { InspectionData, InspectionQuestion, InspectionSection } from "./types";

export function getActiveSections(data: InspectionData): InspectionSection[] {
  const skip = new Set(data.skippedQuestionIds ?? []);
  return SECTIONS.map((s) => ({
    ...s,
    questions: s.questions.filter((q) => !skip.has(q.id)),
  })).filter((s) => s.questions.length > 0);
}

export function countActiveQuestions(data: InspectionData): number {
  return getActiveSections(data).reduce((n, s) => n + s.questions.length, 0);
}

export function calculateSectionMetrics(sectionId: string, data: InspectionData) {
  const section = SECTIONS.find((s) => s.id === sectionId);
  if (!section) return { earned: 0, total: 0, percentage: 0 };
  const skip = new Set(data.skippedQuestionIds ?? []);
  let total = 0;
  let earned = 0;
  for (const q of section.questions) {
    if (skip.has(q.id)) continue;
    const score = data.scores[q.id];
    if (score !== "na" && score !== null && score !== undefined) {
      total += 1;
      if (score === "yes") earned += 1;
    }
  }
  return {
    earned,
    total,
    percentage: total > 0 ? Math.round((earned / total) * 100) : 100,
  };
}

export function calculateGlobalMetrics(data: InspectionData) {
  let globalTotal = 0;
  let globalEarned = 0;
  for (const s of SECTIONS) {
    const { earned, total } = calculateSectionMetrics(s.id, data);
    globalEarned += earned;
    globalTotal += total;
  }
  return {
    earned: globalEarned,
    total: globalTotal,
    percentage: globalTotal > 0 ? Math.round((globalEarned / globalTotal) * 100) : 100,
  };
}

export function isSectionComplete(sectionId: string, data: InspectionData): boolean {
  const section = SECTIONS.find((s) => s.id === sectionId);
  if (!section) return true;
  const skip = new Set(data.skippedQuestionIds ?? []);
  return section.questions.every((q) => {
    if (skip.has(q.id)) return true;
    const score = data.scores[q.id];
    return score !== undefined && score !== null;
  });
}

export type QuestionSlide = {
  sectionId: string;
  sectionTitle: string;
  question: InspectionQuestion;
  globalIndex: number;
  totalQuestions: number;
};

export function flattenQuestionSlides(data: InspectionData): QuestionSlide[] {
  const sections = getActiveSections(data);
  const totalQuestions = sections.reduce((n, s) => n + s.questions.length, 0);
  const out: QuestionSlide[] = [];
  let globalIndex = 0;
  for (const s of sections) {
    for (const q of s.questions) {
      globalIndex += 1;
      out.push({
        sectionId: s.id,
        sectionTitle: s.title,
        question: q,
        globalIndex,
        totalQuestions,
      });
    }
  }
  return out;
}

export function safeExportBase(data: InspectionData): string {
  const h = (data.hospital || "facility").replace(/[^\w\u0600-\u06FF-]+/g, "_").slice(0, 64);
  return `${h}_${data.date || "nodate"}`;
}

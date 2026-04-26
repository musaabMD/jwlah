import { SECTIONS } from "./constants";
import { InspectionData, InspectionQuestion, InspectionSection, ScoreValue } from "./types";

/** Coerce persisted / hand-edited values into strict ScoreValue for lookups and export. */
export function normalizeScoreValue(raw: unknown): ScoreValue {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "boolean") return raw ? "yes" : "no";
  if (typeof raw === "number") {
    if (raw === 1) return "yes";
    if (raw === 0) return "no";
    return null;
  }
  if (typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase();
  if (t === "" || t === "null" || t === "undefined") return null;
  if (t === "yes" || t === "y" || t === "true" || t === "1" || t === "نعم") return "yes";
  if (t === "no" || t === "n" || t === "false" || t === "0" || t === "لا") return "no";
  if (t === "na" || t === "n/a" || t === "n\\a" || t === "غير applicable" || t === "غير قابل للتطبيق") return "na";
  return null;
}

function toTrimmedString(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (v == null) return "";
  return String(v).trim();
}

function asStringRecord(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

/**
 * Maps scores and per-item notes onto canonical question `id`s (from SECTIONS).
 * Use after loading JSON/localStorage/history so PowerPoint and metrics match the form.
 */
export function normalizeInspectionData(data: InspectionData): InspectionData {
  let sourceScores = asStringRecord(data.scores);
  const sourceNotes = asStringRecord(data.itemNotes);

  if (Array.isArray(data.scores)) {
    const merged: Record<string, unknown> = { ...sourceScores };
    for (const row of data.scores as unknown[]) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const o = row as Record<string, unknown>;
      const id = o.id ?? o.qid ?? o.questionId;
      if (id != null && String(id).trim()) merged[String(id).trim()] = o.score ?? o.value ?? o.answer ?? o.val;
    }
    sourceScores = merged;
  }

  const scores: Record<string, ScoreValue> = {};
  const itemNotes: Record<string, string> = {};

  const pickRawScore = (q: InspectionQuestion): unknown => {
    const keys = [q.id, q.id.trim(), q.text, q.text.trim()].filter(Boolean) as string[];
    for (const key of keys) {
      if (key in sourceScores) return sourceScores[key];
    }
    const idLower = q.id.toLowerCase();
    for (const [k, v] of Object.entries(sourceScores)) {
      if (k.trim().toLowerCase() === idLower) return v;
    }
    return undefined;
  };

  const pickRawNote = (q: InspectionQuestion): string => {
    const keys = [q.id, q.id.trim(), q.text, q.text.trim()].filter(Boolean) as string[];
    for (const key of keys) {
      const v = toTrimmedString(sourceNotes[key]);
      if (v) return v;
    }
    const idLower = q.id.toLowerCase();
    for (const [k, v] of Object.entries(sourceNotes)) {
      if (k.trim().toLowerCase() === idLower) return toTrimmedString(v);
    }
    return "";
  };

  for (const section of SECTIONS) {
    for (const q of section.questions) {
      const raw = pickRawScore(q);
      const n = normalizeScoreValue(raw);
      if (n !== null) scores[q.id] = n;
      const note = pickRawNote(q);
      if (note) itemNotes[q.id] = note;
    }
  }

  for (const [k, v] of Object.entries(sourceScores)) {
    if (k in scores) continue;
    const n = normalizeScoreValue(v);
    if (n !== null) scores[k] = n;
  }

  for (const [k, v] of Object.entries(sourceNotes)) {
    if (k in itemNotes) continue;
    const t = toTrimmedString(v);
    if (t) itemNotes[k] = t;
  }

  return {
    ...data,
    scores,
    itemNotes,
  };
}

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

export function getSectionCompletion(sectionId: string, data: InspectionData) {
  const section = SECTIONS.find((s) => s.id === sectionId);
  if (!section) return { answered: 0, total: 0, complete: true };
  const skip = new Set(data.skippedQuestionIds ?? []);
  let total = 0;
  let answered = 0;
  for (const q of section.questions) {
    if (skip.has(q.id)) continue;
    total += 1;
    const score = data.scores[q.id];
    if (score !== undefined && score !== null) answered += 1;
  }
  return { answered, total, complete: total === 0 ? true : answered === total };
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

/** Fresh tour: same defaults as the initial app state (today at noon, empty scores). */
export function createEmptyInspectionData(): InspectionData {
  const optionalByDefaultQuestionIds =
    SECTIONS.find((section) => section.id === "ipc_bundle_compliance_audit")?.questions.map((q) => q.id) ?? [];
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const iso = `${y}-${m}-${day}`;
  return {
    inspectors: [],
    hospital: "",
    date: iso,
    day: new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(new Date(`${iso}T12:00:00`)),
    email: "",
    baselinePercentage: null,
    scores: {},
    itemNotes: {},
    sectionNotes: {},
    sectionImages: {},
    skippedQuestionIds: optionalByDefaultQuestionIds,
  };
}

export type InspectionFlowStep =
  | {
      kind: "question";
      sectionId: string;
      sectionTitle: string;
      sectionIndex: number;
      sectionsCount: number;
      question: InspectionQuestion;
      questionIndexInSection: number;
      questionsInSection: number;
    }
  | {
      kind: "section-wrap";
      sectionId: string;
      sectionTitle: string;
      sectionIndex: number;
      sectionsCount: number;
    };

export function buildInspectionFlow(data: InspectionData): InspectionFlowStep[] {
  const sections = getActiveSections(data);
  const steps: InspectionFlowStep[] = [];
  const sectionsCount = sections.length;
  sections.forEach((section, sectionIndex) => {
    const n = section.questions.length;
    section.questions.forEach((question, qi) => {
      steps.push({
        kind: "question",
        sectionId: section.id,
        sectionTitle: section.title,
        sectionIndex,
        sectionsCount,
        question,
        questionIndexInSection: qi + 1,
        questionsInSection: n,
      });
    });
    steps.push({
      kind: "section-wrap",
      sectionId: section.id,
      sectionTitle: section.title,
      sectionIndex,
      sectionsCount,
    });
  });
  return steps;
}

export function isFlowStepComplete(step: InspectionFlowStep, data: InspectionData): boolean {
  if (step.kind === "section-wrap") return true;
  const s = data.scores[step.question.id];
  return s !== undefined && s !== null;
}

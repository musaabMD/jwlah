import React, { useState, useRef, ChangeEvent, useMemo, useEffect, Fragment } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Presentation,
  History,
  Trash2,
  FilePlus2,
  Printer,
  LayoutGrid,
  Mail,
  Sparkles,
  FileText,
  BarChart3,
  LogIn,
  EllipsisVertical,
} from "lucide-react";
import { INSPECTORS, HOSPITALS, SECTIONS } from "./constants";
import { InspectionData, ScoreValue } from "./types";
import {
  calculateGlobalMetrics,
  calculateSectionMetrics,
  countActiveQuestions,
  flattenQuestionSlides,
  getActiveSections,
  getSectionCompletion,
  buildInspectionFlow,
  isFlowStepComplete,
  safeExportBase,
  createEmptyInspectionData,
} from "./inspection-utils";
import { MHC_LOGO_PATH } from "./branding";
import { downloadInspectionPptx } from "./export-pptx";
import { downloadInspectionReportPdf, printInspectionReport } from "./pdf-export";

const SETUP_STEP_COUNT = 5;
const DRAFT_STORAGE_KEY = "tour_draft";
const DRAFT_STORAGE_VERSION = 2 as const;

type AppStep = "home" | "setup" | "inspection" | "report" | "presentation" | "history";

type DraftPayloadV2 = {
  v: typeof DRAFT_STORAGE_VERSION;
  data: InspectionData;
  step: AppStep;
  setupWizardStep: number;
  inspectionStepIndex: number;
  showIntro: boolean;
};

function normalizeAppStep(s: unknown): AppStep {
  const allowed: AppStep[] = ["home", "setup", "inspection", "report", "presentation", "history"];
  return typeof s === "string" && (allowed as string[]).includes(s) ? (s as AppStep) : "home";
}

function clampWizardStep(n: unknown): number {
  const x = Math.round(Number(n));
  if (Number.isNaN(x)) return 0;
  return Math.min(SETUP_STEP_COUNT - 1, Math.max(0, x));
}

function mergeDraftIntoBase(base: InspectionData, d: Partial<InspectionData>): InspectionData {
  return {
    ...base,
    ...d,
    skippedQuestionIds: Array.isArray(d.skippedQuestionIds) ? d.skippedQuestionIds : base.skippedQuestionIds ?? [],
  };
}

function loadSessionFromStorage(): {
  data: InspectionData;
  step: AppStep;
  setupWizardStep: number;
  inspectionStepIndex: number;
  showIntro: boolean;
} {
  const base = createEmptyInspectionData();
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) {
      return { data: base, step: "home", setupWizardStep: 0, inspectionStepIndex: 0, showIntro: true };
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { data: base, step: "home", setupWizardStep: 0, inspectionStepIndex: 0, showIntro: true };
    }
    const o = parsed as Record<string, unknown>;
    if (o.v === DRAFT_STORAGE_VERSION && o.data && typeof o.data === "object") {
      const d = o.data as Partial<InspectionData>;
      const persistedStep = normalizeAppStep(o.step);
      /** Full page reload always opens الرئيسية; keep intro only if user was still on home + intro. */
      const showIntro = persistedStep === "home" && o.showIntro === true;
      return {
        data: mergeDraftIntoBase(base, d),
        step: "home",
        setupWizardStep: clampWizardStep(o.setupWizardStep),
        inspectionStepIndex: Math.max(0, Math.round(Number(o.inspectionStepIndex)) || 0),
        showIntro,
      };
    }
    const d = parsed as Partial<InspectionData>;
    const hasScores = d.scores != null && typeof d.scores === "object" && Object.keys(d.scores).length > 0;
    const hasWork =
      Boolean(d.hospital?.trim()) ||
      (Array.isArray(d.inspectors) && d.inspectors.length > 0) ||
      hasScores;
    return {
      data: mergeDraftIntoBase(base, d),
      step: "home",
      setupWizardStep: 0,
      inspectionStepIndex: 0,
      showIntro: !hasWork,
    };
  } catch {
    return { data: base, step: "home", setupWizardStep: 0, inspectionStepIndex: 0, showIntro: true };
  }
}

function persistSessionToStorage(payload: DraftPayloadV2) {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn("tour_draft_save_failed", e);
  }
}

const SETUP_WIZARD_STEPS = [
  { label: "الفريق" },
  { label: "المنشأة" },
  { label: "البريد" },
  { label: "التاريخ" },
  { label: "البنود" },
] as const;

function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayLocalISO(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return localISODate(d);
}

/** Dates shown as tappable chips (no native date picker / dropdown). */
const PRES_VARIANTS = {
  enter: (dir: number) => ({
    opacity: 0,
    x: dir * 40,
    filter: "blur(10px)",
  }),
  center: { opacity: 1, x: 0, filter: "blur(0px)" },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir * -40,
    filter: "blur(10px)",
  }),
};

function buildSetupDateStrip(): { iso: string; weekday: string; dayMonth: string }[] {
  const rows: { iso: string; weekday: string; dayMonth: string }[] = [];
  const base = new Date();
  base.setHours(12, 0, 0, 0);
  for (let delta = -7; delta <= 60; delta++) {
    const d = new Date(base);
    d.setDate(base.getDate() + delta);
    const iso = localISODate(d);
    const weekday = new Intl.DateTimeFormat("ar-SA", { weekday: "short" }).format(d);
    const dayMonth = new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short" }).format(d);
    rows.push({ iso, weekday, dayMonth });
  }
  return rows;
}

export default function App() {
  const [persistedBoot] = useState(loadSessionFromStorage);
  const [showIntro, setShowIntro] = useState(persistedBoot.showIntro);
  const [step, setStep] = useState<AppStep>(persistedBoot.step);
  const [inspectionStepIndex, setInspectionStepIndex] = useState(persistedBoot.inspectionStepIndex);
  const [presIndex, setPresIndex] = useState(0);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [homeMsg, setHomeMsg] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState<"pdf" | "pptx" | null>(null);
  /** معالج الإعداد: 0 فريق، 1 منشأة، 2 تاريخ، 3 بنود ثم بدء الجولة */
  const [setupWizardStep, setSetupWizardStep] = useState(persistedBoot.setupWizardStep);

  const [history, setHistory] = useState<unknown[]>(() => {
    const saved = localStorage.getItem("tour_history");
    return saved ? JSON.parse(saved) : [];
  });

  const [data, setData] = useState<InspectionData>(persistedBoot.data);

  const reportRef = useRef<HTMLDivElement>(null);
  const setupDateStripScrollRef = useRef<HTMLDivElement>(null);
  const presDirRef = useRef(1);
  const headerNavRef = useRef<HTMLDivElement>(null);
  const [headerNavOpen, setHeaderNavOpen] = useState(false);

  const activeSections = useMemo(() => getActiveSections(data), [data.skippedQuestionIds]);
  const totalScoreInfo = useMemo(() => calculateGlobalMetrics(data), [data.scores, data.skippedQuestionIds]);
  const activeCount = useMemo(() => countActiveQuestions(data), [data.skippedQuestionIds]);
  const questionSlides = useMemo(() => flattenQuestionSlides(data), [data.skippedQuestionIds]);
  const presTotal = questionSlides.length + 2;
  const inspectionFlow = useMemo(() => buildInspectionFlow(data), [data.skippedQuestionIds]);
  const setupDateStrip = useMemo(() => buildSetupDateStrip(), []);

  useEffect(() => {
    if (step !== "report") return;
    setData((p) => (p.id ? p : { ...p, id: `tour-${Date.now()}` }));
  }, [step]);

  useEffect(() => {
    if (step !== "report" || !data.id) return;
    setHistory((prev) => {
      const list = prev as { id: string }[];
      if (list.some((h) => h.id === data.id)) return prev;
      const tourWithMeta = { ...data, totalScore: calculateGlobalMetrics(data).percentage };
      const next = [tourWithMeta, ...list];
      localStorage.setItem("tour_history", JSON.stringify(next));
      return next;
    });
  }, [step, data.id]);

  useEffect(() => {
    if (step === "presentation") setPresIndex(0);
  }, [step]);

  useEffect(() => {
    setInspectionStepIndex((i) => Math.min(i, Math.max(0, inspectionFlow.length - 1)));
  }, [inspectionFlow.length]);

  useEffect(() => {
    persistSessionToStorage({
      v: DRAFT_STORAGE_VERSION,
      data,
      step,
      setupWizardStep,
      inspectionStepIndex,
      showIntro,
    });
  }, [data, step, setupWizardStep, inspectionStepIndex, showIntro]);

  useEffect(() => {
    if (step !== "setup" || setupWizardStep !== 3) return;
    const t = window.setTimeout(() => {
      const el = setupDateStripScrollRef.current?.querySelector<HTMLElement>(`[data-date-iso="${todayLocalISO()}"]`);
      el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }, 100);
    return () => window.clearTimeout(t);
  }, [step, setupWizardStep]);

  useEffect(() => {
    if (step !== "presentation") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === " " || e.key === "PageDown") {
        e.preventDefault();
        presDirRef.current = 1;
        setPresIndex((i) => Math.min(presTotal - 1, i + 1));
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        presDirRef.current = -1;
        setPresIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, presTotal]);

  useEffect(() => {
    setHeaderNavOpen(false);
  }, [step]);

  useEffect(() => {
    if (!headerNavOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (headerNavRef.current && !headerNavRef.current.contains(e.target as Node)) setHeaderNavOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHeaderNavOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [headerNavOpen]);

  const startNewTour = () => {
    setData(createEmptyInspectionData());
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    setSetupWizardStep(0);
    setInspectionStepIndex(0);
    setExportMsg(null);
    setStep("setup");
  };

  const deleteFromHistory = (id: string) => {
    setHistory((prev) => {
      const next = (prev as { id: string }[]).filter((h) => h.id !== id);
      localStorage.setItem("tour_history", JSON.stringify(next));
      return next;
    });
  };

  const toggleQuestionInTour = (qid: string) => {
    setData((prev) => {
      const skipped = new Set(prev.skippedQuestionIds ?? []);
      if (skipped.has(qid)) skipped.delete(qid);
      else skipped.add(qid);
      return { ...prev, skippedQuestionIds: Array.from(skipped) };
    });
  };

  const setSectionQuestionsIncluded = (sectionId: string, include: boolean) => {
    const section = SECTIONS.find((s) => s.id === sectionId);
    if (!section) return;
    setData((prev) => {
      const skipped = new Set(prev.skippedQuestionIds ?? []);
      section.questions.forEach((q) => {
        if (include) skipped.delete(q.id);
        else skipped.add(q.id);
      });
      return { ...prev, skippedQuestionIds: Array.from(skipped) };
    });
  };

  const downloadReport = async () => {
    if (!reportRef.current) return;
    setExportMsg(null);
    setExportBusy("pdf");
    try {
      await downloadInspectionReportPdf(reportRef.current, safeExportBase(data));
    } catch (e) {
      console.error(e);
      setExportMsg("تعذر إنشاء ملف PDF. جرّب «طباعة» ثم اختر حفظ PDF، أو صدّر PowerPoint.");
    } finally {
      setExportBusy(null);
    }
  };

  const runDownloadPptx = async () => {
    setExportMsg(null);
    setExportBusy("pptx");
    try {
      await downloadInspectionPptx(data);
    } catch (e) {
      console.error(e);
      setExportMsg("تعذر إنشاء ملف PowerPoint.");
    } finally {
      setExportBusy(null);
    }
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>, sectionId: string) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          setData((prev) => {
            const currentImages = prev.sectionImages[sectionId] || [];
            return {
              ...prev,
              sectionImages: {
                ...prev.sectionImages,
                [sectionId]: [...currentImages, reader.result as string],
              },
            };
          });
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const flowStep = inspectionFlow[inspectionStepIndex];
  const activeSectionSummaries = useMemo(
    () =>
      activeSections.map((section) => {
        const completion = getSectionCompletion(section.id, data);
        const firstStepIndex = inspectionFlow.findIndex((item) => item.sectionId === section.id);
        return { section, ...completion, firstStepIndex };
      }),
    [activeSections, data, inspectionFlow],
  );
  const completedSectionCount = activeSectionSummaries.filter((s) => s.complete).length;
  const currentSectionIndex = flowStep ? activeSections.findIndex((s) => s.id === flowStep.sectionId) : -1;
  const inspectionProgressPct =
    inspectionFlow.length > 0
      ? Math.min(100, Math.round(((inspectionStepIndex + 1) / inspectionFlow.length) * 100))
      : 0;
  const canStart =
    Boolean(data.hospital) && data.inspectors.length > 0 && activeCount > 0 && activeSections.length > 0;
  const canSetupNext =
    setupWizardStep === 0
      ? data.inspectors.length > 0
      : setupWizardStep === 1
        ? Boolean(data.hospital)
        : setupWizardStep === 2
          ? true
          : setupWizardStep === 3
            ? Boolean(data.date)
            : false;
  const canProceedStep = flowStep ? isFlowStepComplete(flowStep, data) : false;
  const finishInspection =
    inspectionFlow.length > 0 && inspectionStepIndex === inspectionFlow.length - 1 && flowStep?.kind === "section-wrap";

  const scoreLabel = (qid: string) => {
    const s = data.scores[qid];
    if (s === "yes") return "نعم";
    if (s === "no") return "لا";
    if (s === "na") return "N/A";
    return "—";
  };
  const historyStats = useMemo(() => {
    const tours = history as Array<{ totalScore?: number; scores?: Record<string, ScoreValue> }>;
    const count = tours.length;
    const avg = count > 0 ? Math.round(tours.reduce((sum, t) => sum + (t.totalScore ?? 0), 0) / count) : 0;
    return { count, avg };
  }, [history]);

  const headerTitle =
    step === "home"
      ? "نماذج الجولات"
      : step === "setup"
        ? "إعداد الجولة"
        : step === "inspection"
          ? "التقييم الميداني"
          : step === "report"
            ? "ملخص النتائج"
            : step === "history"
              ? "سجل الجولات"
              : "نماذج الجولات";

  const headerSubtitle: string | null =
    step === "setup"
      ? SETUP_WIZARD_STEPS[setupWizardStep]?.label ?? null
      : step === "inspection" && inspectionFlow.length > 0
        ? `${inspectionProgressPct}٪ · ${inspectionStepIndex + 1} من ${inspectionFlow.length}`
        : step === "report" && data.hospital
          ? data.hospital
          : null;

  const canGoBackFromHeader = !showIntro && step !== "home";
  const goBackFromHeader = () => {
    if (step === "setup") {
      if (setupWizardStep > 0) {
        setSetupWizardStep((s) => s - 1);
      } else {
        setStep("home");
      }
      return;
    }
    if (step === "inspection") {
      if (inspectionStepIndex > 0) {
        setInspectionStepIndex((i) => i - 1);
      } else {
        setStep("setup");
      }
      window.scrollTo(0, 0);
      return;
    }
    if (step === "report") {
      setStep("inspection");
      window.scrollTo(0, 0);
      return;
    }
    if (step === "history") {
      setStep("setup");
      return;
    }
    if (step === "presentation") {
      setStep("report");
      return;
    }
    setStep("home");
  };

  return (
    <div className="min-h-[100dvh] bg-zinc-50 text-zinc-900 overflow-x-hidden print:bg-white" dir="rtl">
      {!showIntro && step !== "presentation" && (
        <header className="sticky top-0 z-50 border-b border-zinc-200/70 bg-white/95 shadow-[0_1px_0_rgba(0,0,0,0.03)] backdrop-blur-md print:hidden">
          <div className="mx-auto max-w-lg px-3 pt-2.5 sm:max-w-2xl sm:px-4 sm:pt-3">
            <div className="flex items-start justify-between gap-2 sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white shadow-sm sm:h-9 sm:w-9">
                  <ClipboardCheck className="h-4 w-4 sm:h-[1.05rem] sm:w-[1.05rem]" aria-hidden />
                </div>
                <div className="min-w-0 py-0.5">
                  <h1 className="truncate text-[13px] font-bold leading-tight text-zinc-900 sm:text-sm">{headerTitle}</h1>
                  {headerSubtitle ? (
                    <p className="mt-0.5 truncate text-[11px] font-medium text-zinc-500">{headerSubtitle}</p>
                  ) : null}
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-1.5">
                {(step === "inspection" || step === "report") && (
                  <div
                    className="flex rounded-xl bg-zinc-100/90 p-0.5 ring-1 ring-zinc-200/80"
                    role="tablist"
                    aria-label="التبديل بين التقييم والنتائج"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={step === "inspection"}
                      onClick={() => {
                        setHomeMsg(null);
                        setStep("inspection");
                        window.scrollTo(0, 0);
                      }}
                      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors sm:px-3 ${
                        step === "inspection" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"
                      }`}
                    >
                      التقييم
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={step === "report"}
                      onClick={() => {
                        setHomeMsg(null);
                        setStep("report");
                        window.scrollTo(0, 0);
                      }}
                      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors sm:px-3 ${
                        step === "report" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"
                      }`}
                    >
                      النتائج
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-1">
                  {step === "home" && (
                    <button
                      type="button"
                      onClick={() => setStep("history")}
                      className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-800 transition-colors hover:bg-zinc-100 active:bg-zinc-100/90"
                    >
                      <History className="h-3.5 w-3.5" aria-hidden />
                      السجل
                    </button>
                  )}
                  {canGoBackFromHeader && (
                    <button
                      type="button"
                      onClick={goBackFromHeader}
                      className="rounded-xl border border-zinc-200 bg-white p-2 text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 active:bg-zinc-100"
                      aria-label="رجوع"
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                  {step !== "home" && (
                    <div className="relative" ref={headerNavRef}>
                      <button
                        type="button"
                        onClick={() => setHeaderNavOpen((o) => !o)}
                        className={`rounded-xl border p-2 shadow-sm transition-colors ${
                          headerNavOpen
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                        }`}
                        aria-expanded={headerNavOpen}
                        aria-haspopup="menu"
                        aria-label="قائمة التنقل السريع"
                      >
                        <EllipsisVertical className="h-4 w-4" aria-hidden />
                      </button>
                      {headerNavOpen ? (
                        <div
                          role="menu"
                          className="absolute end-0 top-[calc(100%+6px)] z-50 min-w-[11.5rem] overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg ring-1 ring-zinc-950/5 sm:min-w-[12.5rem]"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-right text-[13px] font-medium text-zinc-800 hover:bg-zinc-50"
                            onClick={() => {
                              setHeaderNavOpen(false);
                              setHomeMsg(null);
                              setStep("home");
                              window.scrollTo(0, 0);
                            }}
                          >
                            <LayoutGrid className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
                            الرئيسية
                          </button>
                          {step !== "history" && (
                            <button
                              type="button"
                              role="menuitem"
                              className="flex w-full items-center gap-2 px-3 py-2.5 text-right text-[13px] font-medium text-zinc-800 hover:bg-zinc-50"
                              onClick={() => {
                                setHeaderNavOpen(false);
                                setStep("history");
                                window.scrollTo(0, 0);
                              }}
                            >
                              <History className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
                              السجل
                            </button>
                          )}
                          {step === "report" && (
                            <>
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 px-3 py-2.5 text-right text-[13px] font-medium text-zinc-800 hover:bg-zinc-50"
                                onClick={() => {
                                  setHeaderNavOpen(false);
                                  presDirRef.current = 1;
                                  setStep("presentation");
                                }}
                              >
                                <Presentation className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
                                عرض تفاعلي
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 px-3 py-2.5 text-right text-[13px] font-semibold text-emerald-800 hover:bg-emerald-50/80"
                                onClick={() => {
                                  setHeaderNavOpen(false);
                                  startNewTour();
                                }}
                              >
                                <FilePlus2 className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
                                جولة جديدة
                              </button>
                            </>
                          )}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="h-2 sm:h-2.5" aria-hidden />
          </div>
        </header>
      )}

      <main className="mx-auto max-w-lg px-3 py-4 pb-28 print:max-w-none print:px-0 print:py-0 print:pb-0 sm:max-w-2xl sm:px-4 sm:py-5">
        <AnimatePresence mode="wait">
          {showIntro && (
            <motion.section
              key="intro"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="flex min-h-[86dvh] items-center justify-center px-0 py-2 text-zinc-900 antialiased [text-rendering:optimizeLegibility] sm:py-4"
            >
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="w-full max-w-md overflow-hidden rounded-[1.75rem] border border-zinc-200/90 bg-white shadow-[0_20px_50px_-12px_rgba(0,0,0,0.12)] ring-1 ring-zinc-950/[0.04] sm:max-w-lg"
              >
                <div className="relative bg-gradient-to-b from-zinc-50/90 to-white px-6 pb-2 pt-8 sm:px-10 sm:pt-10">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-zinc-300/80 to-transparent"
                  />
                  <p className="text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    الإدارة التنفيذية للصحة العامة
                  </p>
                  <div className="mt-7 flex justify-center">
                    <img
                      src={MHC_LOGO_PATH}
                      alt="شعار تجمع المدينة المنورة الصحي"
                      className="h-[3.25rem] w-auto max-w-[min(100%,260px)] object-contain drop-shadow-sm sm:h-16"
                      width={404}
                      height={124}
                      loading="eager"
                      decoding="async"
                    />
                  </div>
                  <div className="mt-6 flex justify-center">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-3.5 py-1 text-[12px] font-semibold text-white shadow-sm">
                      <Sparkles className="h-3.5 w-3.5 text-amber-200/95" aria-hidden />
                      جولة تفتيشية
                    </span>
                  </div>
                  <h2 className="mt-6 text-balance text-center text-[1.65rem] font-extrabold leading-[1.2] tracking-tight text-zinc-950 sm:text-[1.85rem]">
                    إنجاز الجولات إلكترونيًا
                  </h2>
                  <p className="mx-auto mt-3 max-w-md text-center text-[14px] leading-relaxed text-zinc-600 sm:text-[15px]">
                    تقارير فورية، ومتابعة إحصائية للإدارة التنفيذية للصحة العامة وأقسامها.
                  </p>
                </div>

                <div className="border-t border-zinc-100 px-4 py-4 sm:px-6">
                  <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl bg-zinc-50/70">
                    <li className="flex gap-3 px-3 py-3.5 sm:px-4">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-zinc-200/80">
                        <ClipboardCheck className="h-4 w-4 text-emerald-700" aria-hidden />
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <p className="text-sm font-semibold text-zinc-900">جولات ميدانية</p>
                        <p className="mt-0.5 text-[13px] leading-relaxed text-zinc-600">خطوات واضحة من البداية حتى الختام.</p>
                      </div>
                    </li>
                    <li className="flex gap-3 px-3 py-3.5 sm:px-4">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-zinc-200/80">
                        <FileText className="h-4 w-4 text-sky-700" aria-hidden />
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <p className="text-sm font-semibold text-zinc-900">تقارير جاهزة</p>
                        <p className="mt-0.5 text-[13px] leading-relaxed text-zinc-600">تصدير ومشاركة بسهولة.</p>
                      </div>
                    </li>
                    <li className="flex gap-3 px-3 py-3.5 sm:px-4">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-zinc-200/80">
                        <BarChart3 className="h-4 w-4 text-violet-700" aria-hidden />
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <p className="text-sm font-semibold text-zinc-900">مؤشرات وإحصاءات</p>
                        <p className="mt-0.5 text-[13px] leading-relaxed text-zinc-600">دعم القرار الإداري.</p>
                      </div>
                    </li>
                  </ul>
                </div>

                <div className="border-t border-zinc-100 bg-zinc-50/40 px-5 pb-6 pt-4 sm:px-8">
                  <button
                    type="button"
                    onClick={() => setShowIntro(false)}
                    className="flex min-h-[3rem] w-full items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-5 text-[15px] font-bold text-white shadow-md shadow-zinc-900/15 transition-[transform,background-color] hover:bg-zinc-800 active:scale-[0.99]"
                  >
                    <LogIn className="h-[1.1rem] w-[1.1rem] shrink-0 opacity-90" aria-hidden />
                    دخول النظام
                  </button>
                </div>
              </motion.div>
            </motion.section>
          )}

          {step === "home" && !showIntro && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
                <h2 className="text-base font-semibold">اختر نموذج الجولة</h2>
                <p className="mt-1 text-[12px] text-zinc-500">اختر النموذج المتاح، وبقية النماذج قريبًا.</p>
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
                    { id: "preventive", label: "الطب الوقائي", action: "open" as const },
                    { id: "env-health", label: "صحة البيئة", action: "soon" as const },
                    { id: "infectious", label: "الامراض المعدية", action: "soon" as const },
                    { id: "occupational-health", label: "الصحة المهنية", action: "soon" as const },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (item.action === "open") {
                          setHomeMsg(null);
                          setStep("setup");
                          return;
                        }
                        setHomeMsg(`${item.label}: قريبا`);
                      }}
                      className="flex min-h-[3rem] items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-right text-sm font-medium text-zinc-800 hover:bg-zinc-100"
                    >
                      <span>{item.label}</span>
                      {item.action === "open" ? (
                        <span className="rounded-md bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold text-white">متاح</span>
                      ) : (
                        <span className="rounded-md bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-700">قريبا</span>
                      )}
                    </button>
                  ))}
                </div>
              </section>
              {homeMsg && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{homeMsg}</p>}
            </motion.div>
          )}

          {step === "history" && (
            <motion.div
              key="history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">السجل</h2>
                <button
                  type="button"
                  onClick={() => {
                    setData(createEmptyInspectionData());
                    setSetupWizardStep(0);
                    setStep("setup");
                  }}
                  className="text-xs font-medium text-zinc-600"
                >
                  + جديدة
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-zinc-200 bg-white p-2.5">
                  <p className="text-[11px] text-zinc-500">إجمالي النماذج</p>
                  <p className="mt-1 text-lg font-bold tabular-nums">{historyStats.count}</p>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-white p-2.5">
                  <p className="text-[11px] text-zinc-500">متوسط الامتثال</p>
                  <p className="mt-1 text-lg font-bold tabular-nums">{historyStats.avg}%</p>
                </div>
              </div>
              {(history as { id: string }[]).length === 0 ? (
                <p className="rounded-xl border border-dashed border-zinc-200 py-12 text-center text-sm text-zinc-500">لا توجد جولات محفوظة</p>
              ) : (
                <ul className="space-y-2">
                  {(history as { id: string; hospital: string; date: string; totalScore: number; inspectors: string[] }[]).map((tour) => (
                    <li key={tour.id} className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white p-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{tour.hospital}</span>
                          <span className="shrink-0 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-700">{tour.totalScore}%</span>
                        </div>
                        <p className="truncate text-[11px] text-zinc-500">{tour.date}</p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const t = tour as Partial<InspectionData> & { id: string; hospital: string; date: string; inspectors: string[] };
                            setData({
                              id: t.id,
                              inspectors: t.inspectors ?? [],
                              hospital: t.hospital ?? "",
                              date: t.date ?? "",
                              day:
                                t.day ??
                                new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(new Date((t.date ?? "") + "T12:00:00")),
                              email: t.email ?? "",
                              baselinePercentage: typeof t.baselinePercentage === "number" ? t.baselinePercentage : null,
                              scores: t.scores ?? {},
                              itemNotes: t.itemNotes ?? {},
                              sectionNotes: t.sectionNotes ?? {},
                              sectionImages: t.sectionImages ?? {},
                              skippedQuestionIds: t.skippedQuestionIds ?? [],
                            });
                            setStep("report");
                          }}
                          className="rounded-lg border border-zinc-200 px-2 py-1.5 text-[11px] font-medium"
                        >
                          عرض
                        </button>
                        <button type="button" onClick={() => deleteFromHistory(tour.id)} className="rounded-lg p-1.5 text-zinc-400 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          )}

          {step === "setup" && (
            <motion.div key="setup" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="mx-auto w-full min-w-0 max-w-full">
                <div className="rounded-2xl border border-zinc-200/90 bg-white px-3 py-2 shadow-sm">
                  <div className="mb-2 flex items-center justify-center gap-2">
                    <span className="text-[10px] font-semibold tracking-wide text-zinc-500">إعداد الجولة</span>
                    <span
                      className="rounded-md bg-zinc-900 px-1.5 py-px text-[10px] font-bold tabular-nums text-white"
                      aria-hidden
                    >
                      {Math.round(((setupWizardStep + 1) / SETUP_STEP_COUNT) * 100)}٪
                    </span>
                  </div>
                  <div
                    className="flex min-w-0 items-start justify-center"
                    role="group"
                    aria-label={`الخطوة ${setupWizardStep + 1} من ${SETUP_STEP_COUNT}`}
                  >
                    {SETUP_WIZARD_STEPS.map((meta, i) => {
                      const done = i < setupWizardStep;
                      const current = i === setupWizardStep;
                      return (
                        <Fragment key={meta.label}>
                          {i > 0 ? (
                            <div
                              className={`mx-0.5 mt-3.5 h-0.5 min-w-[0.5rem] flex-1 max-w-[1.25rem] rounded-full sm:min-w-[0.75rem] sm:max-w-[2.75rem] md:max-w-none ${setupWizardStep >= i ? "bg-zinc-900" : "bg-zinc-200"}`}
                              aria-hidden
                            />
                          ) : null}
                          <div className="flex w-[2.75rem] shrink-0 flex-col items-center gap-1.5 sm:w-[3.75rem] sm:gap-2 md:w-[4.25rem] lg:w-[4.75rem]">
                            <motion.span
                              initial={false}
                              animate={{ scale: current ? 1.04 : 1 }}
                              transition={{ type: "spring", stiffness: 440, damping: 30 }}
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums leading-none transition-colors ${
                                done
                                  ? "bg-zinc-900 text-white shadow-sm"
                                  : current
                                    ? "border-2 border-zinc-900 bg-white text-zinc-900"
                                    : "border border-zinc-200 bg-zinc-50 text-zinc-400"
                              }`}
                            >
                              {done ? <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} /> : i + 1}
                            </motion.span>
                            <span
                              className={`text-center text-[9px] font-semibold leading-snug ${
                                current ? "text-zinc-900" : done ? "text-zinc-600" : "text-zinc-400"
                              }`}
                            >
                              {meta.label}
                            </span>
                          </div>
                        </Fragment>
                      );
                    })}
                  </div>
                  <div
                    className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-100"
                    role="progressbar"
                    aria-valuenow={setupWizardStep + 1}
                    aria-valuemin={1}
                    aria-valuemax={SETUP_STEP_COUNT}
                    aria-valuetext={`${setupWizardStep + 1} من ${SETUP_STEP_COUNT}`}
                  >
                    <motion.div
                      className="h-full rounded-full bg-zinc-900"
                      initial={false}
                      animate={{ width: `${((setupWizardStep + 1) / SETUP_STEP_COUNT) * 100}%` }}
                      transition={{ type: "spring", stiffness: 320, damping: 32 }}
                    />
                  </div>
                </div>
              </div>

              {setupWizardStep === 0 && (
                <section className="rounded-xl border border-zinc-200 bg-white p-4">
                  <h2 className="mb-1 text-sm font-semibold">فريق الجولة</h2>
                  <p className="mb-3 text-[11px] text-zinc-500">اختر أعضاء الفريق المشاركين في هذه الزيارة</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {INSPECTORS.map((inspector) => {
                      const on = data.inspectors.includes(inspector.name);
                      return (
                        <button
                          key={inspector.id}
                          type="button"
                          onClick={() =>
                            setData((prev) => ({
                              ...prev,
                              inspectors: on ? prev.inspectors.filter((n) => n !== inspector.name) : [...prev.inspectors, inspector.name],
                            }))
                          }
                          className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                            on
                              ? "border-2 border-zinc-900 bg-zinc-50 text-zinc-900"
                              : "border border-zinc-200 bg-white text-zinc-800"
                          }`}
                        >
                          <span>{inspector.name}</span>
                          {on ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-zinc-900" />
                          ) : (
                            <span className="h-4 w-4 shrink-0 rounded-full border border-zinc-300 bg-white" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {setupWizardStep === 1 && (
                <section className="rounded-xl border border-zinc-200 bg-white p-4">
                  <h2 className="mb-1 text-sm font-semibold">المنشأة</h2>
                  <p className="mb-4 text-[11px] text-zinc-500">حدد موقع الزيارة</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {HOSPITALS.map((h) => {
                      const on = data.hospital === h;
                      return (
                        <button
                          key={h}
                          type="button"
                          onClick={() => setData((prev) => ({ ...prev, hospital: h }))}
                          className={`flex min-h-[2.75rem] items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                            on ? "border-2 border-zinc-900 bg-zinc-50 text-zinc-900" : "border border-zinc-200 bg-white text-zinc-800"
                          }`}
                        >
                          <span className="leading-snug">{h}</span>
                          {on ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-zinc-900" />
                          ) : (
                            <span className="h-4 w-4 shrink-0 rounded-full border border-zinc-300 bg-white" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {setupWizardStep === 2 && (
                <section className="rounded-xl border border-zinc-200 bg-white p-4">
                  <h2 className="mb-1 text-sm font-semibold">البريد الإلكتروني (اختياري)</h2>
                  <p className="mb-4 text-[11px] leading-relaxed text-zinc-500">
                    يُحفظ العنوان مع الجولة ويظهر في صفحة التقرير.{" "}
                    <span className="font-semibold text-zinc-700">
                      التطبيق لا يرسل بريداً تلقائياً ولا يُرفق ملف PowerPoint.
                    </span>{" "}
                    لإرسال التقرير بالبريد: بعد الانتهاء استخدم «PowerPoint» للتنزيل، ثم أرفق الملف يدوياً من مجلد التنزيلات. يمكنك أيضاً فتح مسودة بريد بنص ملخّص من صفحة التقرير (بدون مرفق).
                  </p>
                  <label className="block max-w-md">
                    <span className="mb-1 block text-[11px] font-semibold text-zinc-600">عنوان البريد (اختياري)</span>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                      <input
                        type="email"
                        dir="ltr"
                        value={data.email ?? ""}
                        onChange={(e) => setData((prev) => ({ ...prev, email: e.target.value.trim() }))}
                        placeholder="name@example.com"
                        className="w-full rounded-lg border border-zinc-200 bg-white py-2 pr-8 pl-2 text-xs outline-none focus:border-zinc-900"
                      />
                    </div>
                  </label>
                </section>
              )}

              {setupWizardStep === 3 && (
                <section className="rounded-xl border border-zinc-200 bg-white p-4">
                  <h2 className="mb-1 text-sm font-semibold">التاريخ</h2>
                  <p className="mb-4 text-[11px] text-zinc-500">اختر يوم الزيارة</p>
                  <div
                    ref={setupDateStripScrollRef}
                    className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]"
                  >
                    {setupDateStrip.map(({ iso, weekday, dayMonth }) => {
                      const on = data.date === iso;
                      const isToday = iso === todayLocalISO();
                      return (
                        <button
                          key={iso}
                          type="button"
                          data-date-iso={iso}
                          onClick={() =>
                            setData((prev) => ({
                              ...prev,
                              date: iso,
                              day: new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(new Date(iso + "T12:00:00")),
                            }))
                          }
                          className={`relative snap-start shrink-0 rounded-xl border px-3 py-2.5 text-center transition-colors ${
                            on
                              ? "border-2 border-zinc-900 bg-zinc-50 text-zinc-900"
                              : "border border-zinc-200 bg-white text-zinc-800"
                          }`}
                        >
                          {isToday ? (
                            <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 rounded bg-zinc-900 px-1.5 py-px text-[8px] font-bold text-white">
                              اليوم
                            </span>
                          ) : null}
                          <span className={`block text-[10px] font-medium ${on ? "text-zinc-600" : "text-zinc-500"}`}>{weekday}</span>
                          <span className="mt-0.5 block text-sm font-semibold tabular-nums">{dayMonth}</span>
                        </button>
                      );
                    })}
                  </div>
                  {data.date ? (
                    <p className="mt-3 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-center text-xs text-zinc-600">{data.day}</p>
                  ) : null}
                </section>
              )}

              {setupWizardStep === 4 && (
                <section className="rounded-xl border border-zinc-200 bg-white p-4">
                  <h2 className="mb-1 text-sm font-semibold">بنود التقييم</h2>
                  <p className="mb-3 text-[11px] text-zinc-500">ألغِ تحديد ما لا يخص هذه الزيارة</p>
                  <div className="space-y-3">
                    {SECTIONS.map((section) => {
                      const skipped = new Set(data.skippedQuestionIds ?? []);
                      return (
                        <div key={section.id} className="rounded-lg border border-zinc-100 bg-zinc-50/50 p-3">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-zinc-800">{section.title}</span>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => setSectionQuestionsIncluded(section.id, true)}
                                className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] font-medium"
                              >
                                الكل
                              </button>
                              <button
                                type="button"
                                onClick={() => setSectionQuestionsIncluded(section.id, false)}
                                className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[10px] font-medium"
                              >
                                لا شيء
                              </button>
                            </div>
                          </div>
                          <ul className="space-y-1.5">
                            {section.questions.map((q) => {
                              const included = !skipped.has(q.id);
                              return (
                                <li key={q.id}>
                                  <button
                                    type="button"
                                    onClick={() => toggleQuestionInTour(q.id)}
                                    className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[13px] leading-snug hover:bg-white"
                                  >
                                    <span
                                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                        included ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white"
                                      }`}
                                    >
                                      {included ? <CheckCircle2 className="h-3 w-3" /> : null}
                                    </span>
                                    <span className={included ? "text-zinc-900" : "text-zinc-400 line-through"}>{q.text}</span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-[11px] text-zinc-500">ملاحظات البنود أثناء الجولة اختيارية.</p>
                </section>
              )}
            </motion.div>
          )}

          {step === "inspection" && flowStep && (
            <motion.div key="inspection" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
                <p className="text-sm font-medium text-zinc-600">
                  <span className="tabular-nums font-semibold text-zinc-800">{inspectionProgressPct}%</span>
                  <span className="mx-1.5 text-zinc-400">·</span>
                  <span className="tabular-nums">
                    {inspectionStepIndex + 1} من {inspectionFlow.length}
                  </span>
                </p>
                <h2 className="mt-2 text-lg font-bold leading-snug text-zinc-900 sm:text-xl">{flowStep.sectionTitle}</h2>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full bg-zinc-900 transition-all duration-300 ease-out"
                    style={{ width: `${inspectionProgressPct}%` }}
                  />
                </div>
                <p className="mt-3 text-xs text-zinc-500">
                  الأقسام المكتملة: <span className="font-semibold text-zinc-800">{completedSectionCount}</span> من{" "}
                  <span className="font-semibold text-zinc-800">{activeSectionSummaries.length}</span>
                </p>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-zinc-700">اختر القسم</h3>
                  {currentSectionIndex >= 0 ? (
                    <span className="text-[11px] text-zinc-500">
                      الحالي: {currentSectionIndex + 1}/{activeSections.length}
                    </span>
                  ) : null}
                </div>
                <select
                  value={flowStep?.sectionId ?? ""}
                  onChange={(e) => {
                    const selected = activeSectionSummaries.find((row) => row.section.id === e.target.value);
                    if (!selected || selected.firstStepIndex < 0) return;
                    setInspectionStepIndex(selected.firstStepIndex);
                    window.scrollTo(0, 0);
                  }}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 outline-none focus:border-zinc-900"
                >
                  {activeSectionSummaries.map((row) => (
                    <option key={row.section.id} value={row.section.id}>
                      {row.section.title} — {row.answered}/{row.total}
                      {row.complete ? " (مكتمل)" : ""}
                    </option>
                  ))}
                </select>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {activeSectionSummaries.map((row) => (
                    <div
                      key={row.section.id}
                      className={`rounded-lg border px-2 py-1.5 text-[11px] ${
                        flowStep?.sectionId === row.section.id
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : row.complete
                            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                            : "border-zinc-200 bg-zinc-50 text-zinc-700"
                      }`}
                    >
                      <p className="line-clamp-1 font-semibold">{row.section.title}</p>
                      <p className="mt-0.5 tabular-nums">
                        {row.answered}/{row.total}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={inspectionStepIndex}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.18 }}
                  className="min-h-[48dvh]"
                >
                  {flowStep.kind === "question" ? (
                    <div className="flex min-h-[48dvh] flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:min-h-[52dvh] sm:p-9">
                      <p className="text-pretty text-2xl font-semibold leading-[1.45] text-zinc-900 sm:text-3xl sm:leading-[1.4]">
                        {flowStep.question.text}
                      </p>
                      <p className="mt-4 text-sm text-zinc-500">اختر الإجابة</p>
                      <div className="mt-3 grid grid-cols-3 gap-3 sm:max-w-xl sm:gap-4">
                        {(
                          [
                            { val: "yes" as const, label: "نعم" },
                            { val: "no" as const, label: "لا" },
                            { val: "na" as const, label: "N/A" },
                          ] as const
                        ).map((opt) => {
                          const selected = data.scores[flowStep.question.id] === opt.val;
                          const lane =
                            opt.val === "yes"
                              ? selected
                                ? "border-emerald-700 bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-400/50 ring-offset-2 ring-offset-white"
                                : "border-emerald-200 bg-emerald-50 text-emerald-900 hover:border-emerald-300 hover:bg-emerald-100/90"
                              : opt.val === "no"
                                ? selected
                                  ? "border-red-700 bg-red-600 text-white shadow-sm ring-2 ring-red-400/50 ring-offset-2 ring-offset-white"
                                  : "border-red-200 bg-red-50 text-red-900 hover:border-red-300 hover:bg-red-100/90"
                                : selected
                                  ? "border-blue-700 bg-blue-600 text-white shadow-sm ring-2 ring-blue-400/50 ring-offset-2 ring-offset-white"
                                  : "border-blue-200 bg-blue-50 text-blue-900 hover:border-blue-300 hover:bg-blue-100/90";
                          return (
                            <button
                              key={opt.val}
                              type="button"
                              onClick={() =>
                                setData((prev) => ({
                                  ...prev,
                                  scores: { ...prev.scores, [flowStep.question.id]: opt.val },
                                }))
                              }
                              className={`min-h-[52px] rounded-2xl border-2 px-3 py-3 text-base font-bold transition-[transform,box-shadow,background-color] active:scale-[0.98] sm:min-h-14 sm:text-lg ${lane}`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                      <label className="mt-8 block text-sm font-semibold text-zinc-700">ملاحظة (اختياري)</label>
                      <textarea
                        placeholder="اكتب أي ملاحظة تخص هذا البند…"
                        value={data.itemNotes[flowStep.question.id] || ""}
                        onChange={(e) =>
                          setData((prev) => ({
                            ...prev,
                            itemNotes: { ...prev.itemNotes, [flowStep.question.id]: e.target.value },
                          }))
                        }
                        className="mt-2 min-h-[100px] w-full resize-y rounded-2xl border-2 border-zinc-200 bg-zinc-50/50 px-4 py-3 text-base leading-relaxed outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-900 focus:bg-white focus:ring-4 focus:ring-zinc-900/10"
                      />
                    </div>
                  ) : (
                    <div className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6">
                      <h3 className="text-sm font-semibold text-zinc-800">ملاحظات وصور القسم</h3>
                      <p className="mt-1 text-[11px] text-zinc-500">قبل الانتقال للقسم التالي، يمكنك توثيق الملاحظات العامة.</p>
                      <textarea
                        value={data.sectionNotes[flowStep.sectionId] || ""}
                        onChange={(e) =>
                          setData((prev) => ({
                            ...prev,
                            sectionNotes: { ...prev.sectionNotes, [flowStep.sectionId]: e.target.value },
                          }))
                        }
                        className="mt-4 min-h-[100px] w-full resize-none rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900/10"
                        placeholder="ملاحظة ختامية للقسم…"
                      />
                      <div className="mt-4 flex items-center justify-between">
                        <span className="text-xs text-zinc-500">صور</span>
                        <label className="cursor-pointer rounded-lg border border-zinc-200 px-3 py-1.5 text-[11px] font-medium">
                          <Plus className="mr-1 inline h-3 w-3" />
                          إضافة
                          <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, flowStep.sectionId)} />
                        </label>
                      </div>
                      {(data.sectionImages[flowStep.sectionId] || []).length > 0 && (
                        <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                          {(data.sectionImages[flowStep.sectionId] || []).map((img, i) => (
                            <div key={i} className="relative aspect-square overflow-hidden rounded-md border border-zinc-100">
                              <img src={img} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                              <button
                                type="button"
                                onClick={() => {
                                  const current = [...(data.sectionImages[flowStep.sectionId] || [])];
                                  current.splice(i, 1);
                                  setData((prev) => ({
                                    ...prev,
                                    sectionImages: { ...prev.sectionImages, [flowStep.sectionId]: current },
                                  }));
                                }}
                                className="absolute right-0.5 top-0.5 rounded bg-red-600 p-0.5 text-white"
                              >
                                <XCircle className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          )}

          {step === "report" && (
            <motion.div key="report" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4 pb-8">
              <div className="flex flex-col gap-2 print:hidden sm:flex-row sm:flex-wrap sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    presDirRef.current = 1;
                    setStep("presentation");
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold shadow-sm"
                >
                  <Presentation className="h-3.5 w-3.5" />
                  عرض تفاعلي
                </button>
                <button
                  type="button"
                  disabled={exportBusy !== null}
                  onClick={runDownloadPptx}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  <Download className="h-3.5 w-3.5" />
                  {exportBusy === "pptx" ? "…" : "PowerPoint"}
                </button>
                <button
                  type="button"
                  disabled={exportBusy !== null}
                  onClick={downloadReport}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold"
                >
                  <Download className="h-3.5 w-3.5" />
                  {exportBusy === "pdf" ? "…" : "PDF"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExportMsg(null);
                    printInspectionReport();
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900"
                >
                  <Printer className="h-3.5 w-3.5" />
                  طباعة / PDF
                </button>
              </div>
              {exportMsg && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 print:hidden">{exportMsg}</p>
              )}

              <div ref={reportRef} className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-8" id="official-report">
                <div data-pdf-chunk className="mb-6 flex flex-col gap-4 border-b border-zinc-100 pb-6 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                    <img
                      src={MHC_LOGO_PATH}
                      alt=""
                      className="h-10 w-auto shrink-0 object-contain object-right sm:h-12"
                      width={404}
                      height={124}
                    />
                    <div>
                      <h2 className="text-lg font-bold sm:text-xl">تقرير جولة تفتيشية</h2>
                      <p className="text-xs text-zinc-500">تجمع المدينة المنورة الصحي — الإدارة التنفيذية للطب الوقائي</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-600">
                        <span className="rounded-md bg-zinc-100 px-2 py-1">{data.hospital}</span>
                        <span className="rounded-md bg-zinc-100 px-2 py-1">{data.date}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-3xl font-bold tabular-nums">{totalScoreInfo.percentage}%</p>
                    <p className="text-[11px] text-zinc-500">نسبة الامتثال</p>
                  </div>
                </div>

                <div data-pdf-chunk className="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {activeSections.map((s) => {
                    const { earned, total, percentage } = calculateSectionMetrics(s.id, data);
                    return (
                      <div key={s.id} className="rounded-lg border border-zinc-100 bg-zinc-50/80 p-3">
                        <p className="line-clamp-2 text-[10px] font-semibold text-zinc-500">{s.title}</p>
                        <p className="mt-1 text-lg font-bold tabular-nums">
                          {earned}/{total}
                          <span className="mr-1 text-xs font-normal text-zinc-500">{percentage}%</span>
                        </p>
                      </div>
                    );
                  })}
                </div>

                {data.email ? (
                  <div data-pdf-chunk className="mb-8">
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 sm:max-w-md">
                      <p className="text-[11px] text-zinc-600">البريد المرتبط بهذه الجولة</p>
                      <p className="mt-1 text-sm font-semibold text-zinc-900" dir="ltr">
                        {data.email}
                      </p>
                      <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
                        «فتح البريد» يُنشئ رسالة نصية فقط (لا مرفقات). لإرسال PowerPoint: نزّل الملف أعلاه ثم أرفقه من تطبيق البريد.
                      </p>
                      <a
                        href={`mailto:${data.email}?subject=${encodeURIComponent(`تقرير جولة تفتيشية - ${data.hospital}`)}&body=${encodeURIComponent(
                          `نتيجة الجولة الحالية: ${totalScoreInfo.percentage}%\nالتاريخ: ${data.date}\nالمنشأة: ${data.hospital}\n\n(أرفق ملف PowerPoint بعد تنزيله من التطبيق)`,
                        )}`}
                        className="mt-2 inline-flex rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700"
                      >
                        فتح البريد (ملخص نصي)
                      </a>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-10">
                  {activeSections.map((section) => {
                    const { earned, total, percentage } = calculateSectionMetrics(section.id, data);
                    return (
                      <div key={section.id} data-pdf-chunk>
                        <div className="mb-4 flex flex-col gap-3 border-b border-zinc-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                          <h3 className="text-lg font-bold leading-snug sm:text-xl">{section.title}</h3>
                          <div className="flex shrink-0 items-baseline gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 sm:min-w-[9rem] sm:flex-col sm:items-end sm:py-3.5">
                            <p className="text-xs font-medium text-zinc-500">نتيجة القسم</p>
                            <p className="text-2xl font-bold tabular-nums text-zinc-900 sm:text-3xl">
                              {earned}/{total}
                              <span className="mr-2 text-base font-semibold text-zinc-600 sm:text-lg">
                                ({percentage}%)
                              </span>
                            </p>
                          </div>
                        </div>
                        <div className="overflow-x-auto rounded-lg border border-zinc-100">
                          <table className="w-full min-w-[520px] text-sm">
                            <thead>
                              <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-[10px] font-semibold uppercase text-zinc-500">
                                <th className="p-3 text-right">البند</th>
                                <th className="w-20 p-3 text-center">التقييم</th>
                                <th className="p-3 text-right">ملاحظات</th>
                              </tr>
                            </thead>
                            <tbody>
                              {section.questions.map((q) => (
                                <tr key={q.id} className="border-b border-zinc-50">
                                  <td className="p-3 text-zinc-800">{q.text}</td>
                                  <td className="p-3 text-center">
                                    <span
                                      className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                                        data.scores[q.id] === "yes"
                                          ? "bg-emerald-100 text-emerald-800"
                                          : data.scores[q.id] === "no"
                                            ? "bg-red-100 text-red-800"
                                            : "bg-zinc-100 text-zinc-700"
                                      }`}
                                    >
                                      {scoreLabel(q.id)}
                                    </span>
                                  </td>
                                  <td className="p-3 text-xs text-zinc-500">{data.itemNotes[q.id] || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {data.sectionNotes[section.id] && (
                          <p className="mt-3 rounded-lg bg-amber-50/80 p-3 text-sm text-amber-950">{data.sectionNotes[section.id]}</p>
                        )}
                        {data.sectionImages[section.id]?.length ? (
                          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {data.sectionImages[section.id]!.map((img, i) => (
                              <div key={i} className="aspect-video overflow-hidden rounded-md border border-zinc-100">
                                <img src={img} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <footer data-pdf-chunk className="mt-10 border-t border-zinc-100 pt-4 text-center text-[11px] text-zinc-500">
                  تجمع المدينة المنورة الصحي — 1447 هـ · متابعة جاهزية المرافق الصحية
                </footer>
              </div>
            </motion.div>
          )}

          {step === "presentation" && (
            <motion.div
              key="presentation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="fixed inset-0 z-[100] flex flex-col bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-white"
              dir="rtl"
            >
              <div className="h-1 w-full shrink-0 bg-white/10">
                <motion.div
                  className="h-full bg-gradient-to-l from-indigo-400 to-violet-500"
                  initial={false}
                  animate={{ width: `${((presIndex + 1) / Math.max(1, presTotal)) * 100}%` }}
                  transition={{ type: "spring", stiffness: 380, damping: 38 }}
                />
              </div>

              <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                <button type="button" onClick={() => setStep("report")} className="rounded-lg px-2 py-1.5 text-xs text-white/80">
                  إغلاق
                </button>
                <div className="text-center">
                  <span className="text-[11px] tabular-nums text-white/60">
                    {presIndex + 1} / {presTotal}
                  </span>
                  <p className="text-[10px] text-white/30">مسافة أو ↓ للتالي · ↑ للسابق</p>
                </div>
              </div>

              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-24 pt-4">
                <AnimatePresence mode="wait" custom={presDirRef.current}>
                  <motion.div
                    key={presIndex}
                    custom={presDirRef.current}
                    variants={PRES_VARIANTS}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ type: "spring", damping: 30, stiffness: 320 }}
                    className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center"
                  >
                    {presIndex === 0 && (
                      <div className="text-center">
                        <div className="mx-auto mb-6 inline-block rounded-2xl bg-white px-6 py-3 shadow-lg ring-1 ring-white/20">
                          <img
                            src={MHC_LOGO_PATH}
                            alt=""
                            className="mx-auto h-14 w-auto max-w-[min(100%,260px)] object-contain"
                            width={404}
                            height={124}
                          />
                        </div>
                        <h1 className="text-2xl font-bold leading-snug sm:text-3xl">{data.hospital}</h1>
                        <p className="mt-2 text-sm text-white/50">{data.date}</p>
                        <p className="mt-8 text-5xl font-bold tabular-nums sm:text-6xl">{totalScoreInfo.percentage}%</p>
                        <p className="mt-1 text-xs text-white/40">الامتثال الكلي</p>
                      </div>
                    )}

                    {presIndex > 0 && presIndex <= questionSlides.length &&
                      (() => {
                        const item = questionSlides[presIndex - 1];
                        if (!item) return null;
                        const ans = data.scores[item.question.id];
                        return (
                          <div className="w-full">
                            <div className="mb-4 flex items-center justify-between gap-2">
                              <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold text-indigo-200">
                                {item.sectionTitle}
                              </span>
                              <span className="text-[10px] tabular-nums text-white/35">
                                {item.globalIndex} / {item.totalQuestions}
                              </span>
                            </div>
                            <p className="text-balance text-xl font-semibold leading-relaxed sm:text-2xl">{item.question.text}</p>
                            <div className="mt-8 flex flex-wrap items-center gap-3">
                              <span
                                className={`inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-bold shadow-lg ${
                                  ans === "yes"
                                    ? "bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-400/40"
                                    : ans === "no"
                                      ? "bg-red-500/25 text-red-200 ring-1 ring-red-400/40"
                                      : "bg-white/10 text-white/75 ring-1 ring-white/15"
                                }`}
                              >
                                {scoreLabel(item.question.id)}
                              </span>
                            </div>
                            {data.itemNotes[item.question.id]?.trim() ? (
                              <p className="mt-8 border-t border-white/10 pt-5 text-sm leading-relaxed text-white/55">
                                {data.itemNotes[item.question.id]}
                              </p>
                            ) : null}
                          </div>
                        );
                      })()}

                    {presIndex === presTotal - 1 && presTotal > 1 && (
                      <div className="text-center">
                        <p className="text-3xl font-bold sm:text-4xl">شكراً لكم</p>
                        <p className="mt-3 text-sm text-white/45">الإدارة التنفيذية للطب الوقائي</p>
                        <p className="mt-8 text-4xl font-bold tabular-nums text-white/25">{totalScoreInfo.percentage}%</p>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="fixed bottom-0 left-0 right-0 z-40 flex gap-2 border-t border-white/10 bg-zinc-950/95 px-3 py-3 backdrop-blur-md pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  disabled={presIndex <= 0}
                  onClick={() => {
                    presDirRef.current = -1;
                    setPresIndex((i) => Math.max(0, i - 1));
                  }}
                  className="flex min-h-12 flex-1 items-center justify-center rounded-xl border border-white/20 bg-transparent py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35"
                >
                  السابق
                </button>
                <button
                  type="button"
                  disabled={presIndex >= presTotal - 1}
                  onClick={() => {
                    presDirRef.current = 1;
                    setPresIndex((i) => Math.min(presTotal - 1, i + 1));
                  }}
                  className="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-white py-3 text-sm font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:bg-white/40 disabled:text-zinc-600"
                >
                  التالي
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>

      {!showIntro && step === "setup" && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-200 bg-white pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] print:hidden">
          <div className="mx-auto flex max-w-lg gap-2 px-3 sm:max-w-2xl sm:px-4">
            {setupWizardStep > 0 ? (
              <button
                type="button"
                onClick={() => setSetupWizardStep((s) => s - 1)}
                className="flex min-h-12 shrink-0 items-center justify-center gap-1 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 active:bg-zinc-50"
              >
                <ChevronRight className="h-4 w-4" />
                السابق
              </button>
            ) : null}
            {setupWizardStep < 4 ? (
              <button
                type="button"
                disabled={!canSetupNext}
                onClick={() => setSetupWizardStep((s) => s + 1)}
                className="flex min-h-12 flex-1 items-center justify-center gap-1 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                التالي
                <ChevronLeft className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={!canStart}
                onClick={() => {
                  setInspectionStepIndex(0);
                  setData((p) => ({ ...p, id: undefined }));
                  setStep("inspection");
                }}
                className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                بدء الجولة
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {!showIntro && step === "inspection" && flowStep && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-200 bg-white pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] print:hidden">
          <div className="mx-auto flex max-w-lg gap-2 px-3 sm:max-w-2xl sm:px-4">
            <button
              type="button"
              onClick={() => {
                if (inspectionStepIndex > 0) {
                  setInspectionStepIndex((p) => p - 1);
                  window.scrollTo(0, 0);
                } else setStep("setup");
              }}
              className="flex min-h-12 shrink-0 items-center justify-center gap-1 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-800 active:bg-zinc-50"
            >
              <ChevronRight className="h-4 w-4 shrink-0" />
              رجوع
            </button>
            <button
              type="button"
              disabled={!canProceedStep}
              onClick={() => {
                if (finishInspection) {
                  setStep("report");
                  window.scrollTo(0, 0);
                  return;
                }
                setInspectionStepIndex((p) => Math.min(p + 1, inspectionFlow.length - 1));
                window.scrollTo(0, 0);
              }}
              className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {finishInspection ? "النتائج" : "متابعة"}
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
          {flowStep.kind === "question" && !canProceedStep && (
            <p className="mx-auto mt-2 max-w-lg px-3 text-center text-sm font-medium text-red-600 sm:max-w-2xl sm:px-4">
              اختر نعم أو لا أو N/A للمتابعة
            </p>
          )}
        </div>
      )}
    </div>
  );
}

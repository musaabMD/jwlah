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
  ArrowRight,
  TrendingUp,
  Presentation,
  History,
  Trash2,
} from "lucide-react";
import { INSPECTORS, HOSPITALS, SECTIONS } from "./constants";
import { InspectionData, ScoreValue } from "./types";
import {
  calculateGlobalMetrics,
  calculateSectionMetrics,
  countActiveQuestions,
  flattenQuestionSlides,
  getActiveSections,
  buildInspectionFlow,
  isFlowStepComplete,
  safeExportBase,
} from "./inspection-utils";
import { MHC_LOGO_PATH } from "./branding";
import { downloadInspectionPptx } from "./export-pptx";
import { downloadInspectionReportPdf } from "./pdf-export";

const SETUP_STEP_COUNT = 3;

const SETUP_WIZARD_STEPS = [
  { label: "الفريق" },
  { label: "المنشأة" },
  { label: "البنود" },
] as const;

/** Dates shown as tappable chips (no native date picker / dropdown). */
function buildSetupDateStrip(): { iso: string; weekday: string; dayMonth: string }[] {
  const rows: { iso: string; weekday: string; dayMonth: string }[] = [];
  const base = new Date();
  base.setHours(12, 0, 0, 0);
  for (let delta = -7; delta <= 60; delta++) {
    const d = new Date(base);
    d.setDate(base.getDate() + delta);
    const iso = d.toISOString().split("T")[0];
    const weekday = new Intl.DateTimeFormat("ar-SA", { weekday: "short" }).format(d);
    const dayMonth = new Intl.DateTimeFormat("ar-SA", { day: "numeric", month: "short" }).format(d);
    rows.push({ iso, weekday, dayMonth });
  }
  return rows;
}

export default function App() {
  const [step, setStep] = useState<"setup" | "inspection" | "report" | "presentation" | "history">("setup");
  const [inspectionStepIndex, setInspectionStepIndex] = useState(0);
  const [presIndex, setPresIndex] = useState(0);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState<"pdf" | "pptx" | null>(null);
  /** معالج الإعداد: 0 فريق، 1 منشأة وتاريخ، 2 بنود ثم بدء الجولة */
  const [setupWizardStep, setSetupWizardStep] = useState(0);

  const [history, setHistory] = useState<unknown[]>(() => {
    const saved = localStorage.getItem("tour_history");
    return saved ? JSON.parse(saved) : [];
  });

  const [data, setData] = useState<InspectionData>({
    inspectors: [],
    hospital: "",
    date: new Date().toISOString().split("T")[0],
    day: new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(new Date()),
    scores: {},
    itemNotes: {},
    sectionNotes: {},
    sectionImages: {},
    skippedQuestionIds: [],
  });

  const reportRef = useRef<HTMLDivElement>(null);

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
      setExportMsg("تعذر إنشاء ملف PDF. جرّب متصفحاً آخر أو عطّل حظر التنزيلات.");
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
        ? Boolean(data.hospital && data.date)
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

  return (
    <div className="min-h-[100dvh] bg-zinc-50 text-zinc-900 overflow-x-hidden" dir="rtl">
      <header className="sticky top-0 z-50 border-b border-zinc-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-2 px-3 py-2.5 sm:max-w-2xl sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white">
              <ClipboardCheck className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold leading-tight">الطب الوقائي — جولة 1447هـ</h1>
              {data.inspectors.length > 0 && (
                <p className="truncate text-[11px] text-zinc-500">{data.inspectors.join(" · ")}</p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {(step === "setup" || step === "history") && (
              <button
                type="button"
                onClick={() => setStep(step === "history" ? "setup" : "history")}
                className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-700 active:bg-zinc-100"
                aria-label={step === "history" ? "جولة جديدة" : "السجل"}
              >
                {step === "history" ? <ClipboardCheck className="h-4 w-4" /> : <History className="h-4 w-4" />}
              </button>
            )}
            {(step === "inspection" || step === "report") && (
              <button
                type="button"
                onClick={() => setStep(step === "report" ? "inspection" : "report")}
                className="flex items-center gap-1 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[11px] font-semibold text-white active:bg-zinc-800"
              >
                {step === "report" ? <ArrowRight className="h-3.5 w-3.5 rotate-180" /> : <TrendingUp className="h-3.5 w-3.5" />}
                {step === "report" ? "التقييم" : "النتائج"}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-3 py-4 pb-28 sm:max-w-2xl sm:px-4 sm:py-5">
        <AnimatePresence mode="wait">
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
                    setData({
                      inspectors: [],
                      hospital: "",
                      date: new Date().toISOString().split("T")[0],
                      day: new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(new Date()),
                      scores: {},
                      itemNotes: {},
                      sectionNotes: {},
                      sectionImages: {},
                      skippedQuestionIds: [],
                    });
                    setSetupWizardStep(0);
                    setStep("setup");
                  }}
                  className="text-xs font-medium text-zinc-600"
                >
                  + جديدة
                </button>
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
              <div className="mx-auto w-full max-w-xs">
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
                    className="flex items-start justify-center"
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
                              className={`mx-0.5 mt-3.5 h-0.5 min-w-[0.75rem] flex-1 max-w-[2.75rem] rounded-full sm:max-w-none ${setupWizardStep >= i ? "bg-zinc-900" : "bg-zinc-200"}`}
                              aria-hidden
                            />
                          ) : null}
                          <div className="flex w-[4.25rem] shrink-0 flex-col items-center gap-2 sm:w-[4.75rem]">
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
                  <h2 className="mb-1 text-sm font-semibold">المنشأة والتاريخ</h2>
                  <p className="mb-4 text-[11px] text-zinc-500">حدد موقع الزيارة والتاريخ</p>

                  <p className="mb-2 text-[11px] font-medium text-zinc-600">المنشأة</p>
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

                  <p className="mb-2 mt-5 text-[11px] font-medium text-zinc-600">التاريخ</p>
                  <p className="mb-2 text-[10px] text-zinc-400">مرّر أفقياً واضغط اليوم — دون قوائم منسدلة</p>
                  <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
                    {setupDateStrip.map(({ iso, weekday, dayMonth }) => {
                      const on = data.date === iso;
                      return (
                        <button
                          key={iso}
                          type="button"
                          onClick={() =>
                            setData((prev) => ({
                              ...prev,
                              date: iso,
                              day: new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(new Date(iso + "T12:00:00")),
                            }))
                          }
                          className={`snap-start shrink-0 rounded-xl border px-3 py-2.5 text-center transition-colors ${
                            on
                              ? "border-2 border-zinc-900 bg-zinc-50 text-zinc-900"
                              : "border border-zinc-200 bg-white text-zinc-800"
                          }`}
                        >
                          <span className="block text-[10px] font-medium text-zinc-500">{weekday}</span>
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

              {setupWizardStep === 2 && (
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
                        ).map((opt) => (
                          <button
                            key={opt.val}
                            type="button"
                            onClick={() =>
                              setData((prev) => ({
                                ...prev,
                                scores: { ...prev.scores, [flowStep.question.id]: opt.val },
                              }))
                            }
                            className={`min-h-[52px] rounded-2xl px-3 py-3 text-base font-bold shadow-sm transition-[transform,box-shadow] active:scale-[0.98] sm:min-h-14 sm:text-lg ${
                              data.scores[flowStep.question.id] === opt.val
                                ? "bg-zinc-900 text-white ring-2 ring-zinc-900 ring-offset-2"
                                : "border-2 border-zinc-200 bg-zinc-50 text-zinc-800 hover:border-zinc-300 hover:bg-white"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
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
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                <button
                  type="button"
                  onClick={() => setStep("presentation")}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold"
                >
                  <Presentation className="h-3.5 w-3.5" />
                  عرض
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
              </div>
              {exportMsg && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{exportMsg}</p>}

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
              className="fixed inset-0 z-[100] flex flex-col bg-zinc-950 text-white"
              dir="rtl"
            >
              <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                <button type="button" onClick={() => setStep("report")} className="rounded-lg px-2 py-1.5 text-xs text-white/80">
                  إغلاق
                </button>
                <span className="text-[11px] tabular-nums text-white/50">
                  {presIndex + 1} / {presTotal}
                </span>
              </div>

              <div className="flex flex-1 flex-col justify-center px-4 pb-20 pt-6">
                {presIndex === 0 && (
                  <div className="mx-auto max-w-lg text-center">
                    <img
                      src={MHC_LOGO_PATH}
                      alt=""
                      className="mx-auto mb-6 h-14 w-auto max-w-[min(100%,280px)] object-contain brightness-0 invert"
                      width={404}
                      height={124}
                    />
                    <h1 className="text-2xl font-bold leading-snug sm:text-3xl">{data.hospital}</h1>
                    <p className="mt-2 text-sm text-white/50">{data.date}</p>
                    <p className="mt-8 text-5xl font-bold tabular-nums sm:text-6xl">{totalScoreInfo.percentage}%</p>
                    <p className="mt-1 text-xs text-white/40">الامتثال الكلي</p>
                  </div>
                )}

                {presIndex > 0 && presIndex <= questionSlides.length && (
                  (() => {
                    const item = questionSlides[presIndex - 1];
                    if (!item) return null;
                    const ans = data.scores[item.question.id];
                    return (
                      <div className="mx-auto w-full max-w-lg">
                        <p className="mb-2 text-[11px] text-indigo-300">{item.sectionTitle}</p>
                        <p className="mb-6 text-xs text-white/35">
                          سؤال {item.globalIndex} من {item.totalQuestions}
                        </p>
                        <p className="text-lg font-medium leading-relaxed sm:text-xl">{item.question.text}</p>
                        <div className="mt-8">
                          <span
                            className={`inline-block rounded-full px-4 py-2 text-sm font-semibold ${
                              ans === "yes" ? "bg-emerald-500/20 text-emerald-300" : ans === "no" ? "bg-red-500/20 text-red-300" : "bg-white/10 text-white/70"
                            }`}
                          >
                            {scoreLabel(item.question.id)}
                          </span>
                        </div>
                        {data.itemNotes[item.question.id]?.trim() && (
                          <p className="mt-6 border-t border-white/10 pt-4 text-sm leading-relaxed text-white/60">{data.itemNotes[item.question.id]}</p>
                        )}
                      </div>
                    );
                  })()
                )}

                {presIndex === presTotal - 1 && (
                  <div className="mx-auto max-w-md text-center">
                    <p className="text-2xl font-bold">شكراً لكم</p>
                    <p className="mt-2 text-sm text-white/45">الإدارة التنفيذية للطب الوقائي</p>
                  </div>
                )}
              </div>

              <div className="fixed bottom-0 left-0 right-0 z-40 flex gap-2 border-t border-white/10 bg-zinc-950 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  disabled={presIndex <= 0}
                  onClick={() => setPresIndex((i) => Math.max(0, i - 1))}
                  className="flex min-h-12 flex-1 items-center justify-center rounded-xl border border-white/20 bg-transparent py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35"
                >
                  السابق
                </button>
                <button
                  type="button"
                  disabled={presIndex >= presTotal - 1}
                  onClick={() => setPresIndex((i) => Math.min(presTotal - 1, i + 1))}
                  className="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-white py-3 text-sm font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:bg-white/40 disabled:text-zinc-600"
                >
                  التالي
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>

      {step === "setup" && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-200 bg-white pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
            {setupWizardStep < 2 ? (
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

      {step === "inspection" && flowStep && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-200 bg-white pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-lg gap-2 px-3 sm:max-w-2xl sm:px-4">
            <button
              type="button"
              onClick={() => {
                if (inspectionStepIndex > 0) {
                  setInspectionStepIndex((p) => p - 1);
                  window.scrollTo(0, 0);
                } else setStep("setup");
              }}
              className="flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-xl border border-zinc-300 bg-white active:bg-zinc-50"
            >
              <ChevronRight className="h-5 w-5" />
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

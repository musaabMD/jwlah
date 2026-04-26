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
  PlayCircle,
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
  ListChecks,
  ImagePlus,
  ChevronDown,
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
  normalizeInspectionData,
} from "./inspection-utils";
import { MHC_LOGO_PATH } from "./branding";
import { downloadInspectionPptx } from "./export-pptx";
import { downloadReportMakerPptx } from "./export-report-maker-pptx";
import { ReportMakerPptSlideReview } from "./ReportMakerPptSlideReview";
import { ReportMakerChecklistSteps } from "./ReportMakerChecklistSteps";
import { ReportMakerTourCoverHero } from "./ReportMakerTourCoverHero";
import { downloadInspectionReportPdf, printInspectionReport } from "./pdf-export";
import { buildReportMakerPptSlides } from "./report-maker-slide-plan";
import {
  REPORT_MAKER_STORAGE_KEY,
  REPORT_MAKER_STORAGE_VERSION,
  calculateReportMakerScore,
  createEmptyReportMaker,
  normalizeReportMakerData,
  todayLocalISO,
  type ReportMakerData,
} from "./report-maker-types";

const SETUP_STEP_COUNT = 4;
const DRAFT_STORAGE_KEY = "tour_draft";
const DRAFT_STORAGE_VERSION = 2 as const;
const DRAFT_EMAIL_RECIPIENTS = [
  "aabdulrhmnsommanalayde@gmail.com",
  "episurv2026@gmail.com",
  "adool01046@gmail.com",
  "welynfc1411@gmail.com",
] as const;

type AppStep = "home" | "setup" | "inspection" | "report" | "presentation" | "history" | "report-maker";

type DraftPayloadV2 = {
  v: typeof DRAFT_STORAGE_VERSION;
  data: InspectionData;
  step: AppStep;
  setupWizardStep: number;
  inspectionStepIndex: number;
  showIntro: boolean;
};

function normalizeAppStep(s: unknown): AppStep {
  const allowed: AppStep[] = ["home", "setup", "inspection", "report", "presentation", "history", "report-maker"];
  return typeof s === "string" && (allowed as string[]).includes(s) ? (s as AppStep) : "home";
}

function clampWizardStep(n: unknown): number {
  const x = Math.round(Number(n));
  if (Number.isNaN(x)) return 0;
  return Math.min(SETUP_STEP_COUNT - 1, Math.max(0, x));
}

function mergeDraftIntoBase(base: InspectionData, d: Partial<InspectionData>): InspectionData {
  return normalizeInspectionData({
    ...base,
    ...d,
    skippedQuestionIds: Array.isArray(d.skippedQuestionIds) ? d.skippedQuestionIds : base.skippedQuestionIds ?? [],
  });
}

function hasProgressData(d: InspectionData): boolean {
  const hasScores = Object.keys(d.scores ?? {}).length > 0;
  const hasItemNotes = Object.values(d.itemNotes ?? {}).some((v) => Boolean(v?.trim()));
  const hasSectionNotes = Object.values(d.sectionNotes ?? {}).some((v) => Boolean(v?.trim()));
  const hasImages = Object.values(d.sectionImages ?? {}).some((items) => Array.isArray(items) && items.length > 0);
  return Boolean(d.hospital?.trim()) || d.inspectors.length > 0 || hasScores || hasItemNotes || hasSectionNotes || hasImages;
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
  { label: "البنود" },
] as const;

const REPORT_MAKER_WIZARD_STEPS = [
  { label: "بيانات التقرير", hint: "العنوان، المنشأة، المكلفون — التاريخ يوم اليوم تلقائياً" },
  { label: "غلاف التقرير", hint: "معاينة أولى فقط" },
  { label: "بنود الفحص", hint: "أكمل البنود سطراً بسطر" },
  { label: "ملاحظات وصور", hint: "عامة للتقرير" },
  { label: "تصدير", hint: "مراجعة الشرائح ثم التنزيل" },
] as const;
const REPORT_MAKER_WIZARD_LAST = REPORT_MAKER_WIZARD_STEPS.length - 1;

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

export default function App() {
  const [persistedBoot] = useState(loadSessionFromStorage);
  const [showIntro, setShowIntro] = useState(persistedBoot.showIntro);
  const [step, setStep] = useState<AppStep>(persistedBoot.step);
  const [inspectionStepIndex, setInspectionStepIndex] = useState(persistedBoot.inspectionStepIndex);
  const [presIndex, setPresIndex] = useState(0);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [homeMsg, setHomeMsg] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState<"pdf" | "pptx" | null>(null);
  /** مراجعة وتعديل القائمة قبل تنزيل أو إرسال PowerPoint */
  const [pptReviewOpen, setPptReviewOpen] = useState(false);
  const [pptReviewAction, setPptReviewAction] = useState<"download" | "email" | null>(null);
  /** صانع التقرير: مراجعة وتعديل قبل تنزيل PPT */
  const [reportMakerPptReviewOpen, setReportMakerPptReviewOpen] = useState(false);
  /** عند فتح المراجعة من القائمة: معرّف الشريحة المطلوبة أولاً (يُستهلك داخل المراجعة). */
  const [reportMakerPptInitialSlideId, setReportMakerPptInitialSlideId] = useState<string | undefined>(undefined);
  /** صانع التقرير: معالج خطوة بخطوة (صفحة واحدة = خطوة واحدة) */
  const [reportMakerWizardStep, setReportMakerWizardStep] = useState(0);
  const [reportMakerInspectorsOpen, setReportMakerInspectorsOpen] = useState(false);
  const reportMakerInspectorsRef = useRef<HTMLDivElement>(null);
  const [reportMakerSectionFocusId, setReportMakerSectionFocusId] = useState<string>(() => SECTIONS[0]?.id ?? "");
  const [reportMakerSectionStage, setReportMakerSectionStage] = useState<"pick" | "edit">("pick");
  /** معالج الإعداد: 0 فريق، 1 منشأة، 2 بنود ثم بدء الجولة */
  const [setupWizardStep, setSetupWizardStep] = useState(persistedBoot.setupWizardStep);
  const [showSectionGrid, setShowSectionGrid] = useState(false);

  const [history, setHistory] = useState<unknown[]>(() => {
    const saved = localStorage.getItem("tour_history");
    return saved ? JSON.parse(saved) : [];
  });

  const [data, setData] = useState<InspectionData>(persistedBoot.data);
  const hasDraftToResume = useMemo(() => hasProgressData(data), [data]);

  const reportRef = useRef<HTMLDivElement>(null);
  const presDirRef = useRef(1);
  /** Step to restore when leaving السجل via header back (avoids dropping users on إعداد الجولة). */
  const historyReturnStepRef = useRef<AppStep>("home");
  const headerNavRef = useRef<HTMLDivElement>(null);
  const [headerNavOpen, setHeaderNavOpen] = useState(false);

  const [reportMakerData, setReportMakerData] = useState<ReportMakerData>(() => {
    try {
      const raw = localStorage.getItem(REPORT_MAKER_STORAGE_KEY);
      if (!raw) return createEmptyReportMaker();
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return createEmptyReportMaker();
      const o = parsed as Record<string, unknown>;
      const persistedV = typeof o.v === "number" ? o.v : 0;
      if (persistedV >= 1 && persistedV <= REPORT_MAKER_STORAGE_VERSION && o.data && typeof o.data === "object") {
        return normalizeReportMakerData(o.data as Partial<ReportMakerData>);
      }
      return createEmptyReportMaker();
    } catch {
      return createEmptyReportMaker();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        REPORT_MAKER_STORAGE_KEY,
        JSON.stringify({ v: REPORT_MAKER_STORAGE_VERSION, data: reportMakerData }),
      );
    } catch (e) {
      console.warn("report_maker_save_failed", e);
    }
  }, [reportMakerData]);

  useEffect(() => {
    if (step !== "report-maker") setReportMakerPptReviewOpen(false);
  }, [step]);

  useEffect(() => {
    if (step !== "report-maker") setReportMakerWizardStep(0);
  }, [step]);

  useEffect(() => {
    if (reportMakerWizardStep !== 2) {
      setReportMakerSectionStage("pick");
    }
  }, [reportMakerWizardStep]);

  /** تاريخ التقرير دائماً يوم الجاري عند دخول صانع التقرير */
  useEffect(() => {
    if (step !== "report-maker") return;
    const d = todayLocalISO();
    setReportMakerData((p) => (p.date === d ? p : { ...p, date: d }));
  }, [step]);

  useEffect(() => {
    if (!reportMakerInspectorsOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = reportMakerInspectorsRef.current;
      if (el && !el.contains(e.target as Node)) setReportMakerInspectorsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [reportMakerInspectorsOpen]);

  const reportMakerScore = useMemo(() => calculateReportMakerScore(reportMakerData), [reportMakerData]);
  const reportMakerPptSlidePlan = useMemo(() => buildReportMakerPptSlides(reportMakerData), [reportMakerData]);
  const hasReportMakerFacility = Boolean(reportMakerData.facility.trim());
  const canAdvanceReportMakerStep = reportMakerWizardStep !== 0 || hasReportMakerFacility;
  const reportMakerItemsById = useMemo(() => new Map(reportMakerData.items.map((it) => [it.id, it] as const)), [reportMakerData.items]);
  const reportMakerSectionMetrics = useMemo(
    () =>
      SECTIONS.map((sec) => {
        let total = 0;
        let checked = 0;
        for (const q of sec.questions) {
          const row = reportMakerItemsById.get(q.id);
          if (!row) continue;
          total += 1;
          if (row.checked) checked += 1;
        }
        const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
        return { id: sec.id, title: sec.title, checked, total, pct };
      }),
    [reportMakerItemsById],
  );
  const activeReportMakerSectionId =
    SECTIONS.some((s) => s.id === reportMakerSectionFocusId) ? reportMakerSectionFocusId : (SECTIONS[0]?.id ?? "");
  const activeReportMakerSectionMeta = useMemo(
    () => reportMakerSectionMetrics.find((s) => s.id === activeReportMakerSectionId),
    [reportMakerSectionMetrics, activeReportMakerSectionId],
  );
  const hasReportMakerProgress = useMemo(
    () =>
      Boolean(reportMakerData.facility?.trim()) ||
      reportMakerData.inspectors.length > 0 ||
      Boolean(reportMakerData.notes?.trim()) ||
      reportMakerData.images.length > 0 ||
      reportMakerData.items.some((it) => it.checked || Boolean(it.note?.trim()) || it.images.length > 0),
    [reportMakerData],
  );
  const shouldWarnBeforeLeave =
    ((step === "setup" || step === "inspection" || step === "report") && hasProgressData(data)) ||
    (step === "report-maker" && hasReportMakerProgress);

  useEffect(() => {
    if (!SECTIONS.some((s) => s.id === reportMakerSectionFocusId)) {
      setReportMakerSectionFocusId(SECTIONS[0]?.id ?? "");
    }
  }, [reportMakerSectionFocusId]);

  const activeSections = useMemo(() => getActiveSections(data), [data.skippedQuestionIds]);
  const totalScoreInfo = useMemo(() => calculateGlobalMetrics(data), [data.scores, data.skippedQuestionIds]);
  const activeCount = useMemo(() => countActiveQuestions(data), [data.skippedQuestionIds]);
  const questionSlides = useMemo(() => flattenQuestionSlides(data), [data.skippedQuestionIds]);
  const presTotal = questionSlides.length + 2;
  const inspectionFlow = useMemo(() => buildInspectionFlow(data), [data.skippedQuestionIds]);

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
    if (step !== "setup") return;
    const iso = todayLocalISO();
    const day = new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(new Date(iso + "T12:00:00"));
    setData((prev) => {
      if (prev.date === iso && prev.day === day) return prev;
      return { ...prev, date: iso, day };
    });
  }, [step]);

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

  const openPptReviewForExport = (action: "download" | "email") => {
    setPptReviewAction(action);
    setPptReviewOpen(true);
  };

  const closePptReview = () => {
    setPptReviewOpen(false);
    setPptReviewAction(null);
  };

  const confirmPptReviewAndExport = async () => {
    const action = pptReviewAction;
    if (!action) return;
    setPptReviewOpen(false);
    setPptReviewAction(null);
    if (action === "download") await runDownloadPptx();
    else await downloadPptxAndPrepareDraftEmail();
  };

  const openDraftEmailComposer = () => {
    const recipients = DRAFT_EMAIL_RECIPIENTS.join(",");
    const subject = `مسودة جولة غير مكتملة - ${data.hospital || "زيارة ميدانية"}`;
    const body =
      `تم إغلاق النموذج قبل الاكتمال.\n\n` +
      `المنشأة: ${data.hospital || "غير محدد"}\n` +
      `التاريخ: ${data.date || "غير محدد"}\n` +
      `المفتشون: ${data.inspectors.length ? data.inspectors.join("، ") : "غير محدد"}\n` +
      `نسبة الإنجاز الحالية: ${inspectionProgressPct}%\n` +
      `الامتثال الحالي: ${totalScoreInfo.percentage}%\n\n` +
      `ملاحظة: أرفق ملف PowerPoint الذي تم تنزيله من التطبيق قبل الإرسال.`;
    window.location.href = `mailto:${recipients}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const downloadPptxAndPrepareDraftEmail = async () => {
    setExportMsg(null);
    setExportBusy("pptx");
    try {
      await downloadInspectionPptx(data);
      openDraftEmailComposer();
      setExportMsg("تم تنزيل ملف PowerPoint وفتح البريد الجاهز لإرساله إلى جميع المستلمين.");
    } catch (e) {
      console.error(e);
      setExportMsg("تعذر إنشاء ملف PowerPoint للمسودة.");
    } finally {
      setExportBusy(null);
    }
  };

  const handleReportMakerImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          setReportMakerData((prev) => ({
            ...prev,
            images: [...prev.images, reader.result as string],
          }));
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const handleReportMakerItemImageUpload = (itemId: string, e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          setReportMakerData((prev) => ({
            ...prev,
            items: prev.items.map((row) =>
              row.id === itemId ? { ...row, images: [...row.images, reader.result as string] } : row,
            ),
          }));
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const removeReportMakerItemImage = (itemId: string, imgIndex: number) => {
    setReportMakerData((prev) => ({
      ...prev,
      items: prev.items.map((row) =>
        row.id === itemId ? { ...row, images: row.images.filter((_, idx) => idx !== imgIndex) } : row,
      ),
    }));
  };

  const runDownloadReportMakerPptx = async () => {
    setExportMsg(null);
    setExportBusy("pptx");
    try {
      await downloadReportMakerPptx(reportMakerData);
    } catch (err) {
      console.error(err);
      setExportMsg("تعذر إنشاء ملف PowerPoint.");
    } finally {
      setExportBusy(null);
    }
  };

  const closeReportMakerPptReview = () => {
    setReportMakerPptReviewOpen(false);
    setReportMakerPptInitialSlideId(undefined);
  };

  const confirmReportMakerPptExport = async () => {
    setReportMakerPptReviewOpen(false);
    await runDownloadReportMakerPptx();
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
  const complianceInterpretation = useMemo(() => {
    const pct = totalScoreInfo.percentage;
    if (pct >= 90) return { label: "Good compliance", icon: "✅", tone: "text-emerald-700 bg-emerald-50 border-emerald-200" };
    if (pct >= 80) return { label: "Acceptable", icon: "⚠️", tone: "text-amber-700 bg-amber-50 border-amber-200" };
    return { label: "Poor (action required)", icon: "❌", tone: "text-red-700 bg-red-50 border-red-200" };
  }, [totalScoreInfo.percentage]);
  const historyStats = useMemo(() => {
    const tours = history as Array<{ totalScore?: number; scores?: Record<string, ScoreValue> }>;
    const count = tours.length;
    const avg = count > 0 ? Math.round(tours.reduce((sum, t) => sum + (t.totalScore ?? 0), 0) / count) : 0;
    return { count, avg };
  }, [history]);

  const headerTitle =
    step === "home"
      ? "جولة"
      : step === "setup"
        ? "إعداد الجولة"
        : step === "inspection"
          ? "التقييم الميداني"
          : step === "report"
            ? "ملخص النتائج"
            : step === "history"
              ? "سجل الجولات"
              : step === "report-maker"
                ? "صانع التقرير"
                : "جولة";

  const headerSubtitle: string | null =
    step === "setup"
      ? SETUP_WIZARD_STEPS[setupWizardStep]?.label ?? null
      : step === "inspection" && inspectionFlow.length > 0
        ? `${inspectionProgressPct}٪ · ${inspectionStepIndex + 1} من ${inspectionFlow.length}`
        : step === "report" && data.hospital
          ? data.hospital
          : step === "report-maker" && reportMakerPptReviewOpen
            ? "مراجعة الشرائح قبل التصدير"
            : null;

  const canGoBackFromHeader = !showIntro && step !== "home";
  const goBackFromHeader = () => {
    if (shouldWarnBeforeLeave) {
      const ok = window.confirm("لديك إدخالات غير مكتملة. هل تريد المتابعة؟ سيتم حفظ المسودة على هذا الجهاز.");
      if (!ok) return;
    }
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
      setStep(historyReturnStepRef.current);
      window.scrollTo(0, 0);
      return;
    }
    if (step === "presentation") {
      setStep("report");
      return;
    }
    if (step === "report-maker") {
      if (reportMakerPptReviewOpen) {
        closeReportMakerPptReview();
        return;
      }
      setStep("home");
      window.scrollTo(0, 0);
      return;
    }
    setStep("home");
  };

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!shouldWarnBeforeLeave) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [shouldWarnBeforeLeave]);

  return (
    <div className="min-h-[100dvh] bg-zinc-50 text-zinc-900 overflow-x-hidden print:bg-white" dir="rtl">
      {!showIntro && step !== "presentation" && (
        <header className="sticky top-0 z-50 border-b border-zinc-200/80 bg-white/95 shadow-[0_1px_0_rgba(0,0,0,0.04)] backdrop-blur-md print:hidden">
          <div className="mx-auto w-full max-w-2xl px-4 py-3.5 sm:max-w-4xl sm:px-6 sm:py-4 lg:max-w-6xl lg:px-8">
            <div className="flex items-center justify-between gap-3 sm:gap-4">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white shadow-sm ring-1 ring-zinc-900/20 sm:h-10 sm:w-10">
                  <ClipboardCheck className="h-[1.05rem] w-[1.05rem] sm:h-[1.15rem] sm:w-[1.15rem]" aria-hidden />
                </div>
                <div className="min-w-0">
                  <h1 className="truncate text-sm font-bold leading-snug tracking-tight text-zinc-900 sm:text-[15px]">{headerTitle}</h1>
                  {headerSubtitle ? (
                    <p className="mt-0.5 truncate text-[11px] font-medium leading-normal text-zinc-500">{headerSubtitle}</p>
                  ) : null}
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-2">
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

                <div className="flex items-center justify-end gap-1.5 sm:gap-2">
                  {step === "report-maker" && (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setHomeMsg(null);
                          setStep("home");
                          window.scrollTo(0, 0);
                        }}
                        className="inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[11px] font-semibold text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 sm:text-xs"
                      >
                        <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-zinc-600" aria-hidden />
                        الرئيسية
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          historyReturnStepRef.current = "report-maker";
                          setStep("history");
                          window.scrollTo(0, 0);
                        }}
                        className="inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] font-semibold text-zinc-800 transition-colors hover:bg-zinc-100 sm:text-xs"
                      >
                        <History className="h-3.5 w-3.5 shrink-0 text-zinc-600" aria-hidden />
                        السجل
                      </button>
                    </div>
                  )}
                  {canGoBackFromHeader && (
                    <button
                      type="button"
                      onClick={goBackFromHeader}
                      className="inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[11px] font-semibold text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 active:bg-zinc-100 sm:text-xs"
                      aria-label="رجوع"
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden />
                      رجوع
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
                                historyReturnStepRef.current = step;
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
            {step === "home" ? (
              <nav
                className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3.5 sm:mt-4 sm:gap-2.5 sm:pt-4"
                aria-label="تنقل سريع"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (hasDraftToResume) {
                      if (!window.confirm("سيتم استبدال المسودة الحالية بجولة جديدة. المتابعة؟")) return;
                    }
                    setHomeMsg(null);
                    startNewTour();
                    window.scrollTo(0, 0);
                  }}
                  className="inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[11px] font-semibold text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 sm:text-xs"
                >
                  <FilePlus2 className="h-3.5 w-3.5 shrink-0 text-zinc-600" aria-hidden />
                  جديد
                </button>
                {hasDraftToResume ? (
                  <button
                    type="button"
                    onClick={() => {
                      setHomeMsg(null);
                      setStep("setup");
                      window.scrollTo(0, 0);
                    }}
                    className="inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[11px] font-semibold text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 sm:text-xs"
                  >
                    <PlayCircle className="h-3.5 w-3.5 shrink-0 text-zinc-600" aria-hidden />
                    استئناف
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setHomeMsg(null);
                    setStep("report-maker");
                    window.scrollTo(0, 0);
                  }}
                  className="inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[11px] font-semibold text-zinc-800 shadow-sm transition-colors hover:bg-zinc-50 sm:text-xs"
                >
                  <ListChecks className="h-3.5 w-3.5 shrink-0 text-zinc-600" aria-hidden />
                  تقرير
                </button>
                <button
                  type="button"
                  onClick={() => {
                    historyReturnStepRef.current = "home";
                    setStep("history");
                    window.scrollTo(0, 0);
                  }}
                  className="inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] font-semibold text-zinc-800 transition-colors hover:bg-zinc-100 sm:text-xs"
                >
                  <History className="h-3.5 w-3.5 shrink-0 text-zinc-600" aria-hidden />
                  السجل
                </button>
              </nav>
            ) : null}
          </div>
        </header>
      )}

      <main className="mx-auto w-full max-w-2xl px-3 py-4 pb-28 print:max-w-none print:px-0 print:py-0 print:pb-0 sm:max-w-4xl sm:px-6 sm:py-5 lg:max-w-6xl lg:px-8">
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
                <div className="mt-1 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (hasDraftToResume) {
                        if (!window.confirm("سيتم استبدال المسودة الحالية بجولة جديدة. المتابعة؟")) return;
                      }
                      setHomeMsg(null);
                      startNewTour();
                      window.scrollTo(0, 0);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-sky-200 bg-sky-50/45 px-3 py-3 text-right shadow-sm ring-1 ring-sky-100 transition hover:bg-sky-50"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-sky-200/80">
                      <FilePlus2 className="h-4 w-4 text-sky-700" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-zinc-900">جولة جديدة</span>
                      <span className="mt-0.5 block text-[11px] font-medium leading-relaxed text-zinc-600">
                        بدء جولة تفتيش من معالج الإعداد
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!hasDraftToResume) {
                        setHomeMsg("لا توجد مسودة غير مكتملة على هذا الجهاز.");
                        return;
                      }
                      setHomeMsg(null);
                      setStep("setup");
                      window.scrollTo(0, 0);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-right shadow-sm ring-1 transition ${
                      hasDraftToResume
                        ? "border-emerald-200 bg-emerald-50/45 ring-emerald-100 hover:bg-emerald-50"
                        : "border-zinc-200 bg-zinc-50/70 ring-zinc-100"
                    }`}
                    aria-disabled={!hasDraftToResume}
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ${
                        hasDraftToResume ? "ring-emerald-200/80" : "ring-zinc-200/80"
                      }`}
                    >
                      <PlayCircle className={`h-4 w-4 ${hasDraftToResume ? "text-emerald-700" : "text-zinc-400"}`} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-semibold ${hasDraftToResume ? "text-zinc-900" : "text-zinc-500"}`}>استئناف الجولة</span>
                      <span className={`mt-0.5 block text-[11px] font-medium leading-relaxed ${hasDraftToResume ? "text-zinc-600" : "text-zinc-400"}`}>
                        {hasDraftToResume ? "متابعة آخر جولة غير مكتملة على هذا الجهاز" : "لا توجد مسودة محفوظة حالياً"}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                        setHomeMsg(null);
                        setStep("report-maker");
                        window.scrollTo(0, 0);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-violet-200 bg-violet-50/45 px-3 py-3 text-right shadow-sm ring-1 ring-violet-100 transition hover:bg-violet-50"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-violet-200/80">
                      <ListChecks className="h-4 w-4 text-violet-700" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-zinc-900">صانع التقرير</span>
                      <span className="mt-0.5 block text-[11px] font-medium leading-relaxed text-zinc-600">
                        قائمة تحقق، تقييم تلقائي، رفع صور، وتصدير PowerPoint
                      </span>
                    </span>
                  </button>
                </div>
                {hasDraftToResume ? (
                  <p className="mt-3 border-t border-zinc-100 pt-3 text-center">
                    <button
                      type="button"
                      disabled={exportBusy !== null}
                      onClick={() => openPptReviewForExport("email")}
                      className="text-[12px] font-medium text-zinc-600 underline decoration-zinc-400/50 underline-offset-2 hover:text-zinc-900 disabled:opacity-50"
                    >
                      {exportBusy === "pptx" ? "جارٍ التنزيل…" : "تنزيل أو إرسال PPT من المسودة"}
                    </button>
                  </p>
                ) : null}
              </section>
              {homeMsg && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{homeMsg}</p>}
              {exportMsg && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{exportMsg}</p>}
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
                            setData(
                              normalizeInspectionData({
                                id: t.id,
                                coverTitle: typeof t.coverTitle === "string" ? t.coverTitle : "",
                                inspectors: t.inspectors ?? [],
                                hospital: t.hospital ?? "",
                                date: t.date ?? "",
                                day:
                                  t.day ??
                                  new Intl.DateTimeFormat("ar-SA", { weekday: "long" }).format(new Date((t.date ?? "") + "T12:00:00")),
                                email: t.email ?? "",
                                baselinePercentage: typeof t.baselinePercentage === "number" ? t.baselinePercentage : null,
                                scores: (t.scores ?? {}) as InspectionData["scores"],
                                itemNotes: t.itemNotes ?? {},
                                sectionNotes: t.sectionNotes ?? {},
                                sectionImages: t.sectionImages ?? {},
                                skippedQuestionIds: t.skippedQuestionIds ?? [],
                              }),
                            );
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

          {step === "report-maker" && (
            <motion.div
              key="report-maker"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={
                reportMakerPptReviewOpen
                  ? "flex min-h-[calc(100dvh-6.5rem)] flex-col gap-0 sm:min-h-[calc(100dvh-5.75rem)]"
                  : "space-y-4 pb-6"
              }
            >
              {reportMakerPptReviewOpen ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                  <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-100 px-3 py-3 sm:px-4">
                    <div>
                      <h2 id="rm-ppt-review-title" className="text-base font-bold text-zinc-900">
                        مراجعة شريحة بشريحة
                      </h2>
                      <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
                        سابق/تالي أو القائمة — تعديل أسفل المعاينة، ثم تأكيد التنزيل.
                      </p>
                      <p className="mt-2 text-[11px] font-semibold tabular-nums text-emerald-800">
                        التقييم التلقائي:{" "}
                        {reportMakerScore.total === 0
                          ? "—"
                          : `${reportMakerScore.percentage}٪ (${reportMakerScore.checked}/${reportMakerScore.total})`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closeReportMakerPptReview}
                      className="shrink-0 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                    >
                      رجوع إلى المحرر
                    </button>
                  </div>

                  <div className="min-h-0 flex-1 overflow-hidden px-2 py-2 sm:px-4 sm:py-3">
                    <ReportMakerPptSlideReview
                      layout="page"
                      data={reportMakerData}
                      setData={setReportMakerData}
                      initialSlideId={reportMakerPptInitialSlideId}
                    />
                  </div>

                  <div className="flex shrink-0 flex-col gap-2 border-t border-zinc-100 bg-white px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-4">
                    <button
                      type="button"
                      onClick={closeReportMakerPptReview}
                      disabled={exportBusy === "pptx"}
                      className="min-h-11 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 sm:min-w-[7rem]"
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      disabled={exportBusy === "pptx"}
                      onClick={() => void confirmReportMakerPptExport()}
                      className="min-h-11 rounded-xl bg-zinc-900 px-4 text-sm font-bold text-white shadow-sm hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[12rem]"
                    >
                      {exportBusy === "pptx" ? "جارٍ التنزيل…" : "تأكيد وتنزيل PowerPoint"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-zinc-200 bg-white p-3 sm:p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold text-zinc-500">
                        الخطوة {reportMakerWizardStep + 1} من {REPORT_MAKER_WIZARD_STEPS.length}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-bold text-zinc-900">
                          {REPORT_MAKER_WIZARD_STEPS[reportMakerWizardStep]?.label}
                        </p>
                        <button
                          type="button"
                          disabled={exportBusy !== null}
                          onClick={() => {
                            if (!window.confirm("مسح كل محتوى صانع التقرير وإعادة البدء؟")) return;
                            setReportMakerData(createEmptyReportMaker());
                            setExportMsg(null);
                            setReportMakerWizardStep(0);
                          }}
                          className="text-[10px] font-semibold text-zinc-500 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-800 disabled:opacity-50"
                        >
                          مسح الكل
                        </button>
                      </div>
                    </div>
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      {REPORT_MAKER_WIZARD_STEPS[reportMakerWizardStep]?.hint}
                    </p>
                    <div
                      className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                      role="tablist"
                      aria-label="خطوات صانع التقرير"
                    >
                      {REPORT_MAKER_WIZARD_STEPS.map((s, i) => {
                        const on = i === reportMakerWizardStep;
                        const done = i < reportMakerWizardStep;
                        return (
                          <button
                            key={s.label}
                            type="button"
                            role="tab"
                            aria-selected={on}
                            onClick={() => {
                              if (i > 0 && !hasReportMakerFacility) return;
                              setReportMakerWizardStep(i);
                            }}
                            disabled={i > 0 && !hasReportMakerFacility}
                            className={`min-h-9 min-w-0 flex-1 rounded-lg px-1.5 py-1.5 text-center text-[10px] font-semibold leading-tight transition-colors sm:px-2 sm:text-[11px] ${
                              on
                                ? "bg-zinc-900 text-white shadow-sm"
                                : done
                                  ? "bg-zinc-100 text-zinc-800 hover:bg-zinc-200"
                                  : "border border-zinc-200 bg-zinc-50/80 text-zinc-500 hover:bg-zinc-100"
                            }`}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {reportMakerWizardStep === 0 ? (
                    <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start" dir="rtl">
                      <section className="order-2 min-w-0 rounded-xl border border-zinc-200 bg-white p-4 sm:p-5 lg:order-none">
                        <h2 className="text-sm font-semibold text-zinc-900">بيانات التقرير</h2>
                        <p className="mt-1 text-[11px] text-zinc-500">
                          اسم ملف التقرير يُحدَّد تلقائيًا. المنشأة والفريق يظهران في غلاف الشريحة.{" "}
                          <span className="font-medium text-zinc-600">التاريخ: يوم اليوم تلقائياً.</span>
                        </p>
                        <div className="mt-4 space-y-3">
                          <label className="block text-[11px] font-semibold text-zinc-600">المنشأة</label>
                          <select
                            value={reportMakerData.facility}
                            onChange={(e) => setReportMakerData((p) => ({ ...p, facility: e.target.value }))}
                            className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2.5 text-sm outline-none focus:border-zinc-900 focus:bg-white focus:ring-2 focus:ring-zinc-900/10"
                          >
                            <option value="">— اختر المنشأة —</option>
                            {HOSPITALS.map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                          </select>
                          <div>
                            <label className="block text-[11px] font-semibold text-zinc-600" htmlFor="rm-inspectors-trigger">
                              أسماء المكلفين (اختياري)
                            </label>
                            <p className="mb-2 mt-0.5 text-[10px] text-zinc-500">يمكن اختيار أكثر من اسم.</p>
                            <div className="relative" ref={reportMakerInspectorsRef}>
                              <button
                                id="rm-inspectors-trigger"
                                type="button"
                                aria-expanded={reportMakerInspectorsOpen}
                                aria-haspopup="listbox"
                                onClick={() => setReportMakerInspectorsOpen((o) => !o)}
                                className="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2.5 text-start text-sm outline-none transition-colors hover:bg-white focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                              >
                                <span
                                  className={`min-w-0 flex-1 truncate ${reportMakerData.inspectors.length ? "text-zinc-900" : "text-zinc-400"}`}
                                >
                                  {reportMakerData.inspectors.length
                                    ? reportMakerData.inspectors.join("، ")
                                    : "— اختر من القائمة —"}
                                </span>
                                <ChevronDown
                                  className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${reportMakerInspectorsOpen ? "rotate-180" : ""}`}
                                  aria-hidden
                                />
                              </button>
                              {reportMakerInspectorsOpen ? (
                                <div
                                  className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-zinc-200 bg-white py-1 shadow-lg"
                                  role="listbox"
                                  aria-multiselectable="true"
                                >
                                  {INSPECTORS.map((inspector) => {
                                    const on = reportMakerData.inspectors.includes(inspector.name);
                                    return (
                                      <label
                                        key={inspector.id}
                                        className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm text-zinc-800 hover:bg-zinc-50"
                                      >
                                        <input
                                          type="checkbox"
                                          className="h-4 w-4 shrink-0 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900/20"
                                          checked={on}
                                          onChange={() =>
                                            setReportMakerData((prev) => ({
                                              ...prev,
                                              inspectors: on
                                                ? prev.inspectors.filter((n) => n !== inspector.name)
                                                : [...prev.inspectors, inspector.name],
                                            }))
                                          }
                                        />
                                        <span className="min-w-0 flex-1">{inspector.name}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </section>
                      <section
                        className="order-1 min-w-0 overflow-hidden rounded-xl border border-emerald-200/70 bg-gradient-to-b from-emerald-50/80 to-zinc-50/50 p-3 sm:p-4 lg:order-none"
                        aria-label="معاينة شريحة الغلاف"
                      >
                        <p className="text-xs font-bold text-emerald-900">شريحة الغلاف (معاينة مباشرة)</p>
                        <p className="mt-0.5 text-[10px] text-emerald-800/80">16:9 — تتغيّر مع البيانات يميناً</p>
                        <div className="mx-auto mt-3 w-full max-w-3xl">
                          <ReportMakerTourCoverHero data={reportMakerData} />
                        </div>
                      </section>
                    </div>
                  ) : null}

                  {reportMakerWizardStep === 1 ? (
                    <section className="rounded-xl border border-zinc-200 bg-zinc-50/40 p-4 sm:p-5">
                      <h2 className="text-sm font-semibold text-zinc-900">معاينة غلاف التقرير</h2>
                      <p className="mt-1 text-[11px] text-zinc-500">
                        الشريحة الأولى (16:9) فقط. بقية الشرائح تُراجع شريحة بشريحة عند التصدير.
                      </p>
                      <div className="mx-auto mt-3 max-w-3xl">
                        <ReportMakerTourCoverHero data={reportMakerData} />
                      </div>
                    </section>
                  ) : null}

                  {reportMakerWizardStep === 2 ? (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-white px-4 py-3">
                        <p className="text-[11px] font-bold text-emerald-950">التقييم التلقائي (✓ = مكتمل)</p>
                        <p className="text-sm font-bold tabular-nums text-emerald-800">
                          {reportMakerScore.total === 0 ? (
                            "—"
                          ) : (
                            <>
                              {reportMakerScore.percentage}٪ — {reportMakerScore.checked}/{reportMakerScore.total}
                            </>
                          )}
                        </p>
                      </div>
                      {reportMakerSectionStage === "pick" ? (
                        <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
                          <h2 className="text-sm font-semibold text-zinc-900">اختر القسم</h2>
                          <p className="mt-1 text-[11px] text-zinc-500">قسم واحد فقط كل مرة. اختر ثم افتح شريحته للتحديث.</p>
                          <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const idx = Math.max(0, SECTIONS.findIndex((s) => s.id === activeReportMakerSectionId));
                                  const prev = Math.max(0, idx - 1);
                                  setReportMakerSectionFocusId(SECTIONS[prev]?.id ?? activeReportMakerSectionId);
                                }}
                                disabled={SECTIONS.findIndex((s) => s.id === activeReportMakerSectionId) <= 0}
                                className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
                              >
                                السابق
                              </button>
                              <span className="text-[11px] font-semibold text-zinc-500 tabular-nums">
                                {Math.max(1, SECTIONS.findIndex((s) => s.id === activeReportMakerSectionId) + 1)} / {SECTIONS.length}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const idx = Math.max(0, SECTIONS.findIndex((s) => s.id === activeReportMakerSectionId));
                                  const next = Math.min(SECTIONS.length - 1, idx + 1);
                                  setReportMakerSectionFocusId(SECTIONS[next]?.id ?? activeReportMakerSectionId);
                                }}
                                disabled={SECTIONS.findIndex((s) => s.id === activeReportMakerSectionId) >= SECTIONS.length - 1}
                                className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
                              >
                                التالي
                              </button>
                            </div>
                            <div className="mt-2.5 rounded-xl border border-zinc-900 bg-zinc-900 px-3 py-3 text-white shadow-sm">
                              <p className="text-xs font-bold" title={activeReportMakerSectionMeta?.title ?? "—"}>
                                {activeReportMakerSectionMeta?.title ?? "—"}
                              </p>
                              <p className="mt-1 text-[11px] text-zinc-200 tabular-nums">
                                {activeReportMakerSectionMeta?.checked ?? 0}/{activeReportMakerSectionMeta?.total ?? 0} •{" "}
                                {activeReportMakerSectionMeta?.pct ?? 0}٪
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setReportMakerSectionStage("edit")}
                              className="mt-2.5 inline-flex min-h-[2.5rem] w-full items-center justify-center rounded-xl bg-zinc-900 px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-zinc-800"
                            >
                              فتح شريحة هذا القسم
                            </button>
                          </div>
                        </section>
                      ) : (
                        <section className="rounded-xl border border-zinc-200 bg-zinc-50/40 p-4 sm:p-5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h2 className="text-sm font-semibold text-zinc-900">تحديث القسم كشريحة مستقلة</h2>
                            <button
                              type="button"
                              onClick={() => setReportMakerSectionStage("pick")}
                              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50"
                            >
                              تغيير القسم
                            </button>
                          </div>
                          <p className="mt-1 text-[11px] text-zinc-500">
                            تعمل الآن على:{" "}
                            <span className="font-semibold text-zinc-700">
                              {SECTIONS.find((s) => s.id === activeReportMakerSectionId)?.title ?? "—"}
                            </span>
                          </p>
                          <div className="mx-auto mt-3 w-full max-w-3xl">
                            <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-zinc-200 shadow-inner">
                              <div className="absolute inset-0 bg-gradient-to-br from-[#0f3d8c] via-[#1d4ed8] to-[#0b1f3a]" />
                              <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.2),transparent_42%),radial-gradient(circle_at_80%_78%,rgba(255,255,255,0.14),transparent_40%)]" />
                              <div className="absolute start-3 top-3 rounded-md bg-white/10 px-2 py-1 text-[10px] font-semibold text-white/90 backdrop-blur-sm sm:start-4 sm:top-4">
                                شريحة قسم
                              </div>
                              <div className="absolute end-3 top-3 rounded-md bg-white/10 px-2 py-1 text-[10px] font-semibold text-white/90 backdrop-blur-sm sm:end-4 sm:top-4">
                                16:9
                              </div>
                              <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-5">
                                <div className="w-full max-w-[82%] rounded-2xl border border-white/20 bg-zinc-950/36 px-4 py-4 text-white shadow-2xl backdrop-blur-[2px] sm:max-w-[72%] sm:px-6 sm:py-5">
                                  <p className="text-center text-[11px] font-semibold text-zinc-100/90 sm:text-xs">بنود الفحص</p>
                                  <h3 className="mt-1 text-center text-[18px] font-extrabold leading-tight sm:text-[24px]">
                                    {activeReportMakerSectionMeta?.title ?? "—"}
                                  </h3>
                                  <p className="mt-2 text-center text-[12px] font-semibold text-zinc-100 sm:text-sm">
                                    نسبة الامتثال: {activeReportMakerSectionMeta?.pct ?? 0}٪
                                  </p>
                                  <p className="mt-1 text-center text-[11px] font-medium text-zinc-200/95 sm:text-xs">
                                    البنود المكتملة: {activeReportMakerSectionMeta?.checked ?? 0}/{activeReportMakerSectionMeta?.total ?? 0}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="mt-3">
                            <ReportMakerChecklistSteps
                              data={reportMakerData}
                              setData={setReportMakerData}
                              onItemImageUpload={handleReportMakerItemImageUpload}
                              onRemoveItemImage={removeReportMakerItemImage}
                              onlySectionId={activeReportMakerSectionId}
                            />
                          </div>
                        </section>
                      )}
                    </>
                  ) : null}

                  {reportMakerWizardStep === 3 ? (
                    <>
                      <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
                        <h2 className="text-sm font-semibold text-zinc-900">ملاحظات عامة</h2>
                        <textarea
                          value={reportMakerData.notes}
                          onChange={(e) => setReportMakerData((p) => ({ ...p, notes: e.target.value }))}
                          rows={5}
                          placeholder="ملاحظات تظهر في التقرير وملف العرض…"
                          className="mt-3 w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2.5 text-sm outline-none focus:border-zinc-900 focus:bg-white focus:ring-2 focus:ring-zinc-900/10"
                        />
                      </section>
                      <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
                        <div className="flex items-center justify-between gap-2">
                          <h2 className="text-sm font-semibold text-zinc-900">صور مرفقة</h2>
                          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[11px] font-semibold text-zinc-800 hover:bg-zinc-100">
                            <ImagePlus className="h-3.5 w-3.5" aria-hidden />
                            رفع صور
                            <input
                              type="file"
                              multiple
                              accept="image/*"
                              className="hidden"
                              onChange={handleReportMakerImageUpload}
                            />
                          </label>
                        </div>
                        {reportMakerData.images.length === 0 ? (
                          <p className="mt-3 text-center text-[12px] text-zinc-500">
                            لا توجد صور بعد — كل صورة تُستخرج كشريحة في PowerPoint.
                          </p>
                        ) : (
                          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {reportMakerData.images.map((img, i) => (
                              <div
                                key={`${i}-${img.slice(0, 32)}`}
                                className="relative aspect-video overflow-hidden rounded-lg border border-zinc-100"
                              >
                                <img src={img} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setReportMakerData((p) => ({
                                      ...p,
                                      images: p.images.filter((_, idx) => idx !== i),
                                    }))
                                  }
                                  className="absolute end-1 top-1 rounded bg-red-600 p-0.5 text-white shadow-sm"
                                  aria-label="حذف الصورة"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>
                    </>
                  ) : null}

                  {reportMakerWizardStep === REPORT_MAKER_WIZARD_LAST ? (
                    <section className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 sm:p-5">
                      <h2 className="text-sm font-semibold text-zinc-900">جاهز للتصدير</h2>
                      <p className="mt-1 text-[12px] text-zinc-600">
                        معاينة الشرائح تتم <strong>واحدة تلو الأخرى</strong> — ثم يمكنك تنزيل PowerPoint.
                      </p>
                      <p className="mt-2 text-[11px] tabular-nums text-zinc-500">
                        عدد الشرائح المخطط لها: {reportMakerPptSlidePlan.length} (يقل إذا بقيت بعض الأقسام أو الملاحظات فارغة عند
                        التصدير الفعلي)
                      </p>
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                        <button
                          type="button"
                          disabled={exportBusy !== null}
                          onClick={() => {
                            setExportMsg(null);
                            setReportMakerPptInitialSlideId(undefined);
                            setReportMakerPptReviewOpen(true);
                          }}
                          className="flex min-h-[2.75rem] flex-1 items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-50"
                        >
                          <Presentation className="h-4 w-4" aria-hidden />
                          مراجعة الشرائح ثم التصدير
                        </button>
                        <button
                          type="button"
                          disabled={exportBusy !== null}
                          onClick={() => {
                            if (!window.confirm("مسح كل محتوى صانع التقرير وإعادة البدء؟")) return;
                            setReportMakerData(createEmptyReportMaker());
                            setExportMsg(null);
                            setReportMakerWizardStep(0);
                          }}
                          className="min-h-[2.75rem] rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                        >
                          مسح وبدء جديد
                        </button>
                      </div>
                    </section>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200/80 pt-4">
                    <button
                      type="button"
                      onClick={() => setReportMakerWizardStep((s) => Math.max(0, s - 1))}
                      disabled={reportMakerWizardStep === 0}
                      className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden />
                      السابق
                    </button>
                    <button
                      type="button"
                      onClick={() => setReportMakerWizardStep((s) => Math.min(REPORT_MAKER_WIZARD_LAST, s + 1))}
                      disabled={reportMakerWizardStep >= REPORT_MAKER_WIZARD_LAST || !canAdvanceReportMakerStep}
                      className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-zinc-900 px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      التالي
                      <ChevronLeft className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </>
              )}
              {exportMsg && step === "report-maker" ? (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{exportMsg}</p>
              ) : null}
            </motion.div>
          )}

          {step === "setup" && (
            <motion.div key="setup" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="mx-auto w-full min-w-0 max-w-full">
                <div className="rounded-2xl border border-zinc-200/90 bg-white px-4 py-3 shadow-sm">
                  <div className="mb-3 flex items-center justify-center gap-2">
                    <span className="text-xs font-semibold tracking-wide text-zinc-600">إعداد الجولة</span>
                    <span
                      className="rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-bold tabular-nums text-white"
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
                              className={`mx-1 mt-3.5 h-0.5 w-8 rounded-full sm:w-12 md:w-20 ${setupWizardStep >= i ? "bg-zinc-900" : "bg-zinc-200"}`}
                              aria-hidden
                            />
                          ) : null}
                          <div className="flex w-16 shrink-0 flex-col items-center gap-1.5 sm:w-20 sm:gap-2">
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
                              className={`text-center text-[11px] font-semibold leading-snug ${
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
                  <label className="mb-1 mt-4 block text-[11px] font-semibold text-zinc-700">عنوان التقرير على غلاف PowerPoint (اختياري)</label>
                  <p className="mb-2 text-[11px] text-zinc-500">يظهر مكان العنوان الافتراضي الطويل. سطر عدة أسطر: انسخ مع أسطر.</p>
                  <textarea
                    value={data.coverTitle ?? ""}
                    onChange={(e) => setData((prev) => ({ ...prev, coverTitle: e.target.value }))}
                    rows={2}
                    placeholder="مثال: جولة تفتيشية — باب جبريل"
                    className="w-full min-h-10 resize-y rounded-lg border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-right text-sm text-zinc-900 [unicode-bidi:plaintext]"
                    dir="auto"
                  />
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
                                    <span
                                      dir="auto"
                                      className={`${included ? "text-zinc-900" : "text-zinc-400 line-through"} inline-block w-full leading-relaxed [unicode-bidi:plaintext] break-words`}
                                    >
                                      {q.text}
                                    </span>
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
                  <h3 className="sr-only">اختر القسم</h3>
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
                <button
                  type="button"
                  onClick={() => setShowSectionGrid((v) => !v)}
                  className="mt-2 rounded-md border border-zinc-200 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-50"
                  aria-expanded={showSectionGrid}
                >
                  {showSectionGrid ? "إخفاء شبكة الأقسام" : "إظهار شبكة الأقسام"}
                </button>
                <div className={`mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 ${showSectionGrid ? "" : "hidden"}`}>
                  {activeSectionSummaries.map((row) => (
                    <button
                      key={row.section.id}
                      type="button"
                      onClick={() => {
                        if (row.firstStepIndex < 0) return;
                        setInspectionStepIndex(row.firstStepIndex);
                        window.scrollTo(0, 0);
                      }}
                      className={`w-full rounded-lg border px-2.5 py-2 text-right text-[11px] transition-colors ${
                        flowStep?.sectionId === row.section.id
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : row.complete
                            ? "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                            : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
                      }`}
                      aria-current={flowStep?.sectionId === row.section.id ? "true" : undefined}
                      aria-label={`الانتقال إلى قسم ${row.section.title}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="line-clamp-1 font-semibold">{row.section.title}</p>
                        {flowStep?.sectionId === row.section.id ? (
                          <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">الحالي</span>
                        ) : row.complete ? (
                          <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">مكتمل</span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 tabular-nums">
                        {row.answered}/{row.total}
                      </p>
                    </button>
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
                      <p
                        dir="auto"
                        className="text-pretty text-2xl font-semibold leading-[1.45] text-zinc-900 [unicode-bidi:plaintext] break-words sm:text-3xl sm:leading-[1.4]"
                      >
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
                              onClick={() => {
                                setData((prev) => ({
                                  ...prev,
                                  scores: { ...prev.scores, [flowStep.question.id]: opt.val },
                                }));
                                // طلب المستخدم: "نعم" أو "N/A" تنقل مباشرة للسؤال التالي.
                                if (opt.val === "yes" || opt.val === "na") {
                                  setInspectionStepIndex((i) => Math.min(Math.max(0, inspectionFlow.length - 1), i + 1));
                                  window.scrollTo(0, 0);
                                }
                              }}
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
                  onClick={() => openPptReviewForExport("download")}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  <Download className="h-3.5 w-3.5" />
                  {exportBusy === "pptx" ? "…" : "PowerPoint"}
                </button>
                <button
                  type="button"
                  disabled={exportBusy !== null}
                  onClick={() => openPptReviewForExport("email")}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-60"
                >
                  <Mail className="h-3.5 w-3.5" />
                  إرسال PPT عبر البريد
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
              <p className="print:hidden text-[10px] leading-relaxed text-zinc-500 sm:text-end">
                PowerPoint: تفتح نافذة مراجعة وتعديل قبل التصدير؛ النص RTL ويمكن تحريره في PowerPoint.
              </p>
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
                <div data-pdf-chunk className="mb-6 rounded-xl border border-zinc-200 bg-zinc-50 p-3 sm:p-4">
                  <p className="text-xs font-semibold text-zinc-800">IPC Bundle Compliance Audit - Auto-Scoring</p>
                  <p className="mt-1 text-[11px] text-zinc-600">Yes = 1 | No = 0 | N/A (exclude)</p>
                  <p className="mt-1 text-[11px] text-zinc-600">Compliance % = (Total Yes ÷ Applicable Items) × 100</p>
                  <div className={`mt-3 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${complianceInterpretation.tone}`}>
                    <span>{complianceInterpretation.icon}</span>
                    <span>{complianceInterpretation.label}</span>
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
                          <table className="w-full min-w-[520px] table-fixed text-sm">
                            <thead>
                              <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-[10px] font-semibold uppercase text-zinc-500">
                                <th className="w-[58%] p-3 text-right">البند</th>
                                <th className="w-20 p-3 text-center">التقييم</th>
                                <th className="w-[32%] p-3 text-right">ملاحظات</th>
                              </tr>
                            </thead>
                            <tbody>
                              {section.questions.map((q) => (
                                <tr key={q.id} className="border-b border-zinc-50">
                                  <td dir="auto" className="p-3 leading-relaxed text-zinc-800 [unicode-bidi:plaintext] break-words">
                                    {q.text}
                                  </td>
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
                                  <td className="p-3 text-xs leading-relaxed text-zinc-500 break-words">{data.itemNotes[q.id] || "—"}</td>
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
                    className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center lg:max-w-6xl"
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
                            <p
                              dir="auto"
                              className="text-balance text-xl font-semibold leading-relaxed [unicode-bidi:plaintext] break-words sm:text-2xl"
                            >
                              {item.question.text}
                            </p>
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
          <div className="mx-auto flex w-full max-w-2xl gap-2 px-3 sm:max-w-4xl sm:px-6 lg:max-w-6xl lg:px-8">
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

      {!showIntro && step === "inspection" && flowStep && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-200 bg-white pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] print:hidden">
          <div className="mx-auto flex w-full max-w-2xl gap-2 px-3 sm:max-w-4xl sm:px-6 lg:max-w-6xl lg:px-8">
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
            <p className="mx-auto mt-2 w-full max-w-2xl px-3 text-center text-sm font-medium text-red-600 sm:max-w-4xl sm:px-6 lg:max-w-6xl lg:px-8">
              اختر نعم أو لا أو N/A للمتابعة
            </p>
          )}
        </div>
      )}

      {pptReviewOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ppt-review-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-zinc-950/55 backdrop-blur-[2px]"
            onClick={closePptReview}
            aria-label="إغلاق المراجعة"
          />
          <div className="relative flex min-h-0 max-h-[min(92dvh,880px)] w-full max-w-4xl flex-col rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:max-h-[85dvh] sm:rounded-2xl lg:max-w-6xl">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3 sm:px-5">
              <div>
                <h2 id="ppt-review-title" className="text-base font-bold text-zinc-900">
                  مراجعة وتعديل قبل التصدير
                </h2>
                <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">
                  عدّل التقييم (نعم / لا / N/A) أو الملاحظات، ثم أكّد التنزيل. التعديلات تُحفَظ في التقرير. ملف PPT بفقرات RTL ويمكن تحريره في PowerPoint.
                </p>
                {data.hospital ? <p className="mt-1.5 text-[11px] font-medium text-zinc-600">{data.hospital}</p> : null}
              </div>
              <button
                type="button"
                onClick={closePptReview}
                className="shrink-0 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                إغلاق
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">
              {activeSections.length === 0 ? (
                <p className="text-sm text-zinc-600">لا توجد أقسام مفعّلة في الجولة. يمكنك المتابعة للتنزيل أو الرجوع للإعداد.</p>
              ) : (
                <div className="space-y-8">
                  {activeSections.map((section) => (
                    <div key={section.id} className="rounded-xl border border-zinc-100 bg-zinc-50/40 p-3 sm:p-4">
                      <h3 className="text-sm font-bold text-zinc-900">{section.title}</h3>
                      <label className="mt-3 block text-[11px] font-semibold text-zinc-600">ملاحظة القسم (تظهر في العرض وملف PPT)</label>
                      <textarea
                        value={data.sectionNotes[section.id] || ""}
                        onChange={(e) =>
                          setData((prev) => ({
                            ...prev,
                            sectionNotes: { ...prev.sectionNotes, [section.id]: e.target.value },
                          }))
                        }
                        rows={2}
                        className="mt-1.5 w-full resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/15"
                        placeholder="اختياري…"
                      />
                      <div className="mt-4 space-y-4">
                        {section.questions.map((q) => (
                          <div key={q.id} className="rounded-lg border border-zinc-200/80 bg-white p-3">
                            <p dir="auto" className="text-sm font-medium leading-snug text-zinc-800 [unicode-bidi:plaintext] break-words">
                              {q.text}
                            </p>
                            <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">التقييم</p>
                            <div className="mt-1.5 grid grid-cols-3 gap-2">
                              {(
                                [
                                  { val: "yes" as const, label: "نعم" },
                                  { val: "no" as const, label: "لا" },
                                  { val: "na" as const, label: "N/A" },
                                ] as const
                              ).map((opt) => {
                                const selected = data.scores[q.id] === opt.val;
                                const lane =
                                  opt.val === "yes"
                                    ? selected
                                      ? "border-emerald-600 bg-emerald-600 text-white ring-1 ring-emerald-400/40"
                                      : "border-emerald-200 bg-emerald-50/80 text-emerald-900 hover:bg-emerald-100"
                                    : opt.val === "no"
                                      ? selected
                                        ? "border-red-600 bg-red-600 text-white ring-1 ring-red-400/40"
                                        : "border-red-200 bg-red-50/80 text-red-900 hover:bg-red-100"
                                      : selected
                                        ? "border-blue-600 bg-blue-600 text-white ring-1 ring-blue-400/40"
                                        : "border-blue-200 bg-blue-50/80 text-blue-900 hover:bg-blue-100";
                                return (
                                  <button
                                    key={opt.val}
                                    type="button"
                                    onClick={() =>
                                      setData((prev) => ({
                                        ...prev,
                                        scores: { ...prev.scores, [q.id]: opt.val },
                                      }))
                                    }
                                    className={`min-h-[40px] rounded-xl border-2 px-2 py-2 text-xs font-bold transition active:scale-[0.98] sm:text-sm ${lane}`}
                                  >
                                    {opt.label}
                                  </button>
                                );
                              })}
                            </div>
                            <label className="mt-3 block text-[11px] font-semibold text-zinc-600">ملاحظة البند</label>
                            <textarea
                              value={data.itemNotes[q.id] || ""}
                              onChange={(e) =>
                                setData((prev) => ({
                                  ...prev,
                                  itemNotes: { ...prev.itemNotes, [q.id]: e.target.value },
                                }))
                              }
                              rows={2}
                              className="mt-1 w-full resize-y rounded-lg border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-xs outline-none focus:border-zinc-400 focus:bg-white focus:ring-2 focus:ring-zinc-900/10 sm:text-sm"
                              placeholder="اختياري…"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-col gap-2 border-t border-zinc-100 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-5">
              <button
                type="button"
                onClick={closePptReview}
                disabled={exportBusy === "pptx"}
                className="min-h-11 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 sm:min-w-[7rem]"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={exportBusy === "pptx" || pptReviewAction === null}
                onClick={() => void confirmPptReviewAndExport()}
                className="min-h-11 rounded-xl bg-zinc-900 px-4 text-sm font-bold text-white shadow-sm hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[11rem]"
              >
                {exportBusy === "pptx"
                  ? "جارٍ التنزيل…"
                  : pptReviewAction === "email"
                    ? "تنزيل وفتح البريد"
                    : "تنزيل PowerPoint"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

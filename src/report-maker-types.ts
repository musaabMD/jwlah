import { INSPECTORS, SECTIONS } from "./constants";

const VALID_INSPECTOR_NAMES = new Set(INSPECTORS.map((i) => i.name));

export type ReportMakerChecklistItem = {
  id: string;
  text: string;
  checked: boolean;
  note: string;
  images: string[];
};

export interface ReportMakerData {
  title: string;
  facility: string;
  /** Inspector display names from `INSPECTORS` (same as جولة التفتيش). */
  inspectors: string[];
  date: string;
  notes: string;
  items: ReportMakerChecklistItem[];
  images: string[];
}

export const REPORT_MAKER_STORAGE_KEY = "report_maker_v1";
export const REPORT_MAKER_STORAGE_VERSION = 3 as const;

export type ReportMakerPersisted = {
  v: typeof REPORT_MAKER_STORAGE_VERSION;
  data: ReportMakerData;
};

function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayLocalISO(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return localISODate(d);
}

/** All inspection questions in catalog order (for report-maker checklist). */
export function getReportMakerCatalogItems(): ReportMakerChecklistItem[] {
  return SECTIONS.flatMap((sec) =>
    sec.questions.map((q) => ({
      id: q.id,
      text: q.text,
      checked: false,
      note: "",
      images: [],
    })),
  );
}

function coerceItem(raw: unknown): ReportMakerChecklistItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string") return null;
  return {
    id: o.id,
    text: typeof o.text === "string" ? o.text : "",
    checked: Boolean(o.checked),
    note: typeof o.note === "string" ? o.note : "",
    images: Array.isArray(o.images) ? o.images.filter((u): u is string => typeof u === "string" && u.startsWith("data:")) : [],
  };
}

function normalizeInspectorNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of raw) {
    if (typeof n !== "string") continue;
    const t = n.trim();
    if (!t || !VALID_INSPECTOR_NAMES.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function mergeCatalogWithSaved(
  catalog: ReportMakerChecklistItem[],
  saved: ReportMakerChecklistItem[],
): ReportMakerChecklistItem[] {
  const byId = new Map(saved.map((s) => [s.id, s]));
  const byText = new Map<string, ReportMakerChecklistItem>();
  for (const s of saved) {
    const t = s.text.trim().toLowerCase();
    if (t.length > 0 && !byText.has(t)) byText.set(t, s);
  }
  return catalog.map((c) => {
    const hit = byId.get(c.id) ?? byText.get(c.text.trim().toLowerCase());
    if (!hit) return c;
    return {
      ...c,
      checked: Boolean(hit.checked),
      note: typeof hit.note === "string" ? hit.note : "",
      images: Array.isArray(hit.images) ? hit.images.filter((u): u is string => typeof u === "string" && u.startsWith("data:")) : [],
    };
  });
}

export function createEmptyReportMaker(): ReportMakerData {
  return {
    title: "تقرير جولة تفتيشية",
    facility: "",
    inspectors: [],
    date: todayLocalISO(),
    notes: "",
    items: getReportMakerCatalogItems(),
    images: [],
  };
}

export function normalizeReportMakerData(raw: Partial<ReportMakerData> | null | undefined): ReportMakerData {
  const base = createEmptyReportMaker();
  if (!raw || typeof raw !== "object") return base;

  const savedItems = Array.isArray(raw.items)
    ? (raw.items.map(coerceItem).filter(Boolean) as ReportMakerChecklistItem[])
    : [];

  const mergedItems = mergeCatalogWithSaved(base.items, savedItems);

  return {
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : base.title,
    facility: typeof raw.facility === "string" ? raw.facility : "",
    inspectors: normalizeInspectorNames(raw.inspectors),
    /** دائماً تاريخ يوم الاستخدام — لا نحتفظ بتاريخ قديم من التخزين */
    date: todayLocalISO(),
    notes: typeof raw.notes === "string" ? raw.notes : "",
    items: mergedItems.length > 0 ? mergedItems : base.items,
    images: Array.isArray(raw.images) ? raw.images.filter((u): u is string => typeof u === "string" && u.startsWith("data:")) : [],
  };
}

/** Score over every catalog item: checked / total. */
export function calculateReportMakerScore(data: ReportMakerData): {
  checked: number;
  total: number;
  percentage: number;
} {
  const total = data.items.length;
  const checked = data.items.filter((it) => it.checked).length;
  const percentage = total === 0 ? 0 : Math.round((checked / total) * 100);
  return { checked, total, percentage };
}

export function safeReportMakerFileBase(data: ReportMakerData): string {
  const slug = (data.facility || data.title || "report")
    .trim()
    .slice(0, 48)
    .replace(/[^\p{L}\p{N}\s_-]+/gu, "")
    .replace(/\s+/g, "-");
  const day = (data.date || todayLocalISO()).replace(/-/g, "");
  return `report-maker-${slug || "report"}-${day}`;
}

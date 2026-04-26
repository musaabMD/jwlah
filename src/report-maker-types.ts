export type ReportMakerChecklistItem = { id: string; text: string; checked: boolean };

export interface ReportMakerData {
  title: string;
  facility: string;
  date: string;
  notes: string;
  items: ReportMakerChecklistItem[];
  images: string[];
}

export const REPORT_MAKER_STORAGE_KEY = "report_maker_v1";
export const REPORT_MAKER_STORAGE_VERSION = 1 as const;

export type ReportMakerPersisted = {
  v: typeof REPORT_MAKER_STORAGE_VERSION;
  data: ReportMakerData;
};

function newItemId(): string {
  return `rm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

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

export function createEmptyReportMaker(): ReportMakerData {
  return {
    title: "تقرير ميداني",
    facility: "",
    date: todayLocalISO(),
    notes: "",
    items: [
      { id: newItemId(), text: "", checked: false },
      { id: newItemId(), text: "", checked: false },
      { id: newItemId(), text: "", checked: false },
    ],
    images: [],
  };
}

export function normalizeReportMakerData(raw: Partial<ReportMakerData> | null | undefined): ReportMakerData {
  const base = createEmptyReportMaker();
  if (!raw || typeof raw !== "object") return base;
  const items = Array.isArray(raw.items)
    ? raw.items
        .filter((it): it is ReportMakerChecklistItem => it != null && typeof it === "object" && typeof (it as ReportMakerChecklistItem).id === "string")
        .map((it) => ({
          id: it.id,
          text: typeof it.text === "string" ? it.text : "",
          checked: Boolean(it.checked),
        }))
    : base.items;
  return {
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : base.title,
    facility: typeof raw.facility === "string" ? raw.facility : "",
    date: typeof raw.date === "string" && raw.date.trim() ? raw.date.trim() : base.date,
    notes: typeof raw.notes === "string" ? raw.notes : "",
    items: items.length > 0 ? items : base.items,
    images: Array.isArray(raw.images) ? raw.images.filter((u): u is string => typeof u === "string" && u.startsWith("data:")) : [],
  };
}

/** Autoscore: only rows with non-empty text count toward total. */
export function calculateReportMakerScore(data: ReportMakerData): {
  checked: number;
  total: number;
  percentage: number;
} {
  const applicable = data.items.filter((it) => it.text.trim().length > 0);
  const total = applicable.length;
  const checked = applicable.filter((it) => it.checked).length;
  const percentage = total === 0 ? 0 : Math.round((checked / total) * 100);
  return { checked, total, percentage };
}

export function addReportMakerItem(data: ReportMakerData): ReportMakerData {
  return {
    ...data,
    items: [...data.items, { id: newItemId(), text: "", checked: false }],
  };
}

export function removeReportMakerItem(data: ReportMakerData, id: string): ReportMakerData {
  const next = data.items.filter((it) => it.id !== id);
  return {
    ...data,
    items: next.length > 0 ? next : [{ id: newItemId(), text: "", checked: false }],
  };
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

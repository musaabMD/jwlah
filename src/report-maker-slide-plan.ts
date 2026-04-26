import { SECTIONS } from "./constants";
import type { ReportMakerData } from "./report-maker-types";

function truncLabel(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export type ReportMakerPptSlideKind =
  | "cover"
  | "section_intro"
  | "section_table"
  | "notes"
  | "item_photo"
  | "annex_photo"
  | "closing";

export type ReportMakerPptSlide = {
  id: string;
  kind: ReportMakerPptSlideKind;
  /** 1-based index (matches export order). */
  n: number;
  labelAr: string;
  /** When `kind === "section_intro" | "section_table"`, matches `SECTIONS[].id`. */
  sectionId?: string;
  itemId?: string;
  imageIndex?: number;
};

/** Slide order mirrors `downloadReportMakerPptx` (notes row always shown in UI; file omits empty notes). */
export function buildReportMakerPptSlides(data: ReportMakerData): ReportMakerPptSlide[] {
  const out: ReportMakerPptSlide[] = [];
  let n = 0;
  const push = (slide: Omit<ReportMakerPptSlide, "n">) => {
    n += 1;
    out.push({ ...slide, n });
  };

  push({ id: "cover", kind: "cover", labelAr: "غلاف التقرير" });
  for (const sec of SECTIONS) {
    push({
      id: `section-intro:${sec.id}`,
      kind: "section_intro",
      sectionId: sec.id,
      labelAr: `قسم: ${truncLabel(sec.title, 32)}`,
    });
    push({
      id: `section-table:${sec.id}`,
      kind: "section_table",
      sectionId: sec.id,
      labelAr: `جدول: ${truncLabel(sec.title, 36)}`,
    });
  }
  push({ id: "notes", kind: "notes", labelAr: "ملاحظات عامة" });

  for (const it of data.items) {
    it.images.forEach((_, imgIdx) => {
      push({
        id: `item-photo:${it.id}:${imgIdx}`,
        kind: "item_photo",
        labelAr: it.images.length > 1 ? `صورة ${imgIdx + 1}: ${truncLabel(it.text, 28)}` : `صورة: ${truncLabel(it.text, 32)}`,
        itemId: it.id,
        imageIndex: imgIdx,
      });
    });
  }

  data.images.forEach((_, imgIdx) => {
    push({
      id: `annex:${imgIdx}`,
      kind: "annex_photo",
      labelAr: data.images.length > 1 ? `مرفق ${imgIdx + 1}` : "مرفق عام",
      imageIndex: imgIdx,
    });
  });

  push({ id: "closing", kind: "closing", labelAr: "شريحة الختام" });
  return out;
}

/** Slides actually written to the .pptx (for subtitle copy). */
export function countReportMakerPptExportSlides(data: ReportMakerData): number {
  let c = 1 + SECTIONS.length * 2; // cover + intro + table per section
  if (data.notes.trim()) c += 1;
  for (const it of data.items) c += it.images.length;
  c += data.images.length;
  c += 1; // closing
  return c;
}

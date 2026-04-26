import pptxgen from "pptxgenjs";
import { REPORT_MAKER_TOUR_CLOSING_BG_PATH, REPORT_MAKER_TOUR_COVER_BG_PATH } from "./branding";
import { buildReportMakerTourCoverLines, reportMakerTourCoverTitle } from "./report-maker-tour-cover-lines";
import { SECTIONS } from "./constants";
import { type ReportMakerData, safeReportMakerFileBase } from "./report-maker-types";
import { dataUrlToPptxBase64, fetchPublicImageAsPptxBase64 } from "./export-helpers";
import { PPTX_PARA_RTL } from "./pptx-rtl-opts";

/** LTR order [ملاحظة، تقييم، بند] so RTL reading is بند → تقييم → ملاحظة. */
const itemTableColW: [number, number, number] = [1.95, 1.15, 6.1];

const ACCENT = "0f172a";
/** Table header (matches inspection-style report tables). */
const SECTION_TABLE_HEADER = "111C2C";
/** Full-screen section title slide (matches inspection PPT section intros). */
const SECTION_INTRO_BG = "111827";

function gregorianSlashFromIso(iso: string): string {
  if (!iso?.trim()) return "—";
  const day = iso.split("T")[0];
  const p = day.split("-");
  if (p.length !== 3) return iso;
  return `${p[0]}/${p[1]}/${p[2]}`;
}

type PptxSlide = ReturnType<InstanceType<typeof pptxgen>["addSlide"]>;

function addFooter(slide: PptxSlide, data: ReportMakerData): void {
  const team = data.inspectors?.length ? data.inspectors.join("، ") : "—";
  const line = [`${data.date}`, data.facility?.trim() || "—", team].join("   •   ");
  slide.addText(line, {
    x: 0.35,
    y: 5.38,
    w: 9.3,
    h: 0.22,
    fontSize: 9,
    color: "A1A1AA",
    align: "right",
    ...PPTX_PARA_RTL,
  });
}

function addSectionTableFooter(slide: PptxSlide, data: ReportMakerData, sectionPct: number): void {
  const line = [`${sectionPct}٪`, `${gregorianSlashFromIso(data.date)}م`, data.facility?.trim() || "—"].join("   •   ");
  slide.addText(line, {
    x: 0.35,
    y: 5.38,
    w: 9.3,
    h: 0.22,
    fontSize: 9,
    color: "A1A1AA",
    align: "right",
    ...PPTX_PARA_RTL,
  });
}

/** Date • facility (dim), as on dark section intro slides. */
function addSectionIntroFooter(slide: PptxSlide, data: ReportMakerData): void {
  const dateIso = data.date?.split("T")[0]?.trim() || "—";
  const line = [dateIso, data.facility?.trim() || "—"].join("   •   ");
  slide.addText(line, {
    x: 0.35,
    y: 5.38,
    w: 9.3,
    h: 0.22,
    fontSize: 9,
    color: "94A3B8",
    align: "right",
    ...PPTX_PARA_RTL,
  });
}

function truncateCell(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function truncateSectionTitle(text: string, max: number): string {
  return truncateCell(text, max);
}

function sectionTableMetrics(
  section: (typeof SECTIONS)[number],
  itemById: Map<string, { checked: boolean }>,
): { earned: number; total: number; percentage: number } {
  let earned = 0;
  let total = 0;
  for (const q of section.questions) {
    const it = itemById.get(q.id);
    if (!it) continue;
    total += 1;
    if (it.checked) earned += 1;
  }
  return { earned, total, percentage: total === 0 ? 0 : Math.round((earned / total) * 100) };
}

export async function downloadReportMakerPptx(raw: ReportMakerData): Promise<void> {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_16x9";
  pptx.rtlMode = true;
  pptx.author = raw.inspectors?.length ? raw.inspectors.join("، ") : "صانع التقرير";
  pptx.title = raw.title?.trim() || "تقرير";
  pptx.subject = "تقرير — قائمة تحقق (RTL)";

  const tourCoverB64 = await fetchPublicImageAsPptxBase64(REPORT_MAKER_TOUR_COVER_BG_PATH);
  const tourClosingB64 = await fetchPublicImageAsPptxBase64(REPORT_MAKER_TOUR_CLOSING_BG_PATH);
  const coverTitle = reportMakerTourCoverTitle(raw);
  const coverLines = buildReportMakerTourCoverLines(raw).join("\n");
  const COVER_BLOCK_X = 0.42;
  const COVER_BLOCK_W = 5.95;
  const COVER_BACK_Y = 0.92;
  const COVER_BACK_H = 2.82;
  const COVER_META_FONT = 15;
  const COVER_META_LINE_SPACING = 24;

  const cover = pptx.addSlide();
  if (tourCoverB64) {
    cover.background = { data: tourCoverB64 };
    cover.addShape(pptx.ShapeType.roundRect, {
      x: COVER_BLOCK_X - 0.04,
      y: COVER_BACK_Y,
      w: COVER_BLOCK_W + 0.1,
      h: COVER_BACK_H,
      fill: { color: "0f172a", transparency: 42 },
      line: { width: 0 },
      rectRadius: 0.14,
    });
    cover.addText(coverTitle, {
      x: COVER_BLOCK_X,
      y: 1.12,
      w: COVER_BLOCK_W,
      h: 0.9,
      fontSize: 22,
      bold: true,
      color: "FFFFFF",
      align: "right",
      valign: "middle",
      fontFace: "Arial",
      lineSpacing: 30,
      ...PPTX_PARA_RTL,
    });
    cover.addText(coverLines, {
      x: COVER_BLOCK_X,
      y: 2.0,
      w: COVER_BLOCK_W,
      h: 1.68,
      fontSize: COVER_META_FONT,
      bold: true,
      color: "F1F5F9",
      align: "right",
      valign: "top",
      fontFace: "Arial",
      lineSpacing: COVER_META_LINE_SPACING,
      margin: [2, 6, 2, 6],
      ...PPTX_PARA_RTL,
    });
  } else {
    cover.background = { color: "1a3a5c" };
    cover.addText(`${coverTitle}\n\n${coverLines}`, {
      x: 0.5,
      y: 1.35,
      w: 9,
      h: 3.1,
      fontSize: COVER_META_FONT,
      bold: true,
      color: "FFFFFF",
      align: "center",
      valign: "middle",
      fontFace: "Arial",
      lineSpacing: COVER_META_LINE_SPACING,
      ...PPTX_PARA_RTL,
    });
  }

  const itemById = new Map(raw.items.map((it) => [it.id, it] as const));
  const headerBase = {
    bold: true,
    fontSize: 13,
    color: "FFFFFF" as const,
    fill: { color: SECTION_TABLE_HEADER },
    ...PPTX_PARA_RTL,
  };
  const cellBorder = { pt: 0.5 as const, color: "E5E5E5" };

  const sectionScoreRow = (title: string, earned: number, tot: number, pct: number) => [
    [
      {
        text: `${title}\nنتيجة القسم: ${earned}/${tot}  •  ${pct}٪`,
        options: {
          colspan: 3,
          align: "right" as const,
          valign: "middle" as const,
          fill: { color: "F0F0F0" },
          fontSize: 15,
          bold: true,
          color: "171717",
          margin: [0.06, 0.1, 0.06, 0.1] as [number, number, number, number],
          border: cellBorder,
          ...PPTX_PARA_RTL,
        },
      },
    ],
  ];

  for (const section of SECTIONS) {
    const { earned, total: secTotal, percentage: secPct } = sectionTableMetrics(section, itemById);

    const sectionIntro = pptx.addSlide();
    sectionIntro.background = { color: SECTION_INTRO_BG };
    sectionIntro.addText("قسم التقييم", {
      x: 0.5,
      y: 1.35,
      w: 9,
      h: 0.45,
      fontSize: 14,
      color: "94A3B8",
      align: "right",
      ...PPTX_PARA_RTL,
    });
    sectionIntro.addText(section.title, {
      x: 0.5,
      y: 1.85,
      w: 9,
      h: 1.35,
      fontSize: 30,
      bold: true,
      color: "FFFFFF",
      align: "right",
      ...PPTX_PARA_RTL,
    });
    sectionIntro.addText(
      secTotal > 0
        ? `نتيجة القسم: ${earned} / ${secTotal}   •   ${secPct}٪`
        : "نتيجة القسم: لا توجد بنود مُقيَّمة في هذا القسم",
      {
        x: 0.5,
        y: 3.35,
        w: 9,
        h: 0.55,
        fontSize: 20,
        color: "E2E8F0",
        align: "right",
        ...PPTX_PARA_RTL,
      },
    );
    addSectionIntroFooter(sectionIntro, raw);

    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 10,
      h: 0.12,
      fill: { color: SECTION_TABLE_HEADER },
      line: { color: SECTION_TABLE_HEADER, width: 0 },
    });
    slide.addText(`جدول البنود — ${truncateSectionTitle(section.title, 48)}`, {
      x: 0.4,
      y: 0.22,
      w: 9.2,
      h: 0.4,
      fontSize: 14,
      bold: true,
      color: SECTION_TABLE_HEADER,
      align: "right",
      ...PPTX_PARA_RTL,
    });

    const bodyRows = section.questions.flatMap((q) => {
      const it = itemById.get(q.id);
      if (!it) return [];
      const note = it.note.trim() || "—";
      const ans = it.checked ? "نعم" : "لا";
      const ansColor = it.checked ? ("15803D" as const) : ("B91C1C" as const);
      return [
        [
          {
            text: truncateCell(note, 200),
            options: {
              fontSize: 12,
              color: "525252",
              align: "right" as const,
              valign: "top" as const,
              border: cellBorder,
              ...PPTX_PARA_RTL,
            },
          },
          {
            text: ans,
            options: {
              fontSize: 13,
              bold: true,
              color: ansColor,
              align: "center" as const,
              valign: "middle" as const,
              border: cellBorder,
              ...PPTX_PARA_RTL,
            },
          },
          {
            text: truncateCell(it.text, 380),
            options: { fontSize: 13, align: "right" as const, valign: "top" as const, border: cellBorder, ...PPTX_PARA_RTL },
          },
        ],
      ];
    });

    const tableRows = [
      [
        { text: "ملاحظة", options: { ...headerBase, align: "right" as const } },
        { text: "التقييم", options: { ...headerBase, align: "center" as const } },
        { text: "البند", options: { ...headerBase, align: "right" as const } },
      ],
      ...sectionScoreRow(section.title, earned, secTotal, secPct),
      ...(bodyRows.length > 0
        ? bodyRows
        : [
            [
              {
                text: "لا توجد بنود في هذا القسم.",
                options: { colspan: 3, fontSize: 14, align: "right" as const, color: "737373", border: cellBorder, ...PPTX_PARA_RTL },
              },
            ],
          ]),
    ];

    slide.addTable(tableRows, {
      x: 0.4,
      y: 0.72,
      w: 9.2,
      colW: itemTableColW,
      border: { pt: 0.5, color: "E5E5E5" },
      fontSize: 12,
      autoPage: true,
      autoPageRepeatHeader: true,
      autoPageHeaderRows: 2,
      autoPageSlideStartY: 0.72,
    });
    addSectionTableFooter(slide, raw, secPct);
  }

  if (raw.notes.trim()) {
    const noteSlide = pptx.addSlide();
    noteSlide.background = { color: "FAFAFA" };
    noteSlide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 10,
      h: 0.12,
      fill: { color: ACCENT },
      line: { color: ACCENT, width: 0 },
    });
    noteSlide.addText("ملاحظات", {
      x: 0.4,
      y: 0.28,
      w: 9.2,
      h: 0.4,
      fontSize: 18,
      bold: true,
      color: "171717",
      align: "right",
      ...PPTX_PARA_RTL,
    });
    noteSlide.addText(raw.notes.trim(), {
      x: 0.4,
      y: 0.85,
      w: 9.2,
      h: 4.2,
      fontSize: 14,
      color: "404040",
      align: "right",
      valign: "top",
      ...PPTX_PARA_RTL,
    });
    addFooter(noteSlide, raw);
  }

  for (const it of raw.items) {
    const imgs = it.images ?? [];
    imgs.forEach((src, idx) => {
      try {
        const slide = pptx.addSlide();
        slide.background = { color: "F4F4F5" };
        slide.addShape(pptx.ShapeType.rect, {
          x: 0,
          y: 0,
          w: 10,
          h: 0.12,
          fill: { color: ACCENT },
          line: { color: ACCENT, width: 0 },
        });
        const title =
          imgs.length > 1 ? `صورة ${idx + 1} — ${truncateCell(it.text, 72)}` : truncateCell(it.text, 90);
        slide.addText(title, {
          x: 0.4,
          y: 0.22,
          w: 9.2,
          h: 0.45,
          fontSize: 12,
          bold: true,
          color: ACCENT,
          align: "right",
          ...PPTX_PARA_RTL,
        });
        const noteTrim = it.note.trim();
        if (noteTrim) {
          slide.addText(truncateCell(noteTrim, 180), {
            x: 0.4,
            y: 0.62,
            w: 9.2,
            h: 0.35,
            fontSize: 11,
            color: "525252",
            align: "right",
            ...PPTX_PARA_RTL,
          });
        }
        const imgY = noteTrim ? 1.05 : 0.78;
        const imgH = noteTrim ? 4.25 : 4.52;
        slide.addImage({
          data: dataUrlToPptxBase64(src),
          x: 0.5,
          y: imgY,
          w: 9,
          h: imgH,
          sizing: { type: "contain", w: 9, h: imgH },
        });
        addFooter(slide, raw);
      } catch {
        /* skip invalid image */
      }
    });
  }

  raw.images.forEach((src, idx) => {
    try {
      const slide = pptx.addSlide();
      slide.background = { color: "F4F4F5" };
      slide.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 0,
        w: 10,
        h: 0.12,
        fill: { color: ACCENT },
        line: { color: ACCENT, width: 0 },
      });
      slide.addText(`صورة ${idx + 1}`, {
        x: 0.4,
        y: 0.22,
        w: 9.2,
        h: 0.35,
        fontSize: 14,
        bold: true,
        color: ACCENT,
        align: "right",
        ...PPTX_PARA_RTL,
      });
      slide.addImage({
        data: dataUrlToPptxBase64(src),
        x: 0.5,
        y: 0.75,
        w: 9,
        h: 4.55,
        sizing: { type: "contain", w: 9, h: 4.55 },
      });
      addFooter(slide, raw);
    } catch {
      /* skip invalid image */
    }
  });

  const end = pptx.addSlide();
  if (tourClosingB64) {
    end.background = { data: tourClosingB64 };
    end.addShape(pptx.ShapeType.rect, {
      x: 1.35,
      y: 2.05,
      w: 7.3,
      h: 1.55,
      fill: { color: "0f172a", transparency: 42 },
      line: { width: 0 },
    });
  } else {
    end.background = { color: "1a3a5c" };
  }
  end.addText("شكراً", {
    x: 0.4,
    y: 2.15,
    w: 9.2,
    h: 0.85,
    fontSize: 36,
    bold: true,
    color: "FFFFFF",
    align: "center",
    valign: "middle",
    fontFace: "Arial",
    ...PPTX_PARA_RTL,
  });
  end.addText("تجمع المدينة المنورة الصحي", {
    x: 0.4,
    y: 2.95,
    w: 9.2,
    h: 0.55,
    fontSize: 15,
    bold: true,
    color: "F1F5F9",
    align: "center",
    valign: "middle",
    fontFace: "Arial",
    ...PPTX_PARA_RTL,
  });
  addFooter(end, raw);

  await pptx.writeFile({
    fileName: `${safeReportMakerFileBase(raw)}.pptx`,
  });
}

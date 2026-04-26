import pptxgen from "pptxgenjs";
import { DEFAULT_INSPECTION_COVER_TITLE } from "./constants";
import { MHC_LOGO_PATH, PPTX_CLOSING_BG_PATH, PPTX_COVER_BG_PATH } from "./branding";
import { InspectionData } from "./types";
import {
  calculateGlobalMetrics,
  calculateSectionMetrics,
  getActiveSections,
  normalizeInspectionData,
  safeExportBase,
} from "./inspection-utils";
import { dataUrlToPptxBase64, fetchPublicImageAsPptxBase64 } from "./export-helpers";
import { PPTX_PARA_RTL } from "./pptx-rtl-opts";

function scoreLabel(data: InspectionData, qid: string): string {
  const s = data.scores[qid];
  if (s === "yes") return "نعم";
  if (s === "no") return "لا";
  if (s === "na") return "غير applicable";
  return "—";
}

function truncateChartLabel(text: string, maxChars: number): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars - 1)}…`;
}

const ACCENT = "0f172a";
const ACCENT_LIGHT = "334155";
/** Tour cover text block (نص على اليسار لموازاة شعار في القالب). */
const COVER_BLOCK_X = 0.42;
const COVER_BLOCK_W = 5.95;
const COVER_BACK_Y = 0.92;
const COVER_BACK_H = 2.82;
const COVER_TOP_FS = 22;
const COVER_TOP_LINE_SPACING = 30;
const COVER_META_FONT = 15;
const COVER_META_LINE_SPACING = 24;

/** PptxGen tables are LTR; with rtlMode, column 0 is still left. Use LTR [ملاحظة، تقييم، بند] so reading RTL shows بند first (right) and ملاحظة last (left). */
const itemTableColW: [number, number, number] = [1.95, 1.15, 6.1];

function resolveCoverTitle(data: InspectionData): string {
  const t = data.coverTitle?.trim();
  return t || DEFAULT_INSPECTION_COVER_TITLE;
}

function gregorianSlashFromIso(iso: string): string {
  if (!iso?.trim()) return "—";
  const day = iso.split("T")[0];
  const p = day.split("-");
  if (p.length !== 3) return iso;
  return `${p[0]}/${p[1]}/${p[2]}`;
}

type PptxSlide = ReturnType<InstanceType<typeof pptxgen>["addSlide"]>;

function addSlideFooter(slide: PptxSlide, data: InspectionData, extra?: string): void {
  const line = [extra, `${data.date}`, data.hospital || "—"].filter(Boolean).join("   •   ");
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

export async function downloadInspectionPptx(raw: InspectionData): Promise<void> {
  const data = normalizeInspectionData(raw);
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_16x9";
  pptx.rtlMode = true;
  pptx.author = "الإدارة التنفيذية للطب الوقائي";
  pptx.title = data.hospital?.trim() || "تقرير جولة تفتيشية";
  pptx.subject = "جولة — امتثال IPC (RTL)";

  const metrics = calculateGlobalMetrics(data);
  const sections = getActiveSections(data);
  const logoB64 = await fetchPublicImageAsPptxBase64(MHC_LOGO_PATH);
  const coverBgB64 = await fetchPublicImageAsPptxBase64(PPTX_COVER_BG_PATH);
  const closingBgB64 = await fetchPublicImageAsPptxBase64(PPTX_CLOSING_BG_PATH);

  const coverTitle = resolveCoverTitle(data);
  const title = pptx.addSlide();
  if (coverBgB64) {
    title.background = { data: coverBgB64 };
    title.addShape(pptx.ShapeType.roundRect, {
      x: COVER_BLOCK_X - 0.04,
      y: COVER_BACK_Y,
      w: COVER_BLOCK_W + 0.1,
      h: COVER_BACK_H,
      fill: { color: "0f172a", transparency: 42 },
      line: { width: 0 },
      rectRadius: 0.14,
    });
    title.addText(coverTitle, {
      x: COVER_BLOCK_X,
      y: 1.12,
      w: COVER_BLOCK_W,
      h: 0.9,
      fontSize: COVER_TOP_FS,
      bold: true,
      color: "FFFFFF",
      align: "right",
      valign: "middle",
      fontFace: "Arial",
      lineSpacing: COVER_TOP_LINE_SPACING,
      ...PPTX_PARA_RTL,
    });
    const metaLines = [
      `تقرير الجولة: ${data.hospital || "—"}`,
      `التاريخ: ${gregorianSlashFromIso(data.date)}م`,
      `الامتثال: ${metrics.percentage}٪`,
    ];
    if (data.inspectors.length) {
      metaLines.push(`فريق الجولة: ${data.inspectors.join("، ")}`);
    }
    title.addText(metaLines.join("\n"), {
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
    title.background = { color: "1a3a5c" };
    if (logoB64) {
      title.addImage({
        data: logoB64,
        x: 6.85,
        y: 0.35,
        w: 2.75,
        h: 0.85,
      });
    }
    title.addText(coverTitle, {
      x: 0.5,
      y: 1.05,
      w: 9,
      h: 2.35,
      fontSize: 20,
      bold: true,
      color: "FFFFFF",
      align: "center",
      valign: "middle",
      fontFace: "Arial",
      lineSpacing: 28,
      ...PPTX_PARA_RTL,
    });
    const metaNoCover = [
      `تقرير الجولة: ${data.hospital || "—"}`,
      `التاريخ: ${gregorianSlashFromIso(data.date)}م`,
      `الامتثال: ${metrics.percentage}٪`,
    ];
    if (data.inspectors.length) {
      metaNoCover.push(`فريق الجولة: ${data.inspectors.join("، ")}`);
    }
    title.addText(metaNoCover.join("\n"), {
      x: 0.5,
      y: 3.55,
      w: 9,
      h: 1.35,
      fontSize: 15,
      bold: true,
      color: "FFFFFF",
      align: "center",
      valign: "middle",
      fontFace: "Arial",
      lineSpacing: 22,
      ...PPTX_PARA_RTL,
    });
  }

  const summary = pptx.addSlide();
  summary.background = { color: "F8FAFC" };
  summary.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 10,
    h: 0.12,
    fill: { color: ACCENT },
    line: { color: ACCENT, width: 0 },
  });
  summary.addText("ملخص الامتثال", {
    x: 0.4,
    y: 0.26,
    w: 9.2,
    h: 0.48,
    fontSize: 22,
    bold: true,
    color: "0f172a",
    align: "right",
    ...PPTX_PARA_RTL,
  });
  const summaryContext = [data.hospital?.trim() || "—", `${gregorianSlashFromIso(data.date)}م`].join("   •   ");
  summary.addText(summaryContext, {
    x: 0.4,
    y: 0.7,
    w: 9.2,
    h: 0.28,
    fontSize: 12,
    color: "64748B",
    align: "right",
    ...PPTX_PARA_RTL,
  });
  summary.addText(`الإجمالي: ${metrics.earned} / ${metrics.total}  •  ${metrics.percentage}٪`, {
    x: 0.4,
    y: 0.98,
    w: 9.2,
    h: 0.4,
    fontSize: 17,
    bold: true,
    color: "334155",
    align: "right",
    ...PPTX_PARA_RTL,
  });

  const barTrackX = 0.45;
  const barTrackY = 1.32;
  const barTrackW = 9.1;
  const barTrackH = 0.32;
  const barPct = metrics.total > 0 ? Math.max(0, Math.min(100, metrics.percentage)) : 0;
  summary.addShape(pptx.ShapeType.roundRect, {
    x: barTrackX,
    y: barTrackY,
    w: barTrackW,
    h: barTrackH,
    fill: { color: "E4E4E7" },
    line: { color: "D4D4D8", width: 0.5 },
    rectRadius: 0.08,
  });
  if (barPct > 0) {
    const fillW = (barTrackW * barPct) / 100;
    summary.addShape(pptx.ShapeType.roundRect, {
      x: barTrackX,
      y: barTrackY,
      w: fillW,
      h: barTrackH,
      fill: { color: ACCENT_LIGHT },
      line: { width: 0 },
      rectRadius: 0.08,
    });
  }

  if (metrics.total > 0 && sections.length > 0) {
    summary.addChart(
      pptx.ChartType.bar,
      [
        {
          name: "نسبة الامتثال",
          labels: sections.map((s) => truncateChartLabel(s.title, 32)),
          values: sections.map((s) => calculateSectionMetrics(s.id, data).percentage),
        },
      ],
      {
        x: 0.45,
        y: 1.72,
        w: 4.75,
        h: 3.58,
        barDir: "bar",
        chartColors: ["4472C4"],
        valAxisMaxVal: 100,
        valAxisMinVal: 0,
        catAxisLabelFontSize: 13,
        valAxisLabelFontSize: 12,
        showTitle: true,
        title: "نسب الامتثال حسب القسم",
        titleFontSize: 15,
        titleBold: true,
        showLegend: false,
        dataLabelFontSize: 12,
        showValue: true,
        valLabelFormatCode: "0",
      },
    );

    summary.addChart(
      pptx.ChartType.doughnut,
      [
        {
          name: "الإجمالي",
          labels: ["نعم", "لا"],
          values: [metrics.earned, Math.max(0, metrics.total - metrics.earned)],
        },
      ],
      {
        x: 5.32,
        y: 1.72,
        w: 4.23,
        h: 3.58,
        chartColors: ["15803D", "B91C1C"],
        showPercent: true,
        showLegend: true,
        legendPos: "b",
        legendFontSize: 14,
        showTitle: true,
        title: "توزيع الإجابات (المُقيَّمة)",
        titleFontSize: 15,
        titleBold: true,
        holeSize: 52,
        dataLabelFontSize: 13,
        dataLabelPosition: "bestFit",
      },
    );
  } else {
    summary.addText("لا توجد بنود مُقيَّمة لعرض الرسوم البيانية.", {
      x: 0.4,
      y: 1.95,
      w: 9.2,
      h: 0.55,
      fontSize: 16,
      color: "737373",
      align: "right",
      ...PPTX_PARA_RTL,
    });
  }
  addSlideFooter(summary, data);

  const headerBase = { bold: true, fontSize: 13, color: "FFFFFF" as const, fill: { color: ACCENT }, ...PPTX_PARA_RTL };
  const cellBorder = { pt: 0.5 as const, color: "E5E5E5" };

  const sectionScoreRow = (title: string, earned: number, total: number, percentage: number) => [
    [
      {
        text: `${title}\nنتيجة القسم: ${earned}/${total}  •  ${percentage}٪`,
        options: {
          colspan: 3,
          align: "right" as const,
          valign: "middle" as const,
          fill: { color: "F4F4F5" },
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

  for (const section of sections) {
    const { earned, total, percentage } = calculateSectionMetrics(section.id, data);

    const sectionIntro = pptx.addSlide();
    sectionIntro.background = { color: ACCENT };
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
    sectionIntro.addText(`نتيجة القسم: ${earned} / ${total}   •   ${percentage}%`, {
      x: 0.5,
      y: 3.35,
      w: 9,
      h: 0.55,
      fontSize: 20,
      color: "E2E8F0",
      align: "right",
      ...PPTX_PARA_RTL,
    });
    addSlideFooter(sectionIntro, data);

    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 10,
      h: 0.12,
      fill: { color: ACCENT },
      line: { color: ACCENT, width: 0 },
    });
    slide.addText(`جدول البنود — ${truncateChartLabel(section.title, 48)}`, {
      x: 0.4,
      y: 0.22,
      w: 9.2,
      h: 0.4,
      fontSize: 14,
      bold: true,
      color: ACCENT,
      align: "right",
      ...PPTX_PARA_RTL,
    });

    const tableRows = [
      [
        { text: "ملاحظة", options: { ...headerBase, align: "right" as const } },
        { text: "التقييم", options: { ...headerBase, align: "center" as const } },
        { text: "البند", options: { ...headerBase, align: "right" as const } },
      ],
      ...sectionScoreRow(section.title, earned, total, percentage),
      ...section.questions.map((q) => {
        const note = data.itemNotes[q.id]?.trim() || "—";
        const ans = scoreLabel(data, q.id);
        const ansColor = ans === "نعم" ? ("15803D" as const) : ans === "لا" ? ("B91C1C" as const) : ("525252" as const);
        return [
          {
            text: note,
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
            text: q.text,
            options: { fontSize: 13, align: "right" as const, valign: "top" as const, border: cellBorder, ...PPTX_PARA_RTL },
          },
        ];
      }),
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
    addSlideFooter(slide, data, `${percentage}%`);
  }

  for (const section of sections) {
    const note = data.sectionNotes[section.id]?.trim();
    const imgs = data.sectionImages[section.id] ?? [];
    if (!note && imgs.length === 0) continue;
    const slide = pptx.addSlide();
    slide.background = { color: "F5F5F5" };
    slide.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 10,
      h: 0.12,
      fill: { color: ACCENT },
      line: { color: ACCENT, width: 0 },
    });
    slide.addText(section.title, {
      x: 0.4,
      y: 0.4,
      w: 9.2,
      h: 0.52,
      fontSize: 20,
      bold: true,
      color: "171717",
      align: "right",
      ...PPTX_PARA_RTL,
    });
    if (note) {
      slide.addText(note, {
        x: 0.4,
        y: 1,
        w: 9.2,
        h: 2,
        fontSize: 16,
        color: "404040",
        align: "right",
        valign: "top",
        ...PPTX_PARA_RTL,
      });
    }
    imgs.slice(0, 2).forEach((src, i) => {
      try {
        slide.addImage({
          data: dataUrlToPptxBase64(src),
          x: 0.4 + i * 4.7,
          y: note ? 3.1 : 1.1,
          w: 4.5,
          h: 2.5,
        });
      } catch {
        /* skip bad image data */
      }
    });
    addSlideFooter(slide, data);
  }

  const end = pptx.addSlide();
  if (closingBgB64) {
    end.background = { data: closingBgB64 };
  } else {
    end.background = { color: "1e3a5f" };
    end.addText("وشكراً لكم", {
      x: 0.4,
      y: 2.35,
      w: 9.2,
      h: 0.85,
      fontSize: 36,
      bold: true,
      color: "FFFFFF",
      align: "center",
      fontFace: "Arial",
      ...PPTX_PARA_RTL,
    });
    end.addText("تجمع المدينة المنورة الصحي — @Med_Cluster", {
      x: 0.4,
      y: 3.25,
      w: 9.2,
      h: 0.65,
      fontSize: 16,
      color: "E2E8F0",
      align: "center",
      fontFace: "Arial",
      ...PPTX_PARA_RTL,
    });
  }

  await pptx.writeFile({
    fileName: `${safeExportBase(data)}.pptx`,
  });
}

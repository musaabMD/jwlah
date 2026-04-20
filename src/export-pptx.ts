import pptxgen from "pptxgenjs";
import { MHC_LOGO_PATH } from "./branding";
import { InspectionData } from "./types";
import {
  calculateGlobalMetrics,
  calculateSectionMetrics,
  getActiveSections,
  safeExportBase,
} from "./inspection-utils";
import { dataUrlToPptxBase64, fetchPublicImageAsPptxBase64 } from "./export-helpers";

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
  });
}

export async function downloadInspectionPptx(data: InspectionData): Promise<void> {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_16x9";
  pptx.rtlMode = true;
  pptx.author = "الإدارة التنفيذية للطب الوقائي";

  const metrics = calculateGlobalMetrics(data);
  const sections = getActiveSections(data);
  const logoB64 = await fetchPublicImageAsPptxBase64(MHC_LOGO_PATH);

  const title = pptx.addSlide();
  title.background = { color: "FAFAFA" };
  title.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 10,
    h: 0.2,
    fill: { color: ACCENT },
    line: { color: ACCENT, width: 0 },
  });
  if (logoB64) {
    title.addImage({
      data: logoB64,
      x: 6.85,
      y: 0.42,
      w: 2.75,
      h: 0.85,
    });
  }
  title.addText("جولة إشرافية — موسم الحج 1447هـ", {
    x: 0.4,
    y: logoB64 ? 1.25 : 0.45,
    w: 9.2,
    h: 0.5,
    fontSize: 16,
    color: ACCENT_LIGHT,
    align: "right",
  });
  title.addText(data.hospital || "—", {
    x: 0.4,
    y: logoB64 ? 1.75 : 1.05,
    w: 9.2,
    h: 1.05,
    fontSize: 34,
    bold: true,
    color: "171717",
    align: "right",
  });
  title.addText(`التاريخ: ${data.date}   •   الامتثال: ${metrics.percentage}%`, {
    x: 0.4,
    y: logoB64 ? 2.95 : 2.45,
    w: 9.2,
    h: 0.5,
    fontSize: 18,
    color: "404040",
    align: "right",
  });
  if (data.inspectors.length) {
    title.addText(`فريق الجولة: ${data.inspectors.join("، ")}`, {
      x: 0.4,
      y: logoB64 ? 3.45 : 3.05,
      w: 9.2,
      h: 0.6,
      fontSize: 15,
      color: "737373",
      align: "right",
    });
  }
  addSlideFooter(title, data, `الامتثال ${metrics.percentage}%`);

  const summary = pptx.addSlide();
  summary.background = { color: "FFFFFF" };
  summary.addShape(pptx.ShapeType.rect, {
    x: 8.85,
    y: 0.28,
    w: 0.12,
    h: 4.9,
    fill: { color: ACCENT },
    line: { color: ACCENT, width: 0 },
  });
  summary.addText("ملخص الامتثال", {
    x: 0.4,
    y: 0.32,
    w: 9.2,
    h: 0.52,
    fontSize: 22,
    bold: true,
    color: "171717",
    align: "right",
  });
  summary.addText(`الإجمالي: ${metrics.earned} / ${metrics.total}  •  ${metrics.percentage}٪`, {
    x: 0.4,
    y: 0.82,
    w: 9.2,
    h: 0.42,
    fontSize: 17,
    color: "404040",
    align: "right",
  });

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
        x: 0.4,
        y: 1.15,
        w: 4.85,
        h: 4.05,
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
          values: [metrics.earned, metrics.total - metrics.earned],
        },
      ],
      {
        x: 5.35,
        y: 1.15,
        w: 4.25,
        h: 3.75,
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
      y: 1.6,
      w: 9.2,
      h: 0.55,
      fontSize: 16,
      color: "737373",
      align: "right",
    });
  }
  addSlideFooter(summary, data);

  const headerBase = { bold: true, fontSize: 13, color: "FFFFFF" as const, fill: { color: ACCENT } };
  const cellBorder = { pt: 0.5 as const, color: "E5E5E5" };

  const sectionScoreRow = (title: string, earned: number, total: number, percentage: number) => [
    [
      {
        text: `${title}\nنتيجة القسم: ${earned}/${total}  •  ${percentage}%`,
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
    });
    sectionIntro.addText(`نتيجة القسم: ${earned} / ${total}   •   ${percentage}%`, {
      x: 0.5,
      y: 3.35,
      w: 9,
      h: 0.55,
      fontSize: 20,
      color: "E2E8F0",
      align: "right",
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
    });

    const tableRows = [
      [
        { text: "البند", options: { ...headerBase, align: "right" as const } },
        { text: "التقييم", options: { ...headerBase, align: "center" as const } },
        { text: "ملاحظة", options: { ...headerBase, align: "right" as const } },
      ],
      ...sectionScoreRow(section.title, earned, total, percentage),
      ...section.questions.map((q) => {
        const note = data.itemNotes[q.id]?.trim() || "—";
        const ans = scoreLabel(data, q.id);
        const ansColor = ans === "نعم" ? ("15803D" as const) : ans === "لا" ? ("B91C1C" as const) : ("525252" as const);
        return [
          {
            text: q.text,
            options: { fontSize: 13, align: "right" as const, valign: "top" as const, border: cellBorder },
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
            },
          },
          {
            text: note,
            options: {
              fontSize: 12,
              color: "525252",
              align: "right" as const,
              valign: "top" as const,
              border: cellBorder,
            },
          },
        ];
      }),
    ];

    slide.addTable(tableRows, {
      x: 0.4,
      y: 0.72,
      w: 9.2,
      colW: [6.1, 1.15, 1.95],
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
  end.background = { color: "FAFAFA" };
  if (logoB64) {
    end.addImage({
      data: logoB64,
      x: 3.625,
      y: 1.35,
      w: 2.75,
      h: 0.85,
    });
  }
  end.addText("شكراً لكم", {
    x: 0.4,
    y: 2.35,
    w: 9.2,
    h: 0.85,
    fontSize: 36,
    bold: true,
    color: "171717",
    align: "center",
  });
  end.addText("تجمع المدينة المنورة الصحي — الإدارة التنفيذية للطب الوقائي", {
    x: 0.4,
    y: 3.25,
    w: 9.2,
    h: 0.65,
    fontSize: 16,
    color: "525252",
    align: "center",
  });
  addSlideFooter(end, data);

  await pptx.writeFile({ fileName: `${safeExportBase(data)}.pptx` });
}

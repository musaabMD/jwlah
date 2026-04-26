import pptxgen from "pptxgenjs";
import { MHC_LOGO_PATH } from "./branding";
import { calculateReportMakerScore, type ReportMakerData, safeReportMakerFileBase } from "./report-maker-types";
import { dataUrlToPptxBase64, fetchPublicImageAsPptxBase64 } from "./export-helpers";
import { PPTX_PARA_RTL } from "./pptx-rtl-opts";

const ACCENT = "0f172a";

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

function truncateCell(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export async function downloadReportMakerPptx(raw: ReportMakerData): Promise<void> {
  const { checked, total, percentage } = calculateReportMakerScore(raw);
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_16x9";
  pptx.rtlMode = true;
  pptx.author = raw.inspectors?.length ? raw.inspectors.join("، ") : "صانع التقرير";
  pptx.title = raw.title?.trim() || "تقرير";
  pptx.subject = "تقرير — قائمة تحقق (RTL)";

  const logoB64 = await fetchPublicImageAsPptxBase64(MHC_LOGO_PATH);

  const cover = pptx.addSlide();
  cover.background = { color: "1a3a5c" };
  if (logoB64) {
    cover.addImage({
      data: logoB64,
      x: 6.85,
      y: 0.35,
      w: 2.75,
      h: 0.85,
    });
  }
  cover.addText(raw.title || "تقرير", {
    x: 0.5,
    y: 1.35,
    w: 9,
    h: 0.9,
    fontSize: 28,
    bold: true,
    color: "FFFFFF",
    align: "center",
    fontFace: "Arial",
    ...PPTX_PARA_RTL,
  });
  const metaLines = [
    raw.facility?.trim() ? `المنشأة: ${raw.facility.trim()}` : null,
    raw.inspectors?.length ? `المكلفون: ${raw.inspectors.join("، ")}` : null,
    `التاريخ: ${gregorianSlashFromIso(raw.date)}م`,
    total > 0 ? `الإنجاز (جميع البنود): ${checked} / ${total}  •  ${percentage}٪` : "لا توجد بنود في القائمة",
  ].filter(Boolean) as string[];
  cover.addText(metaLines.join("\n"), {
    x: 0.5,
    y: 2.55,
    w: 9,
    h: 1.4,
    fontSize: 16,
    bold: true,
    color: "E2E8F0",
    align: "center",
    valign: "middle",
    fontFace: "Arial",
    lineSpacing: 24,
    ...PPTX_PARA_RTL,
  });
  addFooter(cover, raw);

  const applicable = raw.items;
  const tableSlide = pptx.addSlide();
  tableSlide.background = { color: "FFFFFF" };
  tableSlide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 10,
    h: 0.12,
    fill: { color: ACCENT },
    line: { color: ACCENT, width: 0 },
  });
  tableSlide.addText("قائمة التحقق والتقييم التلقائي", {
    x: 0.4,
    y: 0.22,
    w: 9.2,
    h: 0.42,
    fontSize: 16,
    bold: true,
    color: ACCENT,
    align: "right",
    ...PPTX_PARA_RTL,
  });
  tableSlide.addText(total > 0 ? `${checked} من ${total} مكتمل  •  ${percentage}٪` : "لا توجد بنود", {
    x: 0.4,
    y: 0.62,
    w: 9.2,
    h: 0.32,
    fontSize: 13,
    color: "525252",
    align: "right",
    ...PPTX_PARA_RTL,
  });

  const headerBase = { bold: true, fontSize: 11, color: "FFFFFF" as const, fill: { color: ACCENT }, ...PPTX_PARA_RTL };
  const cellBorder = { pt: 0.5 as const, color: "E5E5E5" };

  const tableRows = [
    [
      { text: "البند", options: { ...headerBase, align: "right" as const } },
      { text: "✓", options: { ...headerBase, align: "center" as const, w: 0.75 } },
      { text: "ملاحظة", options: { ...headerBase, align: "right" as const } },
    ],
    ...(applicable.length > 0
      ? applicable.map((it) => [
          {
            text: truncateCell(it.text, 420),
            options: { fontSize: 10, align: "right" as const, valign: "middle" as const, border: cellBorder, ...PPTX_PARA_RTL },
          },
          {
            text: it.checked ? "✓" : "—",
            options: {
              fontSize: 13,
              bold: true,
              color: it.checked ? ("15803D" as const) : ("737373" as const),
              align: "center" as const,
              valign: "middle" as const,
              border: cellBorder,
              ...PPTX_PARA_RTL,
            },
          },
          {
            text: truncateCell(it.note.trim() || "—", 220),
            options: { fontSize: 10, align: "right" as const, valign: "middle" as const, border: cellBorder, ...PPTX_PARA_RTL },
          },
        ])
      : [
          [
            {
              text: "لا توجد بنود.",
              options: { colspan: 3, fontSize: 14, align: "right" as const, color: "737373", border: cellBorder, ...PPTX_PARA_RTL },
            },
          ],
        ]),
  ];

  tableSlide.addTable(tableRows, {
    x: 0.4,
    y: 1.05,
    w: 9.2,
    colW: [5.85, 0.75, 2.6],
    border: { pt: 0.5, color: "E5E5E5" },
    fontSize: 12,
    autoPage: true,
    autoPageRepeatHeader: true,
    autoPageHeaderRows: 1,
    autoPageSlideStartY: 0.72,
  });
  addFooter(tableSlide, raw);

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
  end.background = { color: "1e3a5f" };
  end.addText("شكراً", {
    x: 0.4,
    y: 2.35,
    w: 9.2,
    h: 0.75,
    fontSize: 32,
    bold: true,
    color: "FFFFFF",
    align: "center",
    fontFace: "Arial",
    ...PPTX_PARA_RTL,
  });
  end.addText("تجمع المدينة المنورة الصحي", {
    x: 0.4,
    y: 3.2,
    w: 9.2,
    h: 0.5,
    fontSize: 14,
    color: "E2E8F0",
    align: "center",
    ...PPTX_PARA_RTL,
  });
  addFooter(end, raw);

  await pptx.writeFile({
    fileName: `${safeReportMakerFileBase(raw)}.pptx`,
  });
}

import pptxgen from "pptxgenjs";
import { InspectionData } from "./types";
import {
  calculateGlobalMetrics,
  flattenQuestionSlides,
  getActiveSections,
  safeExportBase,
} from "./inspection-utils";

function dataUrlToBase64(src: string): string {
  const i = src.indexOf(",");
  return i >= 0 ? src.slice(i + 1) : src;
}

function scoreLabel(data: InspectionData, qid: string): string {
  const s = data.scores[qid];
  if (s === "yes") return "نعم";
  if (s === "no") return "لا";
  if (s === "na") return "غير applicable";
  return "—";
}

export async function downloadInspectionPptx(data: InspectionData): Promise<void> {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_16x9";
  pptx.author = "الإدارة التنفيذية للطب الوقائي";

  const metrics = calculateGlobalMetrics(data);
  const slides = flattenQuestionSlides(data);

  const title = pptx.addSlide();
  title.background = { color: "FAFAFA" };
  title.addText("جولة إشرافية — موسم الحج 1447هـ", {
    x: 0.4,
    y: 0.35,
    w: 9.2,
    h: 0.45,
    fontSize: 12,
    color: "525252",
    align: "right",
  });
  title.addText(data.hospital || "—", {
    x: 0.4,
    y: 1,
    w: 9.2,
    h: 1.2,
    fontSize: 32,
    bold: true,
    color: "171717",
    align: "right",
  });
  title.addText(`التاريخ: ${data.date}   •   الامتثال: ${metrics.percentage}%`, {
    x: 0.4,
    y: 2.35,
    w: 9.2,
    h: 0.5,
    fontSize: 14,
    color: "404040",
    align: "right",
  });
  if (data.inspectors.length) {
    title.addText(`المفتشون: ${data.inspectors.join("، ")}`, {
      x: 0.4,
      y: 2.95,
      w: 9.2,
      h: 0.6,
      fontSize: 12,
      color: "737373",
      align: "right",
    });
  }

  for (const item of slides) {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.addText(`${item.globalIndex} / ${item.totalQuestions}`, {
      x: 0.4,
      y: 0.35,
      w: 2,
      h: 0.35,
      fontSize: 11,
      color: "A3A3A3",
      align: "left",
    });
    slide.addText(item.sectionTitle, {
      x: 0.4,
      y: 0.65,
      w: 9.2,
      h: 0.45,
      fontSize: 13,
      color: "4F46E5",
      align: "right",
    });
    slide.addText(item.question.text, {
      x: 0.4,
      y: 1.25,
      w: 9.2,
      h: 2.8,
      fontSize: 22,
      bold: true,
      color: "171717",
      align: "right",
      valign: "top",
    });
    const ans = scoreLabel(data, item.question.id);
    slide.addText(`التقييم: ${ans}`, {
      x: 0.4,
      y: 4.35,
      w: 9.2,
      h: 0.45,
      fontSize: 16,
      color: ans === "نعم" ? "15803D" : ans === "لا" ? "B91C1C" : "525252",
      bold: true,
      align: "right",
    });
    const note = data.itemNotes[item.question.id]?.trim();
    if (note) {
      slide.addText(`ملاحظة: ${note}`, {
        x: 0.4,
        y: 4.85,
        w: 9.2,
        h: 1.2,
        fontSize: 12,
        color: "525252",
        align: "right",
        valign: "top",
      });
    }
  }

  for (const section of getActiveSections(data)) {
    const note = data.sectionNotes[section.id]?.trim();
    const imgs = data.sectionImages[section.id] ?? [];
    if (!note && imgs.length === 0) continue;
    const slide = pptx.addSlide();
    slide.background = { color: "F5F5F5" };
    slide.addText(section.title, {
      x: 0.4,
      y: 0.4,
      w: 9.2,
      h: 0.5,
      fontSize: 18,
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
        fontSize: 14,
        color: "404040",
        align: "right",
        valign: "top",
      });
    }
    imgs.slice(0, 2).forEach((src, i) => {
      try {
        slide.addImage({
          data: dataUrlToBase64(src),
          x: 0.4 + i * 4.7,
          y: note ? 3.1 : 1.1,
          w: 4.5,
          h: 2.5,
        });
      } catch {
        /* skip bad image data */
      }
    });
  }

  const end = pptx.addSlide();
  end.background = { color: "FAFAFA" };
  end.addText("شكراً لكم", {
    x: 0.4,
    y: 2.2,
    w: 9.2,
    h: 1,
    fontSize: 36,
    bold: true,
    color: "171717",
    align: "center",
  });
  end.addText("الإدارة التنفيذية للطب الوقائي", {
    x: 0.4,
    y: 3.3,
    w: 9.2,
    h: 0.5,
    fontSize: 14,
    color: "525252",
    align: "center",
  });

  await pptx.writeFile({ fileName: `${safeExportBase(data)}.pptx` });
}

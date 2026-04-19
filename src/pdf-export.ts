import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { inlineImagesForPdfCapture } from "./export-helpers";

/** html2canvas output is capped per edge; oversize canvases fail or break toDataURL. */
const CANVAS_MAX_EDGE = 8000;

/**
 * html2canvas parses cloned stylesheets and throws on Tailwind v4's `oklch(...)`.
 * The browser already resolves cascade to concrete values in `getComputedStyle`.
 * We inline the full computed style for each node from the **live** tree, then drop author
 * stylesheets on the clone so the renderer never tokenizes oklch.
 */
function applyFullComputedStyles(originalRoot: HTMLElement, cloneRoot: HTMLElement): void {
  const origWalker = document.createTreeWalker(originalRoot, NodeFilter.SHOW_ELEMENT);
  const cloneWalker = cloneRoot.ownerDocument!.createTreeWalker(cloneRoot, NodeFilter.SHOW_ELEMENT);

  let origEl = origWalker.nextNode() as Element | null;
  let cloneEl = cloneWalker.nextNode() as Element | null;

  while (origEl && cloneEl) {
    const style = (cloneEl as HTMLElement | SVGElement).style;
    if (style) {
      const cs = getComputedStyle(origEl);
      for (let i = 0; i < cs.length; i++) {
        const prop = cs.item(i);
        try {
          style.setProperty(prop, cs.getPropertyValue(prop), cs.getPropertyPriority(prop));
        } catch {
          /* skip properties the clone cannot take */
        }
      }
    }
    origEl = origWalker.nextNode() as Element | null;
    cloneEl = cloneWalker.nextNode() as Element | null;
  }
}

function stripAuthorStylesheets(doc: Document): void {
  doc.querySelectorAll('link[rel="stylesheet"]').forEach((n) => n.remove());
  doc.querySelectorAll("style").forEach((n) => n.remove());
}

function html2canvasOptions(scale: number, original: HTMLElement): Parameters<typeof html2canvas>[1] {
  return {
    scale,
    useCORS: true,
    allowTaint: false,
    logging: false,
    backgroundColor: "#ffffff",
    scrollX: 0,
    scrollY: 0,
    foreignObjectRendering: false,
    onclone: (doc, cloneRoot) => {
      applyFullComputedStyles(original, cloneRoot);
      stripAuthorStylesheets(doc);
    },
  };
}

function pickScale(el: HTMLElement, preferred: number): number {
  const maxDim = Math.max(el.scrollWidth, el.scrollHeight, 1);
  const maxAllowed = (CANVAS_MAX_EDGE * 0.92) / maxDim;
  return Math.min(preferred, maxAllowed);
}

async function captureChunk(el: HTMLElement, preferredScale: number): Promise<HTMLCanvasElement> {
  const scale = pickScale(el, preferredScale);
  const canvas = await html2canvas(el, html2canvasOptions(scale, el));
  try {
    canvas.toDataURL("image/jpeg", 0.88);
  } catch {
    if (scale > 1) {
      return html2canvas(el, html2canvasOptions(1, el));
    }
    throw new Error("canvas_export");
  }
  return canvas;
}

function appendCanvasAcrossPages(
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  imgWidth: number,
  margin: number,
  pageHeight: number,
  startOnNewPage: boolean,
): void {
  const usableH = pageHeight - margin * 2;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const imgData = canvas.toDataURL("image/jpeg", 0.88);

  let heightLeft = imgHeight;
  let position = margin;
  let first = true;

  while (heightLeft > 0) {
    if (first && startOnNewPage) {
      pdf.addPage();
    }
    if (!first) {
      pdf.addPage();
    }
    first = false;
    pdf.addImage(imgData, "JPEG", margin, position, imgWidth, imgHeight, undefined, "FAST");
    heightLeft -= usableH;
    position -= usableH;
  }
}

/**
 * Renders `[data-pdf-chunk]` nodes separately so no single canvas exceeds browser limits.
 */
export async function downloadInspectionReportPdf(reportRoot: HTMLElement, fileBase: string): Promise<void> {
  await document.fonts.ready;
  await inlineImagesForPdfCapture(reportRoot);

  const chunks = Array.from(reportRoot.querySelectorAll<HTMLElement>("[data-pdf-chunk]"));
  if (chunks.length === 0) {
    throw new Error("missing_pdf_chunks");
  }

  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const imgWidth = pageWidth - margin * 2;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunk.offsetHeight < 2 && chunk.scrollHeight < 2) continue;

    let canvas: HTMLCanvasElement;
    try {
      canvas = await captureChunk(chunk, 1.85);
    } catch {
      canvas = await captureChunk(chunk, 1);
    }

    appendCanvasAcrossPages(pdf, canvas, imgWidth, margin, pageHeight, i > 0);
  }

  pdf.save(`${fileBase}.pdf`);
}

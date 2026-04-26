/**
 * PptxGenJS: set on each `addText` / table cell so PowerPoint marks paragraphs as RTL
 * (presentation `rtlMode` alone is not always enough for mixed or table text).
 */
export const PPTX_PARA_RTL = { rtlMode: true as const };

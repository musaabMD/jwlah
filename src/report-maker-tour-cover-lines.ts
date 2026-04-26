import type { ReportMakerData } from "./report-maker-types";
import { calculateReportMakerScore } from "./report-maker-types";

function gregorianSlashFromIso(iso: string): string {
  if (!iso?.trim()) return "—";
  const day = iso.split("T")[0];
  const p = day.split("-");
  if (p.length !== 3) return iso;
  return `${p[0]}/${p[1]}/${p[2]}`;
}

/** Main heading on the tour cover (editable in البيانات). */
export function reportMakerTourCoverTitle(data: ReportMakerData): string {
  const t = data.title?.trim();
  return t || "تقرير جولة تفتيشية";
}

/** Four meta lines under the title (matches جولة التفتيش / PPT غلاف). */
export function buildReportMakerTourCoverLines(data: ReportMakerData): string[] {
  const { percentage, total } = calculateReportMakerScore(data);
  const compliance = total > 0 ? `الامتثال: ${percentage}٪` : "الامتثال: —";
  const team = data.inspectors.length ? `فريق الجولة: ${data.inspectors.join("، ")}` : "فريق الجولة: —";
  return [
    `تقرير الجولة: ${data.facility?.trim() || "—"}`,
    `التاريخ: ${gregorianSlashFromIso(data.date)}م`,
    compliance,
    team,
  ];
}

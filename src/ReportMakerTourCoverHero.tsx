import React from "react";
import { REPORT_MAKER_TOUR_COVER_BG_PATH } from "./branding";
import { buildReportMakerTourCoverLines, reportMakerTourCoverTitle } from "./report-maker-tour-cover-lines";
import type { ReportMakerData } from "./report-maker-types";

type Props = {
  data: ReportMakerData;
  /** Optional extra classes on the outer 16:9 frame. */
  className?: string;
};

export function ReportMakerTourCoverHero({ data, className = "" }: Props) {
  const title = reportMakerTourCoverTitle(data);
  const lines = buildReportMakerTourCoverLines(data);
  const shell =
    "relative aspect-video w-full overflow-hidden rounded-xl border border-zinc-200 shadow-inner";

  return (
    <div className={`${shell} ${className}`.trim()} dir="rtl">
      <img
        src={REPORT_MAKER_TOUR_COVER_BG_PATH}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        referrerPolicy="no-referrer"
      />
      <div className="absolute inset-0 p-3 sm:p-6">
        <div
          className="absolute left-3 top-1/2 w-[min(92%,22rem)] -translate-y-1/2 rounded-xl border border-white/10 bg-slate-950/45 px-4 py-3 shadow-lg backdrop-blur-[2px] sm:left-6 sm:max-w-[min(88%,26rem)] sm:px-5 sm:py-4"
          dir="rtl"
        >
          <p className="mb-2 text-center text-base font-bold leading-snug text-white [unicode-bidi:plaintext] sm:text-lg" dir="auto">
            {title}
          </p>
          <div className="space-y-1.5 text-end sm:space-y-2">
            {lines.map((line, i) => (
              <p
                key={i}
                className="text-xs font-semibold leading-snug text-slate-100 [unicode-bidi:plaintext] sm:text-sm"
                dir="auto"
              >
                {line}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

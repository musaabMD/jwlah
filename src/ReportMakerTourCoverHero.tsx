import React from "react";
import { REPORT_MAKER_TOUR_COVER_BG_PATH } from "./branding";
import { buildReportMakerTourCoverLines } from "./report-maker-tour-cover-lines";
import type { ReportMakerData } from "./report-maker-types";

type Props = {
  data: ReportMakerData;
  /** Optional extra classes on the outer 16:9 frame. */
  className?: string;
};

export function ReportMakerTourCoverHero({ data, className = "" }: Props) {
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
      <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-5">
        <div className="max-w-[92%] rounded-xl border border-white/10 bg-black/40 px-4 py-3 shadow-lg backdrop-blur-[2px] sm:max-w-[85%] sm:px-6 sm:py-4">
          <div className="space-y-1.5 text-center sm:space-y-2">
            {lines.map((line, i) => (
              <p
                key={i}
                className={`text-white [unicode-bidi:plaintext] ${
                  i === 0 ? "text-sm font-bold sm:text-base" : "text-xs font-semibold leading-snug text-white/95 sm:text-sm"
                }`}
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

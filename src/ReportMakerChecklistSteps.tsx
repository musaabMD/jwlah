import React, { useMemo, useState, useCallback, ChangeEvent } from "react";
import { ChevronDown, ImagePlus, XCircle } from "lucide-react";
import { MHC_LOGO_PATH } from "./branding";
import { SECTIONS } from "./constants";
import { buildReportMakerTourCoverLines, reportMakerTourCoverTitle } from "./report-maker-tour-cover-lines";
import type { ReportMakerData } from "./report-maker-types";

const ACCENTS = ["#1a6b3c", "#b5451b", "#1a4b8c", "#7b2d8b", "#8b6914"] as const;

type Props = {
  data: ReportMakerData;
  setData: React.Dispatch<React.SetStateAction<ReportMakerData>>;
  onItemImageUpload: (itemId: string, e: ChangeEvent<HTMLInputElement>) => void;
  onRemoveItemImage: (itemId: string, imgIndex: number) => void;
  /** Tighter layout when embedded in the PPT review panel */
  compact?: boolean;
  /** When set, only this section is shown and section tabs are hidden (e.g. per-slide PPT editing). */
  onlySectionId?: string;
};

function sectionMetrics(
  sec: (typeof SECTIONS)[number],
  itemById: Map<string, { checked: boolean }>,
): { checked: number; total: number; pct: number } {
  let checked = 0;
  let total = 0;
  for (const q of sec.questions) {
    const it = itemById.get(q.id);
    if (!it) continue;
    total += 1;
    if (it.checked) checked += 1;
  }
  return { checked, total, pct: total === 0 ? 0 : Math.round((checked / total) * 100) };
}

export function ReportMakerChecklistSteps({
  data,
  setData,
  onItemImageUpload,
  onRemoveItemImage,
  compact = false,
  onlySectionId,
}: Props) {
  const [internalSectionId, setInternalSectionId] = useState(() => SECTIONS[0]?.id ?? "");
  const activeSectionId = onlySectionId ?? internalSectionId;
  const [openItemIds, setOpenItemIds] = useState<Record<string, boolean>>({});
  const [includedSections, setIncludedSections] = useState<Record<string, boolean>>({});

  const itemById = useMemo(() => new Map(data.items.map((it) => [it.id, it] as const)), [data.items]);

  const activeSection = SECTIONS.find((s) => s.id === activeSectionId) ?? SECTIONS[0];
  const sectionIndex = Math.max(0, SECTIONS.findIndex((s) => s.id === activeSection?.id));
  const accent = ACCENTS[sectionIndex % ACCENTS.length];
  const { checked, total, pct } = useMemo(
    () => (activeSection ? sectionMetrics(activeSection, itemById) : { checked: 0, total: 0, pct: 0 }),
    [activeSection, itemById],
  );

  const scoreColor = pct >= 80 ? "#1a6b3c" : pct >= 50 ? "#b5851b" : "#b5451b";
  const isActiveSectionIncluded = includedSections[activeSectionId] !== false;

  const toggleOpen = useCallback((itemId: string) => {
    setOpenItemIds((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  }, []);

  const toggleSectionIncluded = useCallback((sectionId: string) => {
    setIncludedSections((prev) => ({ ...prev, [sectionId]: prev[sectionId] === false }));
  }, []);

  const goToAdjacentSection = useCallback(
    (dir: 1 | -1) => {
      const idx = Math.max(0, SECTIONS.findIndex((s) => s.id === activeSectionId));
      const nextIdx = Math.min(SECTIONS.length - 1, Math.max(0, idx + dir));
      setInternalSectionId(SECTIONS[nextIdx]?.id ?? internalSectionId);
    },
    [activeSectionId, internalSectionId],
  );

  const toggleCheck = useCallback(
    (itemId: string) => {
      const row = data.items.find((r) => r.id === itemId);
      const nextChecked = !row?.checked;
      setData((prev) => ({
        ...prev,
        items: prev.items.map((r) => (r.id === itemId ? { ...r, checked: Boolean(nextChecked) } : r)),
      }));
      if (nextChecked) setOpenItemIds((prev) => ({ ...prev, [itemId]: true }));
    },
    [data.items, setData],
  );

  const tourCoverTitle = useMemo(() => reportMakerTourCoverTitle(data), [data]);
  const tourLines = useMemo(() => buildReportMakerTourCoverLines(data), [data]);
  const padMain = compact ? "px-3 py-3" : "px-4 py-4 sm:px-6 sm:py-5";

  const sidebar = (
    <aside
      className={`flex shrink-0 flex-col justify-between border-white/10 bg-gradient-to-b from-[#3b82f6] via-[#1e40af] to-[#0f172a] text-white ${
        compact
          ? "border-b px-4 py-3 lg:w-[min(30%,14rem)] lg:border-b-0 lg:border-e lg:py-6"
          : "border-b px-5 py-5 lg:w-[min(32%,20rem)] lg:border-b-0 lg:border-e lg:py-8"
      }`}
    >
      <div className="space-y-2.5">
        {compact || onlySectionId ? (
          <>
            <p className="text-[10px] font-medium text-white/70">القسم الحالي</p>
            <p className="text-sm font-bold leading-snug text-white">{activeSection?.title}</p>
            <p className="text-xs font-semibold tabular-nums text-white/90">
              نتيجة القسم: {checked} / {total} • {pct}٪
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-bold leading-snug text-white [unicode-bidi:plaintext]">{tourCoverTitle}</p>
            {tourLines.map((line, i) => (
              <p key={i} className="text-[11px] font-semibold leading-snug text-white/95 [unicode-bidi:plaintext] sm:text-xs" dir="auto">
                {line}
              </p>
            ))}
          </>
        )}
      </div>
      {!compact && !onlySectionId ? (
        <p className="mt-6 hidden text-[10px] leading-relaxed text-white/50 lg:block">تجمع المدينة المنورة الصحي</p>
      ) : null}
    </aside>
  );

  return (
    <div
      dir="rtl"
      className={`overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-md ${compact ? "text-[13px]" : ""}`}
    >
      <div
        className={`flex min-h-0 flex-col-reverse lg:min-h-[420px] lg:flex-row ${compact ? "max-h-[min(70vh,560px)]" : ""}`}
      >
        {/* RTL + lg: صف — أولاً المنطقة البيضاء (يمين)، ثم الشريط المتدرج (يسار). على الشاشات الضيقة: الشريط أعلى */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
          <div className={`border-b border-zinc-100 ${padMain} pb-3`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-zinc-900">بنود الفحص</h2>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500" title={activeSection?.title}>
                  {activeSection?.title}
                </p>
              </div>
              <img src={MHC_LOGO_PATH} alt="" className="h-9 w-auto shrink-0 object-contain opacity-95 sm:h-10" />
            </div>
            <div
              className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-100"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full transition-[width] duration-300 ease-out"
                style={{ width: `${pct}%`, backgroundColor: accent }}
              />
            </div>
            <div
              className="mt-2 flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 tabular-nums"
              style={{ borderColor: `${scoreColor}33`, background: `${scoreColor}0d` }}
            >
              <span className="text-lg font-extrabold leading-none" style={{ color: scoreColor }}>
                {pct}٪
              </span>
              <span className="text-[10px] text-zinc-500">
                {checked} / {total}
              </span>
            </div>
          </div>

          {!onlySectionId ? (
            <div className="border-b border-zinc-100 px-3 py-3 sm:px-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-zinc-600">التنقل بين الأقسام (قسم واحد في كل مرة)</p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => goToAdjacentSection(-1)}
                    disabled={SECTIONS.findIndex((s) => s.id === activeSectionId) <= 0}
                    className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
                  >
                    السابق
                  </button>
                  <button
                    type="button"
                    onClick={() => goToAdjacentSection(1)}
                    disabled={SECTIONS.findIndex((s) => s.id === activeSectionId) >= SECTIONS.length - 1}
                    className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
                  >
                    التالي
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                {SECTIONS.map((sec, i) => {
                  const isActive = sec.id === activeSectionId;
                  const sm = sectionMetrics(sec, itemById);
                  const ac = ACCENTS[i % ACCENTS.length];
                  const included = includedSections[sec.id] !== false;
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => setInternalSectionId(sec.id)}
                      className={`rounded-lg border px-2.5 py-2 text-right transition ${
                        isActive ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-zinc-50/70 text-zinc-800 hover:bg-zinc-100"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] font-semibold" title={sec.title}>
                          {sec.title}
                        </span>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold tabular-nums ${
                            isActive ? "bg-white/15 text-white" : "bg-white text-zinc-600"
                          }`}
                        >
                          {sm.pct}٪
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className={`text-[10px] tabular-nums ${isActive ? "text-zinc-200" : "text-zinc-500"}`}>
                          {sm.checked}/{sm.total}
                        </span>
                        <span
                          role="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSectionIncluded(sec.id);
                          }}
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                            included
                              ? isActive
                                ? "bg-emerald-300/30 text-emerald-100"
                                : "bg-emerald-100 text-emerald-800"
                              : isActive
                                ? "bg-zinc-700 text-zinc-200"
                                : "bg-zinc-200 text-zinc-600"
                          }`}
                        >
                          {included ? "مدرج" : "متخطى"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className={`min-h-0 flex-1 overflow-y-auto ${compact ? "p-2" : "p-4 sm:p-5"}`}>
            {!activeSection ? null : !isActiveSectionIncluded ? (
              <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center">
                <p className="text-sm font-semibold text-zinc-700">تم تخطي هذا القسم</p>
                <p className="mt-1 text-[11px] text-zinc-500">يمكنك إعادة إدراجه في أي وقت من بطاقة القسم بالأعلى.</p>
              </div>
            ) : activeSection.questions.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-400">لا بنود في هذا القسم.</p>
            ) : (
              <ul className="space-y-3">
                {activeSection.questions.map((q) => {
                  const it = itemById.get(q.id);
                  if (!it) return null;
                  const open = Boolean(openItemIds[it.id]);
                  return (
                    <li
                      key={q.id}
                      className={`overflow-hidden rounded-lg border bg-white shadow-md shadow-zinc-900/[0.07] transition-shadow hover:shadow-lg ${
                        it.checked ? "border-zinc-200 shadow-lg" : "border-zinc-100"
                      }`}
                      style={
                        it.checked
                          ? { boxShadow: `0 10px 28px -8px rgba(15,23,42,0.12), 0 0 0 1px ${accent}40` }
                          : undefined
                      }
                    >
                  <div className="flex items-center gap-2.5 px-3.5 py-3">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={it.checked}
                      onClick={() => toggleCheck(it.id)}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-all"
                      style={{
                        borderColor: it.checked ? accent : "#d0ccc4",
                        background: it.checked ? accent : "#fff",
                        boxShadow: it.checked ? `0 0 0 3px ${accent}22` : undefined,
                      }}
                    >
                      {it.checked ? (
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
                          <path
                            d="M2.5 6.5L5.5 9.5L10.5 4"
                            stroke="#fff"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : null}
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleOpen(it.id)}
                      className={`min-w-0 flex-1 text-start text-sm leading-snug transition-colors [unicode-bidi:plaintext] ${
                        it.checked ? "text-zinc-400 line-through" : "text-zinc-900"
                      }`}
                    >
                      {it.text}
                    </button>

                    <div className="flex shrink-0 items-center gap-1">
                      {it.note.trim() ? (
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{ color: accent, background: `${accent}18` }}
                        >
                          ملاحظة
                        </span>
                      ) : null}
                      {it.images.length > 0 ? (
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                          {it.images.length} صورة
                        </span>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleOpen(it.id)}
                      className="shrink-0 p-1 text-zinc-400 transition-transform hover:text-zinc-600"
                      style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
                      aria-expanded={open}
                      aria-label={open ? "طيّ التفاصيل" : "عرض التفاصيل"}
                    >
                      <ChevronDown className="h-4 w-4" strokeWidth={2} />
                    </button>
                  </div>

                  {open ? (
                    <div
                      className="space-y-3 border-t px-4 py-3.5"
                      style={{ borderColor: `${accent}22`, background: "#faf9f6" }}
                    >
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold text-zinc-500">ملاحظة</label>
                        <textarea
                          dir="auto"
                          value={it.note}
                          onChange={(e) =>
                            setData((p) => ({
                              ...p,
                              items: p.items.map((row) =>
                                row.id === it.id ? { ...row, note: e.target.value } : row,
                              ),
                            }))
                          }
                          rows={3}
                          placeholder="أدخل ملاحظتك…"
                          className="w-full resize-y rounded-lg border border-[#e0dbd2] bg-white px-3 py-2 text-sm leading-relaxed outline-none transition-colors [unicode-bidi:plaintext] focus:border-opacity-100"
                          style={{ outlineColor: accent }}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold text-zinc-500">صور مرفقة</label>
                        <label
                          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed py-2.5 text-[12px] font-semibold transition-colors hover:bg-white/80"
                          style={{ borderColor: `${accent}55`, color: accent }}
                        >
                          <ImagePlus className="h-4 w-4 shrink-0" />
                          إضافة صور
                          <input
                            type="file"
                            multiple
                            accept="image/*"
                            className="hidden"
                            onChange={(ev) => onItemImageUpload(it.id, ev)}
                          />
                        </label>
                        {it.images.length > 0 ? (
                          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {it.images.map((img, idx) => (
                              <div
                                key={`${it.id}-img-${idx}`}
                                className="relative aspect-video overflow-hidden rounded-lg border border-zinc-200"
                              >
                                <img src={img} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                                <button
                                  type="button"
                                  onClick={() => onRemoveItemImage(it.id, idx)}
                                  className="absolute end-1 top-1 rounded bg-red-600 p-0.5 text-white shadow-sm"
                                  aria-label="حذف الصورة"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
          </div>
        </div>
        {sidebar}
      </div>
    </div>
  );
}

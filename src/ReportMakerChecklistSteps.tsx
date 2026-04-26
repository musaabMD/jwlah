import React, { useMemo, useState, useCallback, ChangeEvent } from "react";
import { ChevronDown, ImagePlus, XCircle } from "lucide-react";
import { SECTIONS } from "./constants";
import type { ReportMakerData } from "./report-maker-types";

const ACCENTS = ["#1a6b3c", "#b5451b", "#1a4b8c", "#7b2d8b", "#8b6914"] as const;

type Props = {
  data: ReportMakerData;
  setData: React.Dispatch<React.SetStateAction<ReportMakerData>>;
  onItemImageUpload: (itemId: string, e: ChangeEvent<HTMLInputElement>) => void;
  onRemoveItemImage: (itemId: string, imgIndex: number) => void;
  /** Tighter layout when embedded in the PPT review panel */
  compact?: boolean;
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
}: Props) {
  const [activeSectionId, setActiveSectionId] = useState(() => SECTIONS[0]?.id ?? "");
  const [openItemIds, setOpenItemIds] = useState<Record<string, boolean>>({});

  const itemById = useMemo(() => new Map(data.items.map((it) => [it.id, it] as const)), [data.items]);

  const activeSection = SECTIONS.find((s) => s.id === activeSectionId) ?? SECTIONS[0];
  const sectionIndex = Math.max(0, SECTIONS.findIndex((s) => s.id === activeSection?.id));
  const accent = ACCENTS[sectionIndex % ACCENTS.length];
  const { checked, total, pct } = useMemo(
    () => (activeSection ? sectionMetrics(activeSection, itemById) : { checked: 0, total: 0, pct: 0 }),
    [activeSection, itemById],
  );

  const scoreColor = pct >= 80 ? "#1a6b3c" : pct >= 50 ? "#b5851b" : "#b5451b";

  const toggleOpen = useCallback((itemId: string) => {
    setOpenItemIds((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  }, []);

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

  const pad = compact ? "p-3" : "p-4 sm:p-5";

  return (
    <div
      dir="rtl"
      className={`overflow-hidden rounded-2xl border border-[#e8e4dd] bg-[#f7f6f2] shadow-sm ${compact ? "text-[13px]" : ""}`}
    >
      <div className="border-b-2 border-[#e8e4dd] bg-white pb-0 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
        <div className={`flex flex-wrap items-center justify-between gap-3 ${pad} pb-3`}>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-zinc-900">بنود الفحص</h2>
            <p className="mt-0.5 truncate text-[11px] text-zinc-500" title={activeSection?.title}>
              {activeSection?.title}
            </p>
          </div>
          <div
            className="shrink-0 rounded-xl border-2 px-4 py-2 text-center tabular-nums"
            style={{ borderColor: scoreColor, background: `${scoreColor}12` }}
          >
            <div className="text-2xl font-extrabold leading-none" style={{ color: scoreColor }}>
              {pct}٪
            </div>
            <div className="mt-1 text-[10px] text-zinc-500">
              {checked} / {total}
            </div>
          </div>
        </div>

        <div className="h-1 overflow-hidden rounded-full bg-[#ede9e2] mx-4 mb-3">
          <div
            className="h-full rounded-full transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%`, backgroundColor: accent }}
          />
        </div>

        <div className={`flex gap-0.5 overflow-x-auto px-3 pb-2 scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
          {SECTIONS.map((sec, i) => {
            const isActive = sec.id === activeSectionId;
            const sm = sectionMetrics(sec, itemById);
            const ac = ACCENTS[i % ACCENTS.length];
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => setActiveSectionId(sec.id)}
                className="flex shrink-0 items-center gap-1.5 border-0 border-b-[3px] bg-transparent px-3 py-2 text-[12px] font-semibold transition-colors"
                style={{
                  borderBottomColor: isActive ? ac : "transparent",
                  color: isActive ? ac : "#a3a3a3",
                  fontWeight: isActive ? 700 : 500,
                }}
              >
                <span className="max-w-[10rem] truncate sm:max-w-[14rem]" title={sec.title}>
                  {sec.title}
                </span>
                <span
                  className="rounded-full px-1.5 py-0.5 font-mono text-[9px] tabular-nums"
                  style={{
                    background: isActive ? `${ac}22` : "#f0ece6",
                    color: isActive ? ac : "#bbb",
                  }}
                >
                  {sm.pct}٪
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={`max-h-[min(56vh,520px)] overflow-y-auto ${compact ? "p-2" : "p-4"}`}>
        {!activeSection ? null : activeSection.questions.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-400">لا بنود في هذا القسم.</p>
        ) : (
          <ul className="space-y-2">
            {activeSection.questions.map((q) => {
              const it = itemById.get(q.id);
              if (!it) return null;
              const open = Boolean(openItemIds[it.id]);
              return (
                <li
                  key={q.id}
                  className="overflow-hidden rounded-[10px] border bg-white transition-shadow"
                  style={{
                    borderColor: it.checked ? `${accent}44` : "#e8e4dd",
                    borderRightWidth: 4,
                    borderRightColor: it.checked ? accent : "#e8e4dd",
                    boxShadow: it.checked ? `0 2px 10px ${accent}18` : "0 1px 4px rgba(0,0,0,0.04)",
                  }}
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
  );
}

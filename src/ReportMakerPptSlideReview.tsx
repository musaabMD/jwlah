import React, { useMemo, ChangeEvent, useCallback } from "react";
import { CheckCircle2, ImagePlus } from "lucide-react";
import { SECTIONS, INSPECTORS, HOSPITALS } from "./constants";
import { MHC_LOGO_PATH } from "./branding";
import type { ReportMakerData } from "./report-maker-types";
import { calculateReportMakerScore } from "./report-maker-types";
import { buildReportMakerPptSlides, countReportMakerPptExportSlides, type ReportMakerPptSlide } from "./report-maker-slide-plan";

function gregorianSlashFromIso(iso: string): string {
  if (!iso?.trim()) return "—";
  const day = iso.split("T")[0];
  const p = day.split("-");
  if (p.length !== 3) return iso;
  return `${p[0]}/${p[1]}/${p[2]}`;
}

function truncatePreview(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

type Props = {
  data: ReportMakerData;
  setData: React.Dispatch<React.SetStateAction<ReportMakerData>>;
};

export function ReportMakerPptSlideReview({ data, setData }: Props) {
  const slides = useMemo(() => buildReportMakerPptSlides(data), [data]);
  const itemById = useMemo(() => new Map(data.items.map((it) => [it.id, it] as const)), [data.items]);
  const score = useMemo(() => calculateReportMakerScore(data), [data]);
  const exportSlideCount = useMemo(() => countReportMakerPptExportSlides(data), [data]);

  const scrollToSlide = useCallback((id: string) => {
    document.getElementById(`rm-ppt-slide-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const readFilesAsDataUrls = useCallback((files: FileList, onEach: (url: string) => void) => {
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") onEach(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const onItemImagesAppend = (itemId: string, e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    readFilesAsDataUrls(files, (url) => {
      setData((p) => ({
        ...p,
        items: p.items.map((row) => (row.id === itemId ? { ...row, images: [...row.images, url] } : row)),
      }));
    });
    e.target.value = "";
  };

  const onRemoveItemImage = (itemId: string, imgIndex: number) => {
    setData((p) => ({
      ...p,
      items: p.items.map((row) =>
        row.id === itemId ? { ...row, images: row.images.filter((_, i) => i !== imgIndex) } : row,
      ),
    }));
  };

  const onReplaceAnnexImage = (idx: number, e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        setData((p) => ({
          ...p,
          images: p.images.map((u, i) => (i === idx ? (reader.result as string) : u)),
        }));
      }
    };
    reader.readAsDataURL(f);
    e.target.value = "";
  };

  const onRemoveAnnexImage = (idx: number) => {
    setData((p) => ({ ...p, images: p.images.filter((_, i) => i !== idx) }));
  };

  const onAnnexAppend = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    readFilesAsDataUrls(files, (url) => {
      setData((p) => ({ ...p, images: [...p.images, url] }));
    });
    e.target.value = "";
  };

  function renderEditor(slide: ReportMakerPptSlide): React.ReactNode {
    switch (slide.kind) {
      case "cover":
        return (
          <div className="space-y-3">
            <label className="block text-[11px] font-semibold text-zinc-600">عنوان التقرير</label>
            <input
              type="text"
              value={data.title}
              onChange={(e) => setData((p) => ({ ...p, title: e.target.value }))}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/15"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-600">المنشأة</label>
                <select
                  value={data.facility}
                  onChange={(e) => setData((p) => ({ ...p, facility: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/15"
                >
                  <option value="">— اختر من القائمة —</option>
                  {HOSPITALS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-zinc-600">التاريخ</label>
                <input
                  type="date"
                  value={data.date}
                  onChange={(e) => setData((p) => ({ ...p, date: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/15"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-zinc-600">أسماء المكلفين (اختياري)</label>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {INSPECTORS.map((inspector) => {
                  const on = data.inspectors.includes(inspector.name);
                  return (
                    <button
                      key={inspector.id}
                      type="button"
                      onClick={() =>
                        setData((prev) => ({
                          ...prev,
                          inspectors: on
                            ? prev.inspectors.filter((n) => n !== inspector.name)
                            : [...prev.inspectors, inspector.name],
                        }))
                      }
                      className={`flex items-center justify-between rounded-lg border px-2.5 py-2 text-left text-xs transition-colors ${
                        on
                          ? "border-2 border-zinc-900 bg-zinc-50 text-zinc-900"
                          : "border border-zinc-200 bg-white text-zinc-800"
                      }`}
                    >
                      <span>{inspector.name}</span>
                      {on ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-zinc-900" />
                      ) : (
                        <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-zinc-300" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );

      case "checklist":
        return (
          <div>
            <p className="mb-2 text-[11px] text-zinc-500">عدّل التمييز والملاحظة لكل بند — يظهر في جدول الشريحة الثانية.</p>
            <div className="max-h-[42dvh] space-y-3 overflow-y-auto pe-0.5">
              {SECTIONS.map((sec) => (
                <div key={sec.id} className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-2">
                  <p className="mb-2 text-[10px] font-bold text-zinc-600">{sec.title}</p>
                  <ul className="space-y-2">
                    {sec.questions.map((q) => {
                      const it = itemById.get(q.id);
                      if (!it) return null;
                      return (
                        <li key={q.id} className="flex gap-2 rounded-md border border-zinc-100 bg-white p-2">
                          <input
                            type="checkbox"
                            checked={it.checked}
                            onChange={(e) =>
                              setData((p) => ({
                                ...p,
                                items: p.items.map((row) =>
                                  row.id === it.id ? { ...row, checked: e.target.checked } : row,
                                ),
                              }))
                            }
                            className="mt-1.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-zinc-900"
                            aria-label="تم"
                          />
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <p
                              dir="auto"
                              className="text-left text-xs font-medium leading-snug text-zinc-900 sm:text-right [unicode-bidi:plaintext]"
                            >
                              {it.text}
                            </p>
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
                              rows={2}
                              placeholder="ملاحظة البند…"
                              className="w-full resize-y rounded border border-zinc-200 bg-zinc-50/50 px-2 py-1 text-[11px] outline-none focus:ring-2 focus:ring-zinc-900/10 [unicode-bidi:plaintext]"
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        );

      case "notes":
        return (
          <div className="space-y-2">
            {!data.notes.trim() ? (
              <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                لا يوجد نص حالياً — لن تُنشأ شريحة «ملاحظات» في ملف PowerPoint حتى تكتب محتوى هنا.
              </p>
            ) : null}
            <label className="block text-[11px] font-semibold text-zinc-600">نص الملاحظات العامة</label>
            <textarea
              value={data.notes}
              onChange={(e) => setData((p) => ({ ...p, notes: e.target.value }))}
              rows={5}
              className="w-full resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/15"
            />
          </div>
        );

      case "item_photo": {
        const itemId = slide.itemId!;
        const imgIdx = slide.imageIndex!;
        const it = itemById.get(itemId);
        if (!it) return <p className="text-xs text-red-600">تعذر العثور على البند.</p>;
        return (
          <div className="space-y-3">
            <p dir="auto" className="text-left text-xs font-medium text-zinc-800 sm:text-right [unicode-bidi:plaintext]">
              {it.text}
            </p>
            <label className="block text-[11px] font-semibold text-zinc-600">ملاحظة البند (تظهر على الشريحة)</label>
            <textarea
              dir="auto"
              value={it.note}
              onChange={(e) =>
                setData((p) => ({
                  ...p,
                  items: p.items.map((row) => (row.id === itemId ? { ...row, note: e.target.value } : row)),
                }))
              }
              rows={3}
              className="w-full resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900/15 [unicode-bidi:plaintext]"
            />
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[11px] font-semibold text-zinc-800 hover:bg-zinc-100">
                <ImagePlus className="h-3.5 w-3.5" aria-hidden />
                إضافة صور للبند
                <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => onItemImagesAppend(itemId, e)} />
              </label>
              <button
                type="button"
                onClick={() => onRemoveItemImage(itemId, imgIdx)}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-800 hover:bg-red-100"
              >
                حذف هذه الصورة من الشريحة
              </button>
            </div>
          </div>
        );
      }

      case "annex_photo": {
        const idx = slide.imageIndex!;
        return (
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[11px] font-semibold text-zinc-800 hover:bg-zinc-100">
              استبدال الصورة
              <input type="file" accept="image/*" className="hidden" onChange={(e) => onReplaceAnnexImage(idx, e)} />
            </label>
            <button
              type="button"
              onClick={() => onRemoveAnnexImage(idx)}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-800 hover:bg-red-100"
            >
              حذف الصورة
            </button>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-800 hover:bg-zinc-50">
              <ImagePlus className="h-3.5 w-3.5" aria-hidden />
              إضافة صورة مرفقة جديدة
              <input type="file" multiple accept="image/*" className="hidden" onChange={onAnnexAppend} />
            </label>
          </div>
        );
      }

      case "closing":
        return <p className="text-[12px] text-zinc-600">شريحة ثابتة (شكراً وتجمع المدينة المنورة الصحي). لا تحتاج تعديلاً هنا.</p>;

      default:
        return null;
    }
  }


  return (
    <div className="space-y-4">
      <p className="text-[11px] leading-relaxed text-zinc-500">
        معاينة ترتيب الشرائح كما في ملف PowerPoint. عدّل كل قسم أدناه؛ الشرائح التي لن تُصدَّر (مثل الملاحظات الفارغة) مذكورة في البطاقة.
        <span className="mt-1 block font-semibold tabular-nums text-zinc-700">
          عدد الشرائح في الملف بعد التصدير: {exportSlideCount}
        </span>
      </p>

      <nav
        className="sticky top-0 z-[1] flex flex-wrap gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50/95 p-2 backdrop-blur-sm"
        aria-label="انتقال سريع بين الشرائح"
      >
        {slides.map((s) => (
          <button
            key={`nav-${s.id}`}
            type="button"
            onClick={() => scrollToSlide(s.id)}
            className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[10px] font-semibold text-zinc-800 hover:border-zinc-900 hover:bg-zinc-50"
          >
            {s.n}. {s.labelAr}
          </button>
        ))}
      </nav>

      <div className="space-y-6">
        {slides.map((slide) => (
          <article
            key={slide.id}
            id={`rm-ppt-slide-${slide.id}`}
            className="scroll-mt-24 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4"
          >
            <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-100 pb-2">
              <h3 className="text-sm font-bold text-zinc-900">
                الشريحة {slide.n}: {slide.labelAr}
              </h3>
              <span className="text-[10px] font-medium text-zinc-400">16:9</span>
            </header>

            <SlideVisual slide={slide} data={data} itemById={itemById} score={score} />

            <div className="mt-4 border-t border-zinc-100 pt-4">{renderEditor(slide)}</div>
          </article>
        ))}
      </div>

      <p className="text-[11px] text-zinc-500">
        يمكنك إضافة أو استبدال صور المرفقات العامة من بطاقة «مرفق» أعلاه، وصور البنود من بطاقات «صورة: …» أو من الصفحة الرئيسية.
      </p>
    </div>
  );
}

function SlideVisual({
  slide,
  data,
  itemById,
  score,
}: {
  slide: ReportMakerPptSlide;
  data: ReportMakerData;
  itemById: Map<string, { text: string; note: string; images: string[] }>;
  score: { checked: number; total: number; percentage: number };
}) {
  const frame = "relative aspect-video w-full overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 shadow-inner";

  switch (slide.kind) {
    case "cover":
      return (
        <div className={`${frame} bg-[#1a3a5c]`}>
          <img src={MHC_LOGO_PATH} alt="" className="absolute end-3 top-2 h-8 w-auto object-contain opacity-90" />
          <div className="flex h-full flex-col items-center justify-center px-4 pb-6 pt-10 text-center">
            <p className="line-clamp-3 text-lg font-bold leading-tight text-white sm:text-xl">{truncatePreview(data.title, 120)}</p>
            <div className="mt-3 space-y-0.5 text-[10px] font-semibold leading-relaxed text-slate-200 sm:text-[11px]">
              {data.facility?.trim() ? <p>المنشأة: {truncatePreview(data.facility, 40)}</p> : null}
              {data.inspectors.length ? <p>المكلفون: {truncatePreview(data.inspectors.join("، "), 80)}</p> : null}
              <p>التاريخ: {gregorianSlashFromIso(data.date)}م</p>
              <p>
                الإنجاز: {score.total === 0 ? "—" : `${score.checked} / ${score.total}  (${score.percentage}٪)`}
              </p>
            </div>
          </div>
        </div>
      );

    case "checklist":
      return (
        <div className={frame}>
          <div className="absolute inset-x-0 top-0 h-2 bg-[#0f172a]" />
          <div className="flex h-full flex-col p-2 pt-4">
            <p className="text-end text-[9px] font-bold text-[#0f172a]">قائمة التحقق والتقييم التلقائي</p>
            <p className="text-end text-[8px] text-zinc-500">
              {score.total > 0 ? `${score.checked} من ${score.total} مكتمل` : "—"}
            </p>
            <div className="mt-1 flex-1 rounded border border-zinc-200 bg-white/90 p-1">
              <div className="h-full overflow-hidden rounded bg-zinc-50/80">
                <p className="p-1 text-[7px] leading-tight text-zinc-400">جدول البنود والملاحظات…</p>
              </div>
            </div>
          </div>
        </div>
      );

    case "notes":
      return (
        <div className={frame}>
          <div className="absolute inset-x-0 top-0 h-2 bg-[#0f172a]" />
          <div className="flex h-full flex-col bg-[#fafafa] p-3 pt-5">
            <p className="text-end text-[10px] font-bold text-zinc-900">ملاحظات</p>
            <p className="mt-1 line-clamp-[8] whitespace-pre-wrap text-end text-[8px] leading-snug text-zinc-600">
              {data.notes.trim() ? truncatePreview(data.notes, 400) : "— فارغ — لن تُصدَّر الشريحة"}
            </p>
          </div>
        </div>
      );

    case "item_photo": {
      const it = itemById.get(slide.itemId!);
      const src = it?.images[slide.imageIndex!];
      return (
        <div className={frame}>
          <div className="absolute inset-x-0 top-0 h-2 bg-[#0f172a]" />
          <div className="flex h-full flex-col bg-[#f4f4f5] p-2 pt-4">
            <p dir="auto" className="line-clamp-2 text-start text-[9px] font-bold text-[#0f172a] sm:text-end">
              {it ? truncatePreview(it.text, 100) : "—"}
            </p>
            {src ? (
              <div className="mt-1 flex flex-1 items-center justify-center overflow-hidden rounded-lg bg-black/5 p-1">
                <img src={src} alt="" className="max-h-full max-w-full object-contain" referrerPolicy="no-referrer" />
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center text-[10px] text-zinc-400">لا صورة</div>
            )}
          </div>
        </div>
      );
    }

    case "annex_photo": {
      const src = data.images[slide.imageIndex!];
      return (
        <div className={frame}>
          <div className="absolute inset-x-0 top-0 h-2 bg-[#0f172a]" />
          <div className="flex h-full flex-col bg-[#f4f4f5] p-2 pt-4">
            <p className="text-end text-[9px] font-bold text-[#0f172a]">صورة {slide.imageIndex! + 1}</p>
            {src ? (
              <div className="mt-1 flex flex-1 items-center justify-center overflow-hidden rounded-lg bg-black/5 p-1">
                <img src={src} alt="" className="max-h-full max-w-full object-contain" referrerPolicy="no-referrer" />
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center text-[10px] text-zinc-400">لا صورة</div>
            )}
          </div>
        </div>
      );
    }

    case "closing":
      return (
        <div className={`${frame} bg-[#1e3a5f]`}>
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <p className="text-xl font-bold text-white sm:text-2xl">شكراً</p>
            <p className="mt-2 text-[10px] text-slate-200">تجمع المدينة المنورة الصحي</p>
          </div>
        </div>
      );

    default:
      return null;
  }
}

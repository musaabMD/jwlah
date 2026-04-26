import React, { useMemo, useState, useEffect, useRef, ChangeEvent, useCallback } from "react";
import { CheckCircle2, ImagePlus } from "lucide-react";
import { INSPECTORS, HOSPITALS, SECTIONS } from "./constants";
import { ReportMakerChecklistSteps } from "./ReportMakerChecklistSteps";
import { REPORT_MAKER_TOUR_CLOSING_BG_PATH } from "./branding";
import { ReportMakerTourCoverHero } from "./ReportMakerTourCoverHero";
import type { ReportMakerData } from "./report-maker-types";
import { buildReportMakerPptSlides, countReportMakerPptExportSlides, type ReportMakerPptSlide } from "./report-maker-slide-plan";

function truncatePreview(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

type Props = {
  data: ReportMakerData;
  setData: React.Dispatch<React.SetStateAction<ReportMakerData>>;
  /** عند فتح النافذة من الصفحة الرئيسية: اختيار شريحة أولية مرة واحدة. */
  initialSlideId?: string;
  /** "page" = ملء ارتفاع شاشة المراجعة الكاملة (ليس داخل نافذة منبثقة). */
  layout?: "default" | "page";
};

export function ReportMakerPptSlideReview({ data, setData, initialSlideId, layout = "default" }: Props) {
  const isPage = layout === "page";
  const slides = useMemo(() => buildReportMakerPptSlides(data), [data]);
  const itemById = useMemo(() => new Map(data.items.map((it) => [it.id, it] as const)), [data.items]);
  const exportSlideCount = useMemo(() => countReportMakerPptExportSlides(data), [data]);

  const [selectedSlideId, setSelectedSlideId] = useState("");
  const appliedInitialSlideRef = useRef(false);

  useEffect(() => {
    appliedInitialSlideRef.current = false;
  }, [initialSlideId]);

  useEffect(() => {
    if (slides.length === 0) return;
    if (
      !appliedInitialSlideRef.current &&
      initialSlideId &&
      slides.some((s) => s.id === initialSlideId)
    ) {
      setSelectedSlideId(initialSlideId);
      appliedInitialSlideRef.current = true;
      return;
    }
    if (!selectedSlideId || !slides.some((s) => s.id === selectedSlideId)) {
      setSelectedSlideId(slides[0].id);
    }
  }, [slides, selectedSlideId, initialSlideId]);

  const activeSlide = useMemo(
    () => slides.find((s) => s.id === selectedSlideId) ?? slides[0] ?? null,
    [slides, selectedSlideId],
  );

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
            <label className="block text-[11px] font-semibold text-zinc-600">تسمية الملف / عنوان المستند</label>
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

      case "section_intro":
      case "section_table":
        return slide.sectionId ? (
          <ReportMakerChecklistSteps
            compact
            onlySectionId={slide.sectionId}
            data={data}
            setData={setData}
            onItemImageUpload={onItemImagesAppend}
            onRemoveItemImage={onRemoveItemImage}
          />
        ) : null;

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
        return (
          <p className="text-[12px] text-zinc-600">
            شريحة الختام تستخدم خلفية التجمع مع نص «شكراً» و«تجمع المدينة المنورة الصحي». لا تعديل مطلوب هنا.
          </p>
        );

      default:
        return null;
    }
  }


  return (
    <div
      className={
        isPage
          ? "flex h-full min-h-0 min-w-0 flex-1 flex-col gap-2"
          : "flex min-h-0 flex-1 flex-col gap-3"
      }
      dir="rtl"
    >
      <p className="shrink-0 text-[11px] leading-relaxed text-zinc-500">
        اختر شريحة من القائمة الجانبية — تظهر المعاينة والتعديل في اللوحة الرئيسية. الشرائح التي لن تُصدَّر (مثل الملاحظات الفارغة) موضّحة في البطاقة.
        <span className="mt-1 block font-semibold tabular-nums text-zinc-700">
          عدد الشرائح في الملف بعد التصدير: {exportSlideCount}
        </span>
      </p>

      <div
        className={
          isPage
            ? "flex min-h-[200px] flex-1 flex-col gap-3 sm:min-h-0 sm:flex-row sm:gap-4"
            : "flex min-h-[280px] flex-1 flex-col gap-3 sm:min-h-[360px] sm:flex-row sm:gap-4"
        }
      >
        <aside
          className={
            isPage
              ? "flex max-h-40 shrink-0 flex-col gap-1 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50/90 sm:max-h-none sm:w-60 sm:shrink-0 sm:border-s sm:ps-2 lg:w-64"
              : "flex max-h-40 shrink-0 flex-col gap-1 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50/90 sm:max-h-none sm:w-52 sm:border-s sm:ps-2"
          }
        >
          <p className="shrink-0 px-2 pt-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">الشرائح</p>
          <div className="flex flex-row gap-1 overflow-x-auto px-2 pb-2 sm:flex-col sm:overflow-y-auto sm:px-1 sm:pb-2">
            {slides.map((s) => {
              const sel = s.id === selectedSlideId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedSlideId(s.id)}
                  className={`shrink-0 rounded-lg border px-2.5 py-2 text-start text-[11px] font-semibold transition-colors sm:w-full ${
                    sel
                      ? "border-zinc-900 bg-zinc-900 text-white shadow-sm"
                      : "border-transparent bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100"
                  }`}
                >
                  <span className="tabular-nums text-zinc-400">{s.n}.</span> {s.labelAr}
                </button>
              );
            })}
          </div>
        </aside>

        <main
          className={
            isPage
              ? "min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4"
              : "min-h-0 min-w-0 flex-1 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4"
          }
        >
          {activeSlide ? (
            <div className="flex min-h-0 flex-col gap-3">
              <header className="shrink-0 flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-100 pb-2">
                <h3 className="text-sm font-bold text-zinc-900">
                  الشريحة {activeSlide.n}: {activeSlide.labelAr}
                </h3>
                <span className="text-[10px] font-medium text-zinc-400">معاينة 16:9</span>
              </header>
              <div className="w-full shrink-0">
                <SlideVisual slide={activeSlide} data={data} itemById={itemById} />
              </div>
              <div className="min-h-0 shrink-0 border-t border-zinc-100 pt-4">{renderEditor(activeSlide)}</div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">لا شرائح للعرض.</p>
          )}
        </main>
      </div>

      <p className={`shrink-0 text-[11px] text-zinc-500 ${isPage ? "max-sm:line-clamp-2" : ""}`}>
        صور المرفقات العامة والبنود: تعديل من لوحة الشريحة الحالية أو من الصفحة الرئيسية لصانع التقرير.
      </p>
    </div>
  );
}

function SlideVisual({
  slide,
  data,
  itemById,
}: {
  slide: ReportMakerPptSlide;
  data: ReportMakerData;
  itemById: Map<string, { text: string; note: string; images: string[] }>;
}) {
  /** إطار 16:9 — ارتفاع يُشتق من العرض؛ `min-h` احتياطي داخل الحاويات المرنة. */
  const frame =
    "relative flex aspect-video min-h-[220px] w-full max-w-full flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-inner sm:min-h-[260px]";

  switch (slide.kind) {
    case "cover":
      return <ReportMakerTourCoverHero data={data} />;

    case "section_intro": {
      const sec = SECTIONS.find((s) => s.id === slide.sectionId);
      if (!sec) {
        return (
          <div className={`${frame} bg-[#111827] p-3`}>
            <p className="text-xs text-red-300">قسم غير معروف.</p>
          </div>
        );
      }
      const map = new Map(data.items.map((it) => [it.id, it] as const));
      let secChecked = 0;
      let secTotal = 0;
      for (const q of sec.questions) {
        const it = map.get(q.id);
        if (!it) continue;
        secTotal += 1;
        if (it.checked) secChecked += 1;
      }
      const secPct = secTotal === 0 ? 0 : Math.round((secChecked / secTotal) * 100);
      const dateDisp = data.date?.split("T")[0] ?? "—";
      const fac = data.facility?.trim() || "—";

      return (
        <div className={`${frame} !bg-[#111827]`} dir="rtl">
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-6 text-center">
              <p className="mb-2 text-[10px] font-medium text-slate-400 sm:text-xs">قسم التقييم</p>
              <p className="line-clamp-5 max-w-[95%] text-base font-bold leading-snug text-white sm:text-lg">
                {sec.title}
              </p>
              <p className="mt-3 max-w-[95%] text-sm font-semibold leading-snug text-slate-200 sm:text-base">
                {secTotal > 0
                  ? `نتيجة القسم: ${secChecked} / ${secTotal} • ${secPct}٪`
                  : "نتيجة القسم: لا توجد بنود في هذا القسم"}
              </p>
            </div>
            <p className="shrink-0 px-4 pb-3 text-center text-[10px] text-slate-500 sm:text-[11px]">
              {dateDisp} • {truncatePreview(fac, 48)}
            </p>
          </div>
        </div>
      );
    }

    case "section_table": {
      const sec = SECTIONS.find((s) => s.id === slide.sectionId);
      if (!sec) {
        return (
          <div className={`${frame} bg-white p-3`}>
            <p className="text-xs text-red-600">قسم غير معروف.</p>
          </div>
        );
      }
      const map = new Map(data.items.map((it) => [it.id, it] as const));
      let secChecked = 0;
      let secTotal = 0;
      const rows: { text: string; note: string; checked: boolean }[] = [];
      for (const q of sec.questions) {
        const it = map.get(q.id);
        if (!it) continue;
        secTotal += 1;
        if (it.checked) secChecked += 1;
        rows.push({ text: it.text, note: it.note, checked: it.checked });
      }
      const secPct = secTotal === 0 ? 0 : Math.round((secChecked / secTotal) * 100);
      const dateDisp = data.date?.split("T")[0] ?? "—";
      const fac = data.facility?.trim() || "—";
      const showRows = rows.slice(0, 8);

      return (
        <div className={`${frame} bg-white`}>
          <div className="h-2 shrink-0 bg-[#111c2c]" />
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2.5 text-end sm:p-3">
            <h4 className="shrink-0 text-[13px] font-bold leading-snug text-[#111c2c] sm:text-sm">
              جدول البنود — {truncatePreview(sec.title, 72)}
            </h4>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-zinc-200 shadow-sm">
              <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_3.5rem_28%] gap-0 bg-[#111c2c] px-0.5 text-[11px] font-bold leading-tight text-white sm:text-xs">
                <span className="px-2 py-2.5">البند</span>
                <span className="flex items-center justify-center border-s border-white/25 py-2.5">التقييم</span>
                <span className="border-s border-white/25 px-2 py-2.5">ملاحظة</span>
              </div>
              <div className="shrink-0 bg-[#f0f0f0] px-2 py-2.5 text-[11px] font-bold leading-snug text-zinc-900 sm:text-xs">
                <span className="line-clamp-3">
                  {truncatePreview(sec.title, 56)} — نتيجة القسم: {secChecked}/{secTotal} • {secPct}٪
                </span>
              </div>
              <div className="min-h-0 flex-1 divide-y divide-zinc-200 overflow-y-auto overscroll-contain bg-white">
                {rows.length === 0 ? (
                  <p className="p-4 text-center text-xs leading-relaxed text-zinc-600 sm:text-sm">
                    لا توجد بنود مرتبطة بهذا القسم في البيانات (تأكد من مزامنة قائمة البنود).
                  </p>
                ) : (
                  <>
                    {showRows.map((r, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-[minmax(0,1fr)_3.5rem_28%] gap-0 text-[11px] leading-snug sm:text-xs"
                      >
                        <span
                          className="line-clamp-4 px-2 py-2 text-start text-zinc-800 [unicode-bidi:plaintext] sm:line-clamp-5 sm:text-[13px] sm:leading-snug"
                          dir="auto"
                        >
                          {r.text}
                        </span>
                        <span
                          className={`flex items-center justify-center border-s border-zinc-100 py-2 text-center text-[12px] font-bold sm:text-sm ${
                            r.checked ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {r.checked ? "نعم" : "لا"}
                        </span>
                        <span
                          className="line-clamp-4 border-s border-zinc-100 px-2 py-2 text-start text-zinc-600 [unicode-bidi:plaintext] sm:text-[12px] sm:leading-snug"
                          dir="auto"
                        >
                          {r.note.trim() ? r.note : "—"}
                        </span>
                      </div>
                    ))}
                    {rows.length > showRows.length ? (
                      <p className="bg-zinc-50 px-2 py-2.5 text-center text-xs font-medium text-zinc-500 sm:text-sm">
                        +{rows.length - showRows.length} بندًا إضافيًا في ملف PowerPoint
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            </div>
            <p className="shrink-0 text-end text-xs text-zinc-500 sm:text-sm">
              {secPct}٪ • {dateDisp} • {truncatePreview(fac, 36)}
            </p>
          </div>
        </div>
      );
    }

    case "notes":
      return (
        <div className={`${frame} bg-white`}>
          <div className="absolute inset-x-0 top-0 h-2 bg-[#0f172a]" />
          <div className="flex h-full min-h-0 flex-col bg-[#fafafa] p-3 pt-5">
            <p className="shrink-0 text-end text-xs font-bold text-zinc-900 sm:text-sm">ملاحظات</p>
            <p className="mt-2 min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap text-end text-xs leading-relaxed text-zinc-600 sm:text-sm">
              {data.notes.trim() ? truncatePreview(data.notes, 400) : "— فارغ — لن تُصدَّر الشريحة"}
            </p>
          </div>
        </div>
      );

    case "item_photo": {
      const it = itemById.get(slide.itemId!);
      const src = it?.images[slide.imageIndex!];
      return (
        <div className={`${frame} bg-zinc-100`}>
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
        <div className={`${frame} bg-zinc-100`}>
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
        <div className={`${frame} relative overflow-hidden`}>
          <img
            src={REPORT_MAKER_TOUR_CLOSING_BG_PATH}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-5">
            <div className="rounded-xl border border-white/15 bg-black/45 px-5 py-3 shadow-lg backdrop-blur-[2px] sm:px-8 sm:py-4">
              <p className="text-center text-lg font-bold text-white sm:text-xl">شكراً</p>
              <p className="mt-1.5 text-center text-[10px] font-semibold leading-snug text-white/95 sm:text-[11px]">
                تجمع المدينة المنورة الصحي
              </p>
            </div>
          </div>
        </div>
      );

    default:
      return null;
  }
}

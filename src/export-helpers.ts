function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Ensures html2canvas can export: same-origin fetch → data URL (avoids tainted canvas). */
export async function inlineImagesForPdfCapture(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.currentSrc || img.src;
      if (!src || src.startsWith("data:")) {
        try {
          await img.decode?.();
        } catch {
          /* ignore */
        }
        return;
      }
      try {
        const res = await fetch(src);
        if (!res.ok) return;
        const blob = await res.blob();
        const dataUrl = await blobToDataURL(blob);
        img.src = dataUrl;
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        });
      } catch {
        /* leave src; may still taint — caller can reduce scale */
      }
    }),
  );
}

export function dataUrlToPptxBase64(dataUrl: string): string {
  const i = dataUrl.indexOf(",");
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
}

export async function fetchPublicImageAsPptxBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const dataUrl = await blobToDataURL(await res.blob());
    return dataUrlToPptxBase64(dataUrl);
  } catch {
    return null;
  }
}

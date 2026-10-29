// Profile pictures: cropped to a centred square, 256 px, re-encoded (which drops hidden photo data like GPS).
export async function preparePicture(file: File): Promise<Blob> {
  if (file.size > 20 * 1024 * 1024) throw new Error('That picture is over 20 MB — pick a smaller one.');
  let bmp: { width: number; height: number; close?(): void } & CanvasImageSource;
  try {
    // some browsers stall decoding; fall back to an <img> after a few seconds
    bmp = await Promise.race([createImageBitmap(file), new Promise<never>((_, no) => setTimeout(() => no(new Error('slow')), 4000))]);
  } catch {
    try {
      const url = await new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = no; r.readAsDataURL(file); });
      const img = new Image();
      await new Promise<void>((ok, no) => { img.onload = () => ok(); img.onerror = no; img.src = url; setTimeout(() => no(new Error('timeout')), 8000); });
      bmp = Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight });
    } catch {
      throw new Error('That file isn’t a picture this browser can open. Try a JPG, PNG or WebP.');
    }
  }
  const side = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
  bmp.close?.();
  const encode = (type: string, q: number) => new Promise<Blob | null>((r) => c.toBlob(r, type, q));
  const webp = await encode('image/webp', 0.86);
  if (webp && webp.type === 'image/webp') return webp;
  const jpg = await encode('image/jpeg', 0.88);
  if (!jpg) throw new Error('Couldn’t process that picture.');
  return jpg;
}

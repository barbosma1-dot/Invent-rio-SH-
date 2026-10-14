// Reduz a foto antes do upload: lado maior de 800 px, JPEG. O bucket aceita até 1 MB.
const MAX_SIDE = 800;
const MAX_BYTES = 900 * 1024;

function loadWithImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a imagem.')); };
    img.src = url;
  });
}

async function decode(file: File): Promise<{ src: CanvasImageSource; w: number; h: number }> {
  try {
    // Respeita a rotação da câmera do celular.
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { src: bmp, w: bmp.width, h: bmp.height };
  } catch {
    const img = await loadWithImageElement(file);
    return { src: img, w: img.naturalWidth, h: img.naturalHeight };
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Falha ao comprimir a imagem.'))),
      'image/jpeg',
      quality,
    );
  });
}

export async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.');
  const { src, w, h } = await decode(file);
  if (!w || !h) throw new Error('Imagem inválida.');

  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Seu navegador não conseguiu processar a imagem.');
  ctx.fillStyle = '#ffffff'; // PNG com fundo transparente vira branco
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(src, 0, 0, cw, ch);
  if ('close' in src && typeof (src as ImageBitmap).close === 'function') (src as ImageBitmap).close();

  let quality = 0.82;
  let blob = await toBlob(canvas, quality);
  while (blob.size > MAX_BYTES && quality > 0.4) {
    quality -= 0.1;
    blob = await toBlob(canvas, quality);
  }
  return blob;
}

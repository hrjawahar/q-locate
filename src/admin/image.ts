// Resize a photo in the browser to WebP: 1200px wide for the page, 400px for cards.
async function toWebp(bitmap: ImageBitmap, maxW: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxW / bitmap.width)
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not convert image'))), 'image/webp', quality))
}

export async function makePhotoPair(file: File) {
  const bitmap = await createImageBitmap(file)
  const large = await toWebp(bitmap, 1200, 0.82)
  const small = await toWebp(bitmap, 400, 0.75)
  bitmap.close()
  return { large, small }
}

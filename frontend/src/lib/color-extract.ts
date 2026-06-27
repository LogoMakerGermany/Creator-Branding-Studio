export async function extractColorsFromImage(file: File, count = 6): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 100;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Canvas nicht verfügbar'));
        return;
      }

      ctx.drawImage(img, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);

      const colorMap = new Map<string, number>();
      for (let i = 0; i < data.length; i += 4) {
        const r = Math.round(data[i] / 32) * 32;
        const g = Math.round(data[i + 1] / 32) * 32;
        const b = Math.round(data[i + 2] / 32) * 32;
        const a = data[i + 3];
        if (a < 128) continue;
        const hex = `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
        colorMap.set(hex, (colorMap.get(hex) ?? 0) + 1);
      }

      URL.revokeObjectURL(url);

      const sorted = [...colorMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, count)
        .map(([hex]) => hex);

      resolve(sorted.length > 0 ? sorted : ['#7C3AED', '#1E1B4B', '#A78BFA']);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Bild konnte nicht geladen werden'));
    };

    img.src = url;
  });
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

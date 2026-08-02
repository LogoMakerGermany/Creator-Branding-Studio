/** Raster image wrapped as SVG for download convenience — not a true vector conversion. */
export function buildSvgExportFromImage(imageUrl: string, label: string): string {
  const escaped = imageUrl.replace(/"/g, '&quot;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024" viewBox="0 0 1024 1024">
  <title>${label}</title>
  <image href="${escaped}" xlink:href="${escaped}" width="1024" height="1024" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

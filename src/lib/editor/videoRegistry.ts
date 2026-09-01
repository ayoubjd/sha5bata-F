/** Shared registry of the live <video> elements used by the timeline overlay,
 *  so the exporter can grab the real decoded frames and paint them onto the
 *  output canvas (the DOM → SVG snapshot can't render <video> frames). */
const elements = new Map<string, HTMLVideoElement>();

export function registerVideoElement(id: string, el: HTMLVideoElement | null) {
  if (!el) elements.delete(id);
  else elements.set(id, el);
}

export function getVideoElement(id: string): HTMLVideoElement | undefined {
  return elements.get(id);
}
// Curated set of simple single-color SVG icons suitable for whiteboard-style
// "hand drawing" animation. All paths are stroked (no fill) so
// stroke-dashoffset animation reveals them naturally.

export interface IconDef {
  name: string;
  category: string;
  // Raw <svg> markup. viewBox 0 0 24 24. Use currentColor for stroke.
  svg: string;
}

const wrap = (paths: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

export const ICONS: IconDef[] = [
  { name: "Star", category: "Shapes", svg: wrap(`<path d="M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-7z"/>`) },
  { name: "Heart", category: "Shapes", svg: wrap(`<path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6C19 16.5 12 21 12 21z"/>`) },
  { name: "Circle", category: "Shapes", svg: wrap(`<circle cx="12" cy="12" r="9"/>`) },
  { name: "Square", category: "Shapes", svg: wrap(`<rect x="4" y="4" width="16" height="16" rx="1"/>`) },
  { name: "Triangle", category: "Shapes", svg: wrap(`<path d="M12 3l9 17H3z"/>`) },
  { name: "Arrow", category: "Shapes", svg: wrap(`<path d="M4 12h14"/><path d="M14 6l6 6-6 6"/>`) },
  { name: "Check", category: "Shapes", svg: wrap(`<path d="M4 12l5 5L20 6"/>`) },
  { name: "Cross", category: "Shapes", svg: wrap(`<path d="M6 6l12 12"/><path d="M18 6L6 18"/>`) },

  { name: "Lightbulb", category: "Ideas", svg: wrap(`<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12c1 1 2 2 2 4h4c0-2 1-3 2-4a7 7 0 0 0-4-12z"/>`) },
  { name: "Rocket", category: "Ideas", svg: wrap(`<path d="M5 19c0-4 4-11 9-14 5 3 9 10 9 14-3-1-6-1-9 0-3-1-6-1-9 0z"/><circle cx="14" cy="10" r="1.5"/>`) },
  { name: "Trophy", category: "Ideas", svg: wrap(`<path d="M8 4h8v4a4 4 0 0 1-8 0z"/><path d="M8 6H5v2a3 3 0 0 0 3 3"/><path d="M16 6h3v2a3 3 0 0 1-3 3"/><path d="M10 14h4v3h-4z"/><path d="M8 20h8"/>`) },
  { name: "Target", category: "Ideas", svg: wrap(`<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>`) },
  { name: "Gear", category: "Ideas", svg: wrap(`<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>`) },

  { name: "Person", category: "People", svg: wrap(`<circle cx="12" cy="7" r="3"/><path d="M5 21c0-4 3-7 7-7s7 3 7 7"/>`) },
  { name: "Group", category: "People", svg: wrap(`<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3 3-6 6-6s6 3 6 6"/><path d="M15 20c0-2 2-4 4-4s2 1 2 4"/>`) },
  { name: "Chat", category: "People", svg: wrap(`<path d="M4 5h16v11H8l-4 4z"/>`) },

  { name: "House", category: "Places", svg: wrap(`<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>`) },
  { name: "Book", category: "Learning", svg: wrap(`<path d="M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z"/>`) },
  { name: "Pencil", category: "Learning", svg: wrap(`<path d="M4 20l3-1L20 6l-3-3L4 16z"/><path d="M14 6l3 3"/>`) },
  { name: "Clock", category: "Time", svg: wrap(`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`) },
  { name: "Calendar", category: "Time", svg: wrap(`<rect x="3" y="5" width="18" height="16" rx="1"/><path d="M3 10h18"/><path d="M8 3v4M16 3v4"/>`) },

  { name: "Money", category: "Business", svg: wrap(`<circle cx="12" cy="12" r="9"/><path d="M9 15c0 1.5 1.5 2 3 2s3-.5 3-2-1.5-2-3-2-3-.5-3-2 1.5-2 3-2 3 .5 3 2"/><path d="M12 6v2M12 17v2"/>`) },
  { name: "Chart", category: "Business", svg: wrap(`<path d="M4 20V4"/><path d="M4 20h16"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="14" width="3" height="4"/>`) },
  { name: "Mail", category: "Business", svg: wrap(`<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 6l9 7 9-7"/>`) },
  { name: "Phone", category: "Business", svg: wrap(`<path d="M5 4h4l2 5-3 2a12 12 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2C10 21 3 14 3 6a2 2 0 0 1 2-2z"/>`) },

  { name: "Cloud", category: "Nature", svg: wrap(`<path d="M7 18a4 4 0 0 1 0-8 6 6 0 0 1 11 2 3 3 0 0 1 0 6z"/>`) },
  { name: "Sun", category: "Nature", svg: wrap(`<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2"/>`) },
  { name: "Tree", category: "Nature", svg: wrap(`<path d="M12 2l5 8h-3l4 6h-3l3 4H6l3-4H6l4-6H7z"/><path d="M12 20v2"/>`) },
  { name: "Leaf", category: "Nature", svg: wrap(`<path d="M5 19c8 0 14-6 14-14-8 0-14 6-14 14z"/><path d="M5 19l7-7"/>`) },
];

export const CATEGORIES = Array.from(new Set(ICONS.map((i) => i.category)));
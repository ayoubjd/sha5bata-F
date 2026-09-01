import brownPaper from "@/assets/bg-brown-paper.jpg";
import darkPaper from "@/assets/bg-dark-paper.jpg";
import lightPaper from "@/assets/bg-light-paper.jpg";
import sceneBg1 from "@/assets/scene bg1.png";
import sceneBg2 from "@/assets/scene bg2.jpeg";
import sceneBg3 from "@/assets/scene bg3.jpg";
import sceneBg4 from "@/assets/scene bg4.jpeg";
import sceneBg5 from "@/assets/scene bg5.jpeg";
import sceneBg6 from "@/assets/scene bg6.jpeg";
import sceneBg7 from "@/assets/scene bg7.jpeg";
import sceneBg8 from "@/assets/scene bg8.jpeg";
import sceneBg9 from "@/assets/scene bg9.jpeg";
import sceneBg10 from "@/assets/scene bg10.jpeg";
import sceneBg11 from "@/assets/scene bg11.jpeg";
import sceneBg12 from "@/assets/scene bg12.jpeg";

export interface BackgroundPreset {
  id: string;
  name: string;
  src: string;
  /** Sensible default ink colour on top of this paper. */
  ink: string;
}

export const BACKGROUNDS: BackgroundPreset[] = [
  { id: "brown-paper", name: "Aged brown paper", src: brownPaper, ink: "#f6ead2" },
  { id: "dark-paper", name: "Dark crumpled paper", src: darkPaper, ink: "#f2f0e9" },
  { id: "light-paper", name: "Old parchment", src: lightPaper, ink: "#2a2018" },
  { id: "scene-bg-1", name: "Scene background 1", src: sceneBg1, ink: "#ffffff" },
  { id: "scene-bg-2", name: "Scene background 2", src: sceneBg2, ink: "#ffffff" },
  { id: "scene-bg-3", name: "Scene background 3", src: sceneBg3, ink: "#ffffff" },
  { id: "scene-bg-4", name: "Scene background 4", src: sceneBg4, ink: "#ffffff" },
  { id: "scene-bg-5", name: "Scene background 5", src: sceneBg5, ink: "#ffffff" },
  { id: "scene-bg-6", name: "Scene background 6", src: sceneBg6, ink: "#ffffff" },
  { id: "scene-bg-7", name: "Scene background 7", src: sceneBg7, ink: "#ffffff" },
  { id: "scene-bg-8", name: "Scene background 8", src: sceneBg8, ink: "#ffffff" },
  { id: "scene-bg-9", name: "Scene background 9", src: sceneBg9, ink: "#ffffff" },
  { id: "scene-bg-10", name: "Scene background 10", src: sceneBg10, ink: "#ffffff" },
  { id: "scene-bg-11", name: "Scene background 11", src: sceneBg11, ink: "#ffffff" },
  { id: "scene-bg-12", name: "Scene background 12", src: sceneBg12, ink: "#ffffff" },
];

export function backgroundById(id?: string | null) {
  return BACKGROUNDS.find((b) => b.id === id);
}

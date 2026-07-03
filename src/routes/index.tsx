import { createFileRoute } from "@tanstack/react-router";
import TireStudio from "@/components/TireStudio";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tire Studio — 3D Off-Road Tire Generator" },
      {
        name: "description",
        content:
          "Design and export chunky 3D off-road tires with custom typography tread. Upload a font, type any text, tweak the sliders, then export GLB or PNG.",
      },
      { property: "og:title", content: "Tire Studio — 3D Off-Road Tire Generator" },
      {
        property: "og:description",
        content: "Build custom typography-tread off-road tires and export them.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#0a0a0a" },
    ],
    links: [
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/icon-512.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/icon-512.png" },
    ],
  }),
  component: Index,
});

function Index() {
  return <TireStudio />;
}

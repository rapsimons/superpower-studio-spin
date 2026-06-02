import { createFileRoute } from "@tanstack/react-router";
import TireHero from "@/components/TireHero";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Superpower Studio" },
      { name: "description", content: "Immersive 3D tire hero — Superpower Studio." },
      { property: "og:title", content: "Superpower Studio" },
      { property: "og:description", content: "Immersive 3D tire hero — Superpower Studio." },
    ],
  }),
  component: Index,
});

function Index() {
  return <TireHero />;
}

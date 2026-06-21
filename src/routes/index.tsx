import { createFileRoute } from "@tanstack/react-router";
import prototypeHtml from "@/assets/speclens-prototype.html?raw";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SpecLens — competitive research for product managers" },
      {
        name: "description",
        content:
          "Turn messy competitor docs into a structured, attribute-tagged comparison table before you write your spec.",
      },
      { property: "og:title", content: "SpecLens" },
      {
        property: "og:description",
        content: "Competitive research, attribute-tagged and ready to compare.",
      },
    ],
  }),
  component: SpecLensPage,
});

function SpecLensPage() {
  return (
    <iframe
      srcDoc={prototypeHtml}
      title="SpecLens"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        border: 0,
      }}
    />
  );
}


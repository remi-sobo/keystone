import type { MetadataRoute } from "next";

// The PWA manifest: Keystone installs to a home screen with the arch
// mark (public/logo-mark.png, rendered to public/icons at build-asset
// time). Colors are the frozen design tokens: paper for the canvas and
// paper-deep for the chrome, warm and never stark (DESIGN.md).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Keystone",
    short_name: "Keystone",
    description: "Where your engagement lives.",
    start_url: "/",
    display: "standalone",
    background_color: "#FBF4EA",
    theme_color: "#F3EADC",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

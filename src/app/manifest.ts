import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Branchwise",
    short_name: "Branchwise",
    description: "Learn Git and GitHub by watching every command move the commit graph.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f5f8",
    theme_color: "#18202e",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}

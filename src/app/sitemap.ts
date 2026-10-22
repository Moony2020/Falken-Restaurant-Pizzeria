import type { MetadataRoute } from "next";
import { site } from "@/data/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/meny", "/galleri", "/kontakt"].map((path) => ({
    url: `${site.url}${path}`,
    changeFrequency: path === "/meny" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.8,
  }));
}

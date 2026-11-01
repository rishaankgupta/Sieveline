import type { MetadataRoute } from "next";

const base = () => process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/sign-up", "/privacy", "/terms"].map((p) => ({ url: `${base()}${p}`, changeFrequency: "monthly" as const }));
}

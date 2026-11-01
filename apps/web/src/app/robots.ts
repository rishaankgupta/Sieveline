import type { MetadataRoute } from "next";

const base = () => process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: ["/", "/privacy", "/terms"], disallow: ["/app", "/admin", "/api", "/invite"] }], sitemap: `${base()}/sitemap.xml` };
}

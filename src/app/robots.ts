import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard/", "/api/", "/login", "/signup", "/listing/", "/cmd_sco", "/go/"],
    },
    sitemap: "https://usethrml.com/sitemap.xml",
  }
}

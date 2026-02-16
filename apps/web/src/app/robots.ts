import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard/", "/team/", "/settings/", "/api/", "/home/"],
    },
    sitemap: "https://revualy.com/sitemap.xml",
  };
}

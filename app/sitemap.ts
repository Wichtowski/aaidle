import type { MetadataRoute } from "next";
import { classicCategories, classicCategoryDetails } from "../lib/domain/models/model-types";

const siteUrl = "https://aaidle.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const classicPages = classicCategories
    .filter((category) => category !== "hardcore")
    .map((category) => ({
      url: `${siteUrl}/classic/${classicCategoryDetails[category].routeSegment}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    }));

  return [
    {
      url: siteUrl,
      changeFrequency: "daily",
      priority: 1,
    },
    ...classicPages,
    {
      url: `${siteUrl}/credits`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${siteUrl}/privacy/v1`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}

const classicCategoryLabels: Record<string, string> = {
  "language-model": "LLM",
  llm: "LLM",
  "computer-vision": "CV",
  cv: "CV",
  nlp: "NLP",
  "object-detection": "OD",
  od: "OD",
  "classical-ml": "Classical ML",
  filters: "Filters",
};

export function timelineCategoryLabel(categories: readonly string[] | undefined, itemKind: string) {
  const category = categories?.find((value) => classicCategoryLabels[value]);
  return category ? classicCategoryLabels[category] : itemKind[0]!.toUpperCase() + itemKind.slice(1);
}

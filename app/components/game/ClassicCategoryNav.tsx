import Link from "next/link";
import { classicCategories, classicCategoryDetails, type ClassicCategory } from "../../../lib/domain/models/model-types";
import { useLocalProgress } from "../../../lib/storage/use-local-progress";

export function ClassicCategoryNav({ category }: { category: ClassicCategory }) {
  const progress = useLocalProgress();
  return (
    <nav aria-label="Classic category" className="classic-category-nav">
      {classicCategories
        .filter((item) => item !== "hardcore" || progress.preferences.hardcoreUnlocked)
        .map((item) => (
          <Link aria-current={item === category ? "page" : undefined} href={`/classic/${item}`} key={item} prefetch>
            {classicCategoryDetails[item].label}
          </Link>
        ))}
    </nav>
  );
}

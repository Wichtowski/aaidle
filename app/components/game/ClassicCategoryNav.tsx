import Link from "next/link";
import { classicCategories, classicCategoryDetails, type ClassicCategory } from "../../../lib/domain/models/model-types";
import { useLocalProgress } from "../../../lib/storage/use-local-progress";
import { useAuth } from "../auth/useAuth";

export function ClassicCategoryNav({ category }: { category: ClassicCategory }) {
  const { user } = useAuth();
  const progress = useLocalProgress();
  return (
    <nav aria-label="Classic category" className="classic-category-nav">
      {classicCategories
        .filter(
          (item) =>
            item !== "hardcore" ||
            Boolean(user && progress.preferences.hardcoreUnlocked),
        )
        .map((item) => (
          <Link aria-current={item === category ? "page" : undefined} href={`/classic/${classicCategoryDetails[item].routeSegment}`} key={item} prefetch>
            {classicCategoryDetails[item].label}
          </Link>
        ))}
    </nav>
  );
}

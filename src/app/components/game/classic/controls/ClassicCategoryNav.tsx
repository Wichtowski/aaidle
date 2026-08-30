import { Link } from "react-router-dom";
import {
  classicCategories,
  classicCategoryDetails,
  type ClassicCategory,
} from "@lib/domain/models/model-types";
import { useLocalProgress } from "@lib/storage/use-local-progress";
import { useAuth } from "../../../auth/useAuth";

export function ClassicCategoryNav({ category }: { category: ClassicCategory }) {
  const { hardcoreUnlocked, user } = useAuth();
  const progress = useLocalProgress();
  const showOnlyHardcore = progress.preferences.innerCircleActive && hardcoreUnlocked;
  return (
    <nav aria-label="Classic category" className="classic-category-nav">
      {classicCategories
        .filter((item) =>
          showOnlyHardcore
            ? item === "hardcore"
            : item !== "hardcore" || Boolean(user && hardcoreUnlocked),
        )
        .map((item) => (
          <Link
            aria-current={item === category ? "page" : undefined}
            to={`/classic/${classicCategoryDetails[item].routeSegment}`}
            key={item}
            prefetch="intent"
            preventScrollReset
            replace
          >
            {classicCategoryDetails[item].label}
          </Link>
        ))}
    </nav>
  );
}

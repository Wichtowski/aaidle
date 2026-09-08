import { Link, useNavigate } from "react-router-dom";
import {
  classicCategories,
  classicCategoryDetails,
  type ClassicCategory,
} from "@lib/domain/models/model-types";
import { useLocalProgress } from "@lib/storage/use-local-progress";
import { useAuth } from "../../../auth/useAuth";

export function ClassicCategoryNav({ category }: { category: ClassicCategory }) {
  const navigate = useNavigate();
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
            onClick={(event) => {
              if (
                item === category ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              ) {
                return;
              }

              event.preventDefault();
              const isHardcoreTransition = category === "hardcore" || item === "hardcore";
              const destination = `/classic/${classicCategoryDetails[item].routeSegment}${isHardcoreTransition ? "?transition=classic" : ""}`;
              if (isHardcoreTransition) {
                document.body.classList.add("classic-page-transitioning");
                window.setTimeout(() => navigate(destination, { replace: true }), 450);
              } else {
                navigate(destination, { replace: true });
              }
            }}
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

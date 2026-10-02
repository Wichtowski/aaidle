import { useContext, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useLocalProgress } from "@lib/storage/use-local-progress";
import {
  adjacentGameDate,
  compactGameDate,
  dailyGamePath,
  firstGameDate,
} from "@lib/domain/challenges/historical-dates";
import { AuthContext } from "../../../auth/auth-context";

export function GameDateNavigation({ date, basePath }: { date: string; basePath: string }) {
  const auth = useContext(AuthContext);
  const progress = useLocalProgress();
  const today = progress.streaks?.currentGameDate;
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (
      auth?.user &&
      today &&
      date === today &&
      location.pathname.endsWith(`/${compactGameDate(today)}`)
    ) {
      navigate(basePath, { replace: true });
    }
  }, [auth?.user, basePath, date, location.pathname, navigate, today]);
  if (!auth?.user || !today || date < firstGameDate || date > today) return <>{date}</>;
  return (
    <span className="game-date-navigation" role="group" aria-label="Daily game dates">
      {date > firstGameDate && (
        <Link
          aria-label="Previous daily game"
          to={dailyGamePath(basePath, adjacentGameDate(date, -1), today)}
        >
          ←
        </Link>
      )}
      <span>
        {date}
        {date < today ? " · History" : ""}
      </span>
      {date < today && (
        <Link
          aria-label="Next daily game"
          to={dailyGamePath(basePath, adjacentGameDate(date, 1), today)}
        >
          →
        </Link>
      )}
    </span>
  );
}

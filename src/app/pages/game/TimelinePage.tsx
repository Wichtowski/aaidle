import { TimelineGame } from "@components/game";
import { useParams } from "react-router-dom";

export function TimelinePage() {
  const { date } = useParams();
  return <TimelineGame key={date ?? "today"} requestedDate={date} />;
}

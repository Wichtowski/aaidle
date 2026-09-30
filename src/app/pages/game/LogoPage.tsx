import { LogoGame } from "@components/game";
import { useParams } from "react-router-dom";

export function LogoPage() {
  const { date } = useParams();
  return <LogoGame key={date ?? "today"} requestedDate={date} />;
}

import { Button } from "./Button";
import { FaMugHot } from "react-icons/fa6";

export function BuyMeCoffeeLink({ hardcore = false }: { hardcore?: boolean }) {
  return (
    <Button
      variant="3d"
      size="small"
      href="https://ko-fi.com/wichtowski"
      rel="noreferrer"
      target="_blank"
    >
      <FaMugHot aria-hidden="true" /> Buy me a {hardcore ? <>Monster&trade;</> : "coffee"}
    </Button>
  );
}

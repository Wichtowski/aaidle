import { FaMugHot } from "react-icons/fa6";

export function BuyMeCoffeeLink({ hardcore = false }: { hardcore?: boolean }) {
  return (
    <a
      className="coffee-button coffee-button--header"
      href="https://ko-fi.com/wichtowski"
      rel="noreferrer"
      target="_blank"
    >
      <span className="coffee-button__face">
        <FaMugHot aria-hidden="true" /> Buy me a {hardcore ? <>Monster&trade;</> : "coffee"}
      </span>
    </a>
  );
}

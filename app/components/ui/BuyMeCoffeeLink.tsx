import { FaMugHot } from "react-icons/fa6";

export function BuyMeCoffeeLink() {
  return (
    <a
      className="coffee-button coffee-button--header"
      href="https://buymeacoffee.com/wichtowski"
      rel="noreferrer"
      target="_blank"
    >
      <FaMugHot aria-hidden="true" /> Buy me a coffee
    </a>
  );
}

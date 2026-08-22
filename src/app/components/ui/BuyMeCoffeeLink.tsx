export function BuyMeCoffeeLink({ hardcore = false }: { hardcore?: boolean }) {
  return (
    <a
      className="coffee-button coffee-button--header"
      href="https://ko-fi.com/wichtowski"
      rel="noreferrer"
      target="_blank"
    >
      <span aria-hidden="true">☕</span> Buy me a {hardcore ? <>Monster&trade;</> : "coffee"}
    </a>
  );
}

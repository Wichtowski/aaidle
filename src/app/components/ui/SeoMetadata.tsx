import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const defaultMetadata = {
  title: "aAIdle | Daily AI Model Guessing Game",
  description: "Play a new daily AI model guessing game. Compare model clues, make your guess, and build your streak.",
};

const routeMetadata = [
  {
    matches: (pathname: string) => pathname === "/classic" || pathname.startsWith("/classic/"),
    title: "Classic | aAIdle Daily AI Model Guessing Game",
    description: "Compare AI model clues and identify today’s model in the Classic daily guessing game.",
  },
  {
    matches: (pathname: string) => pathname === "/emoji",
    title: "Emoji | aAIdle Daily AI Model Guessing Game",
    description: "Identify today’s AI model from emoji clues in the Emoji daily guessing game.",
  },
  {
    matches: (pathname: string) => pathname === "/timeline",
    title: "Timeline | aAIdle Daily AI Model Guessing Game",
    description: "Arrange AI models in release order in the Timeline daily guessing game.",
  },
  {
    matches: (pathname: string) => pathname === "/logo",
    title: "Logo | aAIdle Daily AI Model Guessing Game",
    description:
      "Identify today’s AI model or technology from a progressively revealed image and educational clues.",
  },
];

const privateRoutePatterns = ["/login", "/register", "/reset-password", "/delete-account", "/report-issue", "/account-disabled", "/profile", "/admin"];
function setMetaContent(selector: string, content: string) {
  const element = document.querySelector<HTMLMetaElement>(selector);
  if (element) element.content = content;
}

export function SeoMetadata() {
  const { pathname } = useLocation();

  useEffect(() => {
    const metadata = routeMetadata.find((route) => route.matches(pathname)) ?? defaultMetadata;
    const isPrivateRoute = privateRoutePatterns.some((route) => pathname === route || pathname.startsWith(`${route}/`));
    const canonical = document.querySelector<HTMLLinkElement>("link[rel=\"canonical\"]");

    document.title = metadata.title;
    setMetaContent("meta[name=\"description\"]", metadata.description);
    setMetaContent("meta[name=\"robots\"]", isPrivateRoute ? "noindex,nofollow" : "index,follow");
    setMetaContent("meta[property=\"og:title\"]", metadata.title);
    setMetaContent("meta[property=\"og:description\"]", metadata.description);
    setMetaContent("meta[name=\"twitter:title\"]", metadata.title);
    setMetaContent("meta[name=\"twitter:description\"]", metadata.description);

    if (canonical) canonical.href = new URL(pathname, window.location.origin).href;
  }, [pathname]);

  return null;
}

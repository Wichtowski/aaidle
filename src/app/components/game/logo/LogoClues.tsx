import { useState } from "react";
import { FaCheck, FaQuestion } from "react-icons/fa6";
import type { LogoGamePayload } from "@lib/api/client";
import { HowToPlayDialog } from "../common/dialogs/HowToPlayDialog";

type Clue = LogoGamePayload["progress"]["clues"][number];

export function LogoClues({
  clues,
  viewedClues,
  onView,
}: {
  clues: Clue[];
  viewedClues: number[];
  onView: (index: number) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const clue = selected === null ? undefined : clues[selected];

  return (
    <>
      <aside className="logo-clue-rail" aria-label="Available clues">
        {clues.map((item, index) => {
          const viewed = viewedClues.includes(index);
          const label = `Clue ${index + 1}: ${item.kind}, ${viewed ? "viewed" : "available"}`;
          return (
            <button
              aria-label={label}
              aria-haspopup="dialog"
              className={`logo-clue-rail__icon${viewed ? " is-viewed" : ""}`}
              key={index}
              onClick={() => {
                setSelected(index);
                setImageFailed(false);
                onView(index);
              }}
              title={label}
              type="button"
            >
              {viewed ? <FaCheck aria-hidden="true" /> : <FaQuestion aria-hidden="true" />}
            </button>
          );
        })}
        <span className="sr-only" role="status">
          {clues.length > 0 ? `${clues.length} clues available` : ""}
        </span>
      </aside>
      {clue && (
        <HowToPlayDialog
          closeLabel="Close clue"
          description={
            clue.afterIncorrectGuesses === 0
              ? "Available from the start."
              : `Unlocked after ${clue.afterIncorrectGuesses} incorrect guesses.`
          }
          eyebrow="Logo clue · Viewed"
          onClose={() => setSelected(null)}
          open
          title={`Clue ${(selected ?? 0) + 1}`}
        >
          <div className="logo-clue-content">
            {clue.text && <p>{clue.text}</p>}
            {clue.imageUrl && (
              <img
                alt={`Image for clue ${(selected ?? 0) + 1}`}
                onError={() => setImageFailed(true)}
                src={clue.imageUrl}
              />
            )}
            {imageFailed && (
              <p role="status">
                The clue image could not be loaded. Close and reopen the clue to try again.
              </p>
            )}
          </div>
        </HowToPlayDialog>
      )}
    </>
  );
}

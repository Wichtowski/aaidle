import { DailyCountdown } from "./DailyCountdown";
import { GuessAutocomplete } from "./GuessAutocomplete";
import { ClassicCategoryNav } from "./ClassicCategoryNav";
import { classicCategoryDetails, type ClassicCategory, type ClassicDifficulty, type PublicModelIndex } from "../../../lib/domain/models/model-types";

const difficultyLabels: Record<ClassicDifficulty, string> = { normal: "Normal", challenge: "Challenge", hardcore: "Hardcore" };

export function ClassicGameControls({
  category,
  date,
  expiresAt,
  models,
  difficulty,
  loading,
  busy,
  canGuess,
  guessed,
  onDifficultyChange,
  onPick,
  onSecretCode,
}: {
  category: ClassicCategory;
  date: string | null;
  expiresAt: string | null;
  models: PublicModelIndex[];
  difficulty: ClassicDifficulty;
  loading: boolean;
  busy: boolean;
  canGuess: boolean;
  guessed: Set<string>;
  onDifficultyChange: (difficulty: ClassicDifficulty) => void;
  onPick: (model: PublicModelIndex) => void;
  onSecretCode?: (code: string) => void;
}) {
  const choices = (category === "hardcore" ? ["hardcore"] : ["normal", "challenge"]) as ClassicDifficulty[];
  return (
    <section className="game-intro">
      <div className="game-intro__meta">
        <p className="eyebrow">Classic · {date ?? "Loading"} · {classicCategoryDetails[category].label}</p>
        {expiresAt && <DailyCountdown expiresAt={expiresAt} />}
      </div>
      <h1>{category === "hardcore" ? "Pray you guess today’s AI model." : "Guess today’s AI model"}</h1>
      <p className="lede">
        {category === "hardcore"
          ? "Every model leaves a sulfurous trail. Follow it before the clues drag you somewhere warmer."
          : "Every model leaves a trail. Follow it until the answer reveals itself."}
      </p>
      <ClassicCategoryNav category={category} />
      {category !== "hardcore" && (
        <div aria-busy={loading} className="game-intro__difficulty">
          <span>Difficulty</span>
          <div className="difficulty-switch" aria-label="Classic difficulty" role="group">
            {choices.map((option) => (
              <button aria-pressed={option === difficulty} disabled={loading && option !== difficulty} key={option} onClick={() => onDifficultyChange(option)} type="button">
                {difficultyLabels[option]}
              </button>
            ))}
          </div>
        </div>
      )}
      {date && canGuess && <GuessAutocomplete disabled={busy || loading} models={models} excluded={guessed} onPick={onPick} onSecretCode={onSecretCode} />}
      {busy && <p aria-live="polite" className="attempts">Checking…</p>}
    </section>
  );
}

import { GuessAutocomplete } from "./GuessAutocomplete";
import { ClassicCategoryNav } from "./ClassicCategoryNav";
import { GameEyebrow } from "../../common/layout/GameEyebrow";
import { GameIntro } from "../../common/layout/GameLayout";
import { DifficultySwitch } from "../../common/layout/DifficultySwitch";
import { utcDate } from "@lib/utils/dates";
import {
  classicCategoryDetails,
  type ClassicCategory,
  type ClassicDifficulty,
  type PublicModelIndex,
} from "@lib/domain/models/model-types";

const difficultyLabels: Record<ClassicDifficulty, string> = {
  normal: "Normal",
  challenge: "Challenge",
  hardcore: "Hardcore",
};

function resolveCategoryLabelToLongName(label: string): string {
  switch (label) {
    case "LLM":
      return "Large Language Model";
    case "CV":
      return "Computer Vision";
    case "NLP":
      return "Natural Language Processing";
    case "OD":
      return "Object Detection";
    case "Classical ML":
      return "Classical Machine Learning";
    case "Filters":
      return "Linear & Non-Linear Filters";
    default:
      return label;
  }
}

export function ClassicGameControls({
  category,
  date,
  expiresAt,
  models,
  difficulty,
  loading,
  busy,
  canGuess,
  completedCount,
  guessed,
  onDifficultyChange,
  onPick,
}: {
  category: ClassicCategory;
  date: string | null;
  expiresAt: string | null;
  models: PublicModelIndex[];
  difficulty: ClassicDifficulty;
  loading: boolean;
  busy: boolean;
  canGuess: boolean;
  completedCount: number;
  guessed: Set<string>;
  onDifficultyChange: (difficulty: ClassicDifficulty) => void;
  onPick: (model: PublicModelIndex) => void;
}) {
  const choices = (
    category === "hardcore" ? ["hardcore"] : ["normal", "challenge"]
  ) as ClassicDifficulty[];
  return (
    <GameIntro
      completionCount={canGuess ? null : completedCount}
      description={
        category === "hardcore"
          ? "Every model leaves a sulfurous trail. Follow it before the clues drag you somewhere warmer."
          : "Every model leaves a trail. Follow it until the answer reveals itself."
      }
      difficulty={
        category !== "hardcore" && (
          <DifficultySwitch
            ariaLabel="Classic difficulty"
            disabled={(option) => loading && option.value !== difficulty}
            loading={loading}
            onChange={(value) => onDifficultyChange(value as ClassicDifficulty)}
            options={choices.map((option) => ({ value: option, label: difficultyLabels[option] }))}
            selected={difficulty}
            testId="classic-difficulty"
          />
        )
      }
      expiresAt={expiresAt}
      eyebrow={
        <GameEyebrow
          date={date ?? utcDate()}
          game="Classic"
          variant={resolveCategoryLabelToLongName(classicCategoryDetails[category].label)}
        />
      }
      input={
        date &&
        canGuess && (
          <GuessAutocomplete
            category={category}
            disabled={busy || loading}
            models={models}
            excluded={guessed}
            onPick={onPick}
          />
        )
      }
      navigation={<ClassicCategoryNav category={category} />}
      reserveInputSlot
      status={
        busy && (
          <p aria-live="polite" className="attempts">
            Checking…
          </p>
        )
      }
      title={
        category === "hardcore" ? "Pray you guess today’s AI model." : "Guess today’s AI model"
      }
    />
  );
}

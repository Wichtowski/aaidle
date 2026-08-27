type DifficultyOption = {
  value: string;
  label: string;
  description?: string;
};

export function DifficultySwitch({
  ariaLabel,
  disabled = false,
  loading = false,
  onChange,
  options,
  selected,
  testId,
}: {
  ariaLabel: string;
  disabled?: boolean | ((option: DifficultyOption) => boolean);
  loading?: boolean;
  onChange: (value: string) => void;
  options: readonly DifficultyOption[];
  selected: string;
  testId: string;
}) {
  return (
    <div aria-busy={loading} className="game-intro__difficulty">
      <span>Difficulty</span>
      <div
        aria-label={ariaLabel}
        className="difficulty-switch"
        data-testid={testId}
        role="group"
      >
        {options.map((option) => (
          <button
            aria-pressed={option.value === selected}
            disabled={typeof disabled === "function" ? disabled(option) : disabled}
            key={option.value}
            onClick={() => onChange(option.value)}
            title={option.description}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

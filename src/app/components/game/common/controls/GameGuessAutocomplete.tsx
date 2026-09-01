import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type GameGuessAutocompleteProps<Option> = {
  className: string;
  confirmLabel?: string;
  confirmTestId?: string;
  disabled?: boolean;
  fieldClassName?: string;
  getOptionKey: (option: Option) => string;
  idPrefix: string;
  inputId: string;
  inputName?: string;
  inputContainerClassName?: string;
  label: string;
  onQueryChange: (query: string) => void;
  onSelect: (option: Option) => void;
  options: Option[];
  placeholder: string;
  query: string;
  renderOption: (option: Option) => ReactNode;
  isOptionDisabled?: (option: Option) => boolean;
  toolDescription?: string;
  toolName?: string;
  toolParamDescription?: string;
};

export function GameGuessAutocomplete<Option>({
  className,
  confirmLabel = "Guess",
  confirmTestId,
  disabled = false,
  fieldClassName = "autocomplete__field",
  getOptionKey,
  idPrefix,
  inputId,
  inputName,
  inputContainerClassName = "game-guess-autocomplete__input",
  isOptionDisabled = () => false,
  label,
  onQueryChange,
  onSelect,
  options,
  placeholder,
  query,
  renderOption,
  toolDescription,
  toolName,
  toolParamDescription,
}: GameGuessAutocompleteProps<Option>) {
  const rootRef = useRef<HTMLFormElement>(null);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    window.addEventListener("pointerdown", closeOnOutsidePress);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePress);
  }, []);

  useEffect(() => {
    if (activeIndex >= 0) optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const availableIndexes = options
    .map((option, index) => ({ index, disabled: disabled || isOptionDisabled(option) }))
    .filter((option) => !option.disabled)
    .map((option) => option.index);
  const firstAvailableIndex = availableIndexes[0] ?? -1;
  const selectedIndex = availableIndexes.includes(activeIndex) ? activeIndex : firstAvailableIndex;
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const expanded = open && options.length > 0;

  const close = () => {
    setOpen(false);
    setActiveIndex(-1);
  };

  const choose = (option: Option) => {
    if (disabled || isOptionDisabled(option)) return;
    close();
    onSelect(option);
  };

  const moveActiveOption = (direction: 1 | -1) => {
    if (!availableIndexes.length) return;
    setOpen(true);
    setActiveIndex((current) => {
      const position = availableIndexes.indexOf(current);
      if (position === -1) {
        return direction === 1
          ? availableIndexes[0]
          : availableIndexes[availableIndexes.length - 1];
      }
      return availableIndexes[(position + direction + availableIndexes.length) % availableIndexes.length];
    });
  };

  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        if (selected) choose(selected);
      }}
      ref={rootRef}
      toolname={toolName}
      tooldescription={toolDescription}
    >
      <label htmlFor={inputId}>{label}</label>
      <div className={fieldClassName}>
        <div className={inputContainerClassName}>
          <input
            aria-activedescendant={
              expanded && activeIndex >= 0 ? `${idPrefix}-option-${activeIndex}` : undefined
            }
            aria-autocomplete="list"
            aria-controls={`${idPrefix}-options`}
            aria-expanded={expanded}
            autoComplete="off"
            disabled={disabled}
            id={inputId}
            name={inputName}
            onChange={(event) => {
              const value = event.target.value;
              onQueryChange(value);
              setOpen(value.trim().length > 0);
              setActiveIndex(-1);
            }}
            onFocus={() => {
              if (query.trim() && options.length) setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                moveActiveOption(event.key === "ArrowDown" ? 1 : -1);
              } else if (event.key === "Escape") {
                close();
              }
            }}
            placeholder={placeholder}
            role="combobox"
            toolparamdescription={toolParamDescription}
            value={query}
          />
          {expanded && (
            <ul id={`${idPrefix}-options`} role="listbox">
              {options.map((option, index) => {
                const optionDisabled = disabled || isOptionDisabled(option);
                const active = index === activeIndex;
                return (
                  <li
                    aria-disabled={optionDisabled}
                    aria-selected={active}
                    id={`${idPrefix}-option-${index}`}
                    key={getOptionKey(option)}
                    ref={(element) => {
                      optionRefs.current[index] = element;
                    }}
                    role="option"
                  >
                    <button
                      className={active ? "is-active" : undefined}
                      disabled={optionDisabled}
                      onClick={() => choose(option)}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => {
                        if (!optionDisabled) setActiveIndex(index);
                      }}
                      type="button"
                    >
                      {renderOption(option)}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <button
          className="autocomplete__confirm"
          data-testid={confirmTestId}
          disabled={!selected || disabled}
          type="submit"
        >
          {confirmLabel}
        </button>
      </div>
    </form>
  );
}

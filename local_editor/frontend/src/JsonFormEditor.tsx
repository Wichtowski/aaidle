import { useState } from "react";

export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

type ValueKind = "string" | "number" | "boolean" | "object" | "array" | "null";

type JsonFormEditorProps = {
  value: JsonObject;
  onChange: (value: JsonObject) => void;
  disabled?: boolean;
  readOnlyKeys?: string[];
  requiredKeys?: string[];
  errors?: Record<string, string>;
};

type ValueEditorProps = {
  label: string;
  value: JsonValue;
  onChange: (value: JsonValue) => void;
  onRemove?: () => void;
  disabled: boolean;
  required?: boolean;
  error?: string;
};

const valueKinds: ValueKind[] = ["string", "number", "boolean", "object", "array", "null"];

function kindOf(value: JsonValue): ValueKind {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value as ValueKind;
}

function emptyValue(kind: ValueKind): JsonValue {
  if (kind === "number") return 0;
  if (kind === "boolean") return false;
  if (kind === "object") return {};
  if (kind === "array") return [];
  if (kind === "null") return null;
  return "";
}

function emptyLike(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return [];
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, emptyLike(child)]),
    ) as JsonObject;
  }
  return emptyValue(kindOf(value));
}

function AddValueControl({
  label,
  initialKind,
  onAdd,
  disabled,
}: {
  label: string;
  initialKind: ValueKind;
  onAdd: (kind: ValueKind) => void;
  disabled: boolean;
}) {
  const [kind, setKind] = useState<ValueKind>(initialKind);

  return (
    <div className="add-value-control">
      <select
        aria-label={`${label} type`}
        value={kind}
        onChange={(event) => setKind(event.target.value as ValueKind)}
        disabled={disabled}
      >
        {valueKinds.map((entry) => (
          <option key={entry}>{entry}</option>
        ))}
      </select>
      <button type="button" className="add-button" onClick={() => onAdd(kind)} disabled={disabled}>
        {label}
      </button>
    </div>
  );
}

function ObjectEditor({
  value,
  onChange,
  disabled,
  readOnlyKeys = [],
  requiredKeys = [],
  errors = {},
}: {
  value: JsonObject;
  onChange: (value: JsonObject) => void;
  disabled: boolean;
  readOnlyKeys?: string[];
  requiredKeys?: string[];
  errors?: Record<string, string>;
}) {
  const [propertyName, setPropertyName] = useState("");
  const [propertyKind, setPropertyKind] = useState<ValueKind>("string");

  function addProperty() {
    const name = propertyName.trim();
    if (!name || Object.hasOwn(value, name)) return;
    onChange({ ...value, [name]: emptyValue(propertyKind) });
    setPropertyName("");
  }

  return (
    <div className="object-fields">
      {Object.entries(value).map(([key, child]) => (
        <ValueEditor
          key={key}
          label={key}
          value={child}
          onChange={(nextValue) => onChange({ ...value, [key]: nextValue })}
          onRemove={
            readOnlyKeys.includes(key) || requiredKeys.includes(key)
              ? undefined
              : () => {
                  const nextValue = { ...value };
                  delete nextValue[key];
                  onChange(nextValue);
                }
          }
          disabled={disabled || readOnlyKeys.includes(key)}
          required={requiredKeys.includes(key)}
          error={errors[key]}
        />
      ))}
      <div className="add-property">
        <input
          aria-label="New field name"
          value={propertyName}
          onChange={(event) => setPropertyName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addProperty();
            }
          }}
          placeholder="New field name"
          disabled={disabled}
        />
        <select
          aria-label="New field type"
          value={propertyKind}
          onChange={(event) => setPropertyKind(event.target.value as ValueKind)}
          disabled={disabled}
        >
          {valueKinds.map((entry) => (
            <option key={entry}>{entry}</option>
          ))}
        </select>
        <button
          type="button"
          className="add-button"
          onClick={addProperty}
          disabled={disabled || !propertyName.trim() || Object.hasOwn(value, propertyName.trim())}
        >
          Add field
        </button>
      </div>
    </div>
  );
}

function ValueEditor({
  label,
  value,
  onChange,
  onRemove,
  disabled,
  required = false,
  error,
}: ValueEditorProps) {
  const kind = kindOf(value);

  if (Array.isArray(value)) {
    const inferredKind = value.length ? kindOf(value[value.length - 1]) : "string";
    return (
      <fieldset className="json-group">
        <legend>
          {label}
          {required && <span className="required-mark"> *</span>}
          <span className="value-type">list</span>
        </legend>
        {error && <p className="field-error">{error}</p>}
        {value.length ? (
          value.map((child, index) => (
            <ValueEditor
              key={index}
              label={`Item ${index + 1}`}
              value={child}
              onChange={(nextValue) =>
                onChange(value.map((entry, position) => (position === index ? nextValue : entry)))
              }
              onRemove={() => onChange(value.filter((_, position) => position !== index))}
              disabled={disabled}
            />
          ))
        ) : (
          <p className="empty-value">No items</p>
        )}
        <AddValueControl
          key={inferredKind}
          label="Add item"
          initialKind={inferredKind}
          onAdd={(nextKind) => {
            const template = value.at(-1);
            onChange([
              ...value,
              template !== undefined && kindOf(template) === nextKind
                ? emptyLike(template)
                : emptyValue(nextKind),
            ]);
          }}
          disabled={disabled}
        />
        {onRemove && (
          <button type="button" className="remove-group" onClick={onRemove} disabled={disabled}>
            Remove list
          </button>
        )}
      </fieldset>
    );
  }

  if (value && typeof value === "object") {
    return (
      <fieldset className="json-group">
        <legend>
          {label}
          {required && <span className="required-mark"> *</span>}
          <span className="value-type">object</span>
        </legend>
        {error && <p className="field-error">{error}</p>}
        <ObjectEditor value={value} onChange={onChange} disabled={disabled} />
        {onRemove && (
          <button type="button" className="remove-group" onClick={onRemove} disabled={disabled}>
            Remove object
          </button>
        )}
      </fieldset>
    );
  }

  return (
    <div className="primitive-field">
      <label>
        <span>
          {label}
          {required && <span className="required-mark"> *</span>}
          <span className="value-type">{kind}</span>
        </span>
        {kind === "boolean" ? (
          <input
            className="boolean-input"
            type="checkbox"
            checked={value as boolean}
            onChange={(event) => onChange(event.target.checked)}
            disabled={disabled}
            aria-invalid={Boolean(error)}
          />
        ) : kind === "null" ? (
          <select
            value="null"
            onChange={(event) => onChange(emptyValue(event.target.value as ValueKind))}
            disabled={disabled}
            aria-invalid={Boolean(error)}
          >
            {valueKinds.map((entry) => (
              <option key={entry}>{entry}</option>
            ))}
          </select>
        ) : kind === "number" ? (
          <input
            type="number"
            value={value as number}
            onChange={(event) => {
              if (!Number.isNaN(event.target.valueAsNumber)) onChange(event.target.valueAsNumber);
            }}
            disabled={disabled}
            required={required}
            aria-invalid={Boolean(error)}
          />
        ) : String(value).includes("\n") || String(value).length > 100 ? (
          <textarea
            rows={5}
            value={value as string}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            required={required}
            aria-invalid={Boolean(error)}
          />
        ) : (
          <input
            type="text"
            value={value as string}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            required={required}
            aria-invalid={Boolean(error)}
          />
        )}
        {error && <span className="field-error">{error}</span>}
      </label>
      {onRemove && (
        <button
          type="button"
          className="remove-value"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove ${label}`}
        >
          Remove
        </button>
      )}
    </div>
  );
}

export function JsonFormEditor({
  value,
  onChange,
  disabled = false,
  readOnlyKeys,
  requiredKeys,
  errors,
}: JsonFormEditorProps) {
  return (
    <ObjectEditor
      value={value}
      onChange={onChange}
      disabled={disabled}
      readOnlyKeys={readOnlyKeys}
      requiredKeys={requiredKeys}
      errors={errors}
    />
  );
}

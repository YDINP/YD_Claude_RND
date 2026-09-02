type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  id: string;
  disabled?: boolean;
};

/** 공용 토글 스위치. 라벨/설명 + iOS 스타일 스위치. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  id,
  disabled,
}: SwitchProps) {
  return (
    <div className="field-row switch-row">
      <label htmlFor={id} className="switch-label">
        <span className="switch-label-text">{label}</span>
        {description && (
          <span className="field-description">{description}</span>
        )}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={`switch ${checked ? "switch-on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-thumb" />
      </button>
    </div>
  );
}

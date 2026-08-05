import { Switch as RadixSwitch } from "radix-ui";

export interface SwitchProps {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

// Radix Switch (unstyled, accessible-by-default) — DESIGN.md has no dedicated
// toggle/switch component token, so this is styled from the generic tokens already in
// components.css, same gap Story 1.3 documented for its own new controls.
export function Switch({ label, checked, onCheckedChange, disabled }: SwitchProps) {
  return (
    // Review finding: a wrapping <label> only associates with form-associable elements
    // (input/select/textarea) via the standard label-click/label-for mechanism — Radix's
    // Switch renders a <button role="switch">, so a <label> here did nothing and read as
    // a false sense of accessibility. aria-label is what actually names the control.
    <div className="usavvy-field usavvy-switch-field">
      <span className="usavvy-label">{label}</span>
      <RadixSwitch.Root
        className="usavvy-switch"
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={label}
      >
        <RadixSwitch.Thumb className="usavvy-switch-thumb" />
      </RadixSwitch.Root>
    </div>
  );
}

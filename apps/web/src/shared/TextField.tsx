import { Form } from "radix-ui";
import type { InputHTMLAttributes } from "react";

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  name: string;
  label: string;
  /** A server-side validation/auth error to show alongside Radix's own client-side ones. */
  serverError?: string;
}

// Radix Form primitives (not a raw unstyled <input>) — client-side validation states
// (missing/invalid/too-short) render inline, matching the story's own requirement.
export function TextField({ name, label, serverError, ...inputProps }: TextFieldProps) {
  return (
    <Form.Field name={name} className="usavvy-field">
      <Form.Label className="usavvy-label">{label}</Form.Label>
      <Form.Control asChild>
        <input className="usavvy-input" {...inputProps} />
      </Form.Control>
      <Form.Message className="usavvy-message-error" match="valueMissing">
        {label} is required
      </Form.Message>
      <Form.Message className="usavvy-message-error" match="typeMismatch">
        Enter a valid {label.toLowerCase()}
      </Form.Message>
      <Form.Message className="usavvy-message-error" match="tooShort">
        {label} is too short
      </Form.Message>
      {serverError ? (
        <span className="usavvy-message-error" role="alert">
          {serverError}
        </span>
      ) : null}
    </Form.Field>
  );
}

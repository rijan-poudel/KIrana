import type { ReactNode } from "react";
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";

/**
 * Shared form-field wrapper on the shadcn Field primitives: label on top, the
 * control below, and exactly one helper line underneath — a helpful description
 * or, when the field is invalid, a readable error in place of it.
 */
export function FormField({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label?: ReactNode;
  htmlFor?: string;
  error?: string | null;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Field className={className}>
      {label ? <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel> : null}
      <FieldContent>
        {children}
        {error ? <FieldError>{error}</FieldError> : hint ? <FieldDescription>{hint}</FieldDescription> : null}
      </FieldContent>
    </Field>
  );
}

/** "abc" or "1.5.2" → false; "0", "2.5", "1e3" → true. */
export function isValidNumber(raw: string): boolean {
  const value = Number(raw);
  return raw.trim() !== "" && Number.isFinite(value);
}

/** Parse a field the shop expects as a plain decimal number. Errors are human-readable. */
export function parseInputNumber(raw: string): { value: number } | { error: string } {
  const value = Number(raw);
  if (raw.trim() === "") return { error: "Enter a value." };
  if (!Number.isFinite(value)) return { error: "Enter a valid number (e.g. 12.5)." };
  return { value };
}

/** A number that must also be ≥ 0 (quantities, stock, prices). */
export function parseOptionalNumber(raw: string): { value: number | null } | { error: string } {
  if (raw.trim() === "") return { value: null };
  const parsed = parseInputNumber(raw);
  if ("error" in parsed) return parsed;
  if (parsed.value < 0) return { error: "Cannot be negative." };
  return { value: parsed.value };
}
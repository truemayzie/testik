"use client";

import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type ReactNode, useId } from "react";
import styles from "./Input.module.css";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string | null;
  icon?: ReactNode;
}

/** Единое текстовое поле дизайн-системы */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, icon, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className={[styles.wrap, className ?? ""].join(" ")}>
      {label && (
        <label className={styles.label} htmlFor={inputId}>
          {label}
        </label>
      )}
      <div className={styles.field}>
        {icon && <span className={styles.icon} aria-hidden>{icon}</span>}
        <input
          ref={ref}
          id={inputId}
          className={[styles.input, icon ? styles.withIcon : "", error ? styles.invalid : ""].join(" ")}
          aria-invalid={error ? true : undefined}
          {...rest}
        />
      </div>
      {error ? (
        <p className={styles.error} role="alert">{error}</p>
      ) : hint ? (
        <p className={styles.hint}>{hint}</p>
      ) : null}
    </div>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string | null;
}

/** Единый select дизайн-системы */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, className, id, children, ...rest },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className={[styles.wrap, className ?? ""].join(" ")}>
      {label && (
        <label className={styles.label} htmlFor={selectId}>
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={[styles.input, styles.select, error ? styles.invalid : ""].join(" ")}
        aria-invalid={error ? true : undefined}
        {...rest}
      >
        {children}
      </select>
      {error ? (
        <p className={styles.error} role="alert">{error}</p>
      ) : hint ? (
        <p className={styles.hint}>{hint}</p>
      ) : null}
    </div>
  );
});

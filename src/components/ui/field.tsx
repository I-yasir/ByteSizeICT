import { CircleAlert } from 'lucide-react';
import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, useId } from 'react';
import { cn } from '@/lib/utils';

/** docs/03_UI_Spec.md §7.2 — label above, helper/error below, error wired via aria-describedby. */
export const controlClasses = cn(
  'w-full rounded-md border border-border-strong bg-surface px-4 text-base text-fg placeholder:text-fg-subtle',
  'transition-[border-color,box-shadow] duration-120 ease-out',
  'focus:border-primary focus:ring-3 focus:ring-primary-soft focus:outline-none',
  'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-fg-subtle',
  'aria-invalid:border-danger aria-invalid:focus:ring-danger-soft',
);

type FieldRenderProps = { id: string; 'aria-invalid'?: true; 'aria-describedby'?: string };

export function Field({
  label,
  helper,
  error,
  className,
  children,
  optionalLabel,
}: {
  label: ReactNode;
  helper?: ReactNode;
  error?: ReactNode;
  className?: string;
  optionalLabel?: ReactNode;
  children: (props: FieldRenderProps) => ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-error` : helper ? `${id}-helper` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
        {optionalLabel ? <span className="ml-1 font-normal text-fg-subtle">{optionalLabel}</span> : null}
      </label>
      {children({ id, ...(error ? { 'aria-invalid': true as const } : {}), ...(describedBy ? { 'aria-describedby': describedBy } : {}) })}
      {error ? (
        <p id={`${id}-error`} className="mt-1 flex items-start gap-1.5 text-sm text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : helper ? (
        <p id={`${id}-helper`} className="mt-1 text-sm text-fg-subtle">
          {helper}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClasses, 'h-12', className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlClasses, 'min-h-28 py-3', className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(controlClasses, 'h-12 appearance-none pr-10', className)} {...props}>
      {children}
    </select>
  );
}

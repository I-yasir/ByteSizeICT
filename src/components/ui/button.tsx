import { cva, type VariantProps } from 'class-variance-authority';
import { type ButtonHTMLAttributes, cloneElement, isValidElement, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from './spinner';

/** docs/03_UI_Spec.md §7.1 */
export const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap select-none',
    'transition-[background-color,border-color,color,transform] duration-120 ease-out',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
    'active:scale-98 disabled:pointer-events-none disabled:opacity-50 aria-busy:pointer-events-none',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary hover:bg-primary-hover',
        secondary: 'border border-border-strong bg-surface text-fg hover:bg-surface-2',
        ghost: 'bg-transparent text-primary hover:bg-primary-soft',
        danger: 'bg-danger text-fg-inverse hover:bg-danger/90',
        success: 'bg-success text-fg-inverse hover:bg-success/90',
      },
      size: {
        sm: 'h-10 px-4 text-sm',
        md: 'h-12 px-5 text-base',
        lg: 'h-14 px-6 text-lg',
        icon: 'size-11 p-0',
      },
      fullWidth: { true: 'w-full' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean;
    leadingIcon?: ReactNode;
    /** Render the child element (e.g. a Link) with button styling. */
    asChild?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  fullWidth,
  loading = false,
  leadingIcon,
  asChild = false,
  disabled,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, fullWidth }), className);
  // asChild without Radix Slot (P4.20): the child (Link / <a>) gets the button classes, props and icon.
  if (asChild && isValidElement<{ className?: string; children?: ReactNode }>(children)) {
    return cloneElement(
      children,
      { ...props, className: cn(classes, children.props.className) },
      <>
        {leadingIcon}
        {children.props.children}
      </>,
    );
  }
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : leadingIcon}
      {children}
    </button>
  );
}

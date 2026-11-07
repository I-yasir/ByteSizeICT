'use client';
import './globals.css';

/** Last-resort boundary when the root layout itself fails; no providers/i18n are available here. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="bn">
      <body className="flex min-h-dvh items-center justify-center bg-bg p-4 text-fg">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-semibold">কিছু একটা সমস্যা হয়েছে · Something went wrong</h1>
          <button type="button" onClick={reset} className="mt-6 h-12 rounded-md bg-primary px-5 font-semibold text-on-primary">
            আবার চেষ্টা করুন · Try again
          </button>
        </div>
      </body>
    </html>
  );
}

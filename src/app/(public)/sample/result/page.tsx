import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SampleResultView } from './sample-result';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('sample'))('resultTitle'), robots: { index: false } };
}

export default function SampleResultPage() {
  return (
    <div className="mx-auto max-w-exam px-4 py-6">
      <SampleResultView />
    </div>
  );
}

import { Body, Container, Head, Hr, Html, Preview, Section, Text } from '@react-email/components';
import type { ReactNode } from 'react';

/** Shared bilingual email shell: Bangla first, then English (TRD §9.1). Email clients need inline styles. */
const styles = {
  body: { backgroundColor: '#F6F7FB', fontFamily: '"Hind Siliguri", "Noto Sans Bengali", Arial, sans-serif', margin: 0 },
  container: { backgroundColor: '#FFFFFF', borderRadius: '14px', margin: '24px auto', maxWidth: '520px', padding: '24px' },
  brand: { color: '#4338CA', fontSize: '20px', fontWeight: 700, margin: '0 0 16px' },
  footer: { color: '#5B687B', fontSize: '12px', lineHeight: '18px', margin: '16px 0 0' },
} as const;

export const textStyle = { color: '#0F172A', fontSize: '15px', lineHeight: '24px', margin: '0 0 12px' } as const;
export const mutedStyle = { color: '#475569', fontSize: '14px', lineHeight: '22px', margin: '0 0 8px' } as const;
export const codeStyle = {
  backgroundColor: '#EEF1F6',
  borderRadius: '10px',
  color: '#0F172A',
  fontFamily: 'Inter, Arial, sans-serif',
  fontSize: '22px',
  fontWeight: 700,
  letterSpacing: '4px',
  margin: '4px 0 12px',
  padding: '12px 16px',
  textAlign: 'center' as const,
};

export function EmailLayout(props: { preview: string; brandName: string; bn: ReactNode; en: ReactNode }) {
  return (
    <Html>
      <Head />
      <Preview>{props.preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.brand}>{props.brandName}</Text>
          <Section lang="bn">{props.bn}</Section>
          <Hr />
          <Section lang="en">{props.en}</Section>
          <Text style={styles.footer}>
            এই ইমেইলটি স্বয়ংক্রিয়ভাবে পাঠানো হয়েছে। · This email was sent automatically.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

import { z } from 'zod';
import { optionalIsoDateTime, optionalText, paymentMethodSchema, uuidSchema } from '@/lib/validation';

/** app_settings value shapes (docs/05_Schema.md §4.1). Isomorphic. */
const localized = (max: number) => z.object({ bn: z.string().trim().min(1).max(max), en: z.string().trim().min(1).max(max) });
const optionalUrl = z.url().max(300).nullable();

export const settingSchemas = {
  brand: z.object({ name: z.string().trim().min(1).max(60), logoPath: z.string().max(300).nullable() }),
  contact: z.object({
    whatsapp: optionalUrl,
    messenger: optionalUrl,
    phone: z.string().trim().max(30).nullable(),
    email: z.email().max(254).nullable(),
  }),
  homepage: z.object({
    heroTitle: localized(120).nullable(),
    heroSubtitle: localized(240).nullable(),
    testimonials: z
      .array(z.object({ text: localized(600), attribution: z.string().trim().min(1).max(80), photoPath: z.string().max(300).nullable() }))
      .max(20),
    topPerformers: z.array(z.object({ label: z.string().trim().min(1).max(40), scoreText: z.string().trim().min(1).max(40) })).max(20),
  }),
  faq: z.array(z.object({ q: localized(300), a: localized(2000) })).max(50),
  auth: z.object({ maxDevices: z.union([z.literal(1), z.literal(2)]) }),
  results: z.object({ visibleWhenInactive: z.boolean() }),
} as const;

export type SettingKey = keyof typeof settingSchemas;
export type SettingValue<K extends SettingKey> = z.output<(typeof settingSchemas)[K]>;
export const SETTING_KEYS = Object.keys(settingSchemas) as SettingKey[];
export const PUBLIC_SETTING_KEYS: readonly SettingKey[] = ['brand', 'contact', 'homepage', 'faq'];

export const SETTING_DEFAULTS: { [K in SettingKey]: SettingValue<K> } = {
  brand: { name: 'ByteSizeICT', logoPath: null },
  contact: { whatsapp: null, messenger: null, phone: null, email: null },
  homepage: { heroTitle: null, heroSubtitle: null, testimonials: [], topPerformers: [] },
  faq: [],
  auth: { maxDevices: 1 },
  results: { visibleWhenInactive: true },
};

/** The value is validated per key with `settingSchemas[key]` in the service. */
export const updateSettingSchema = z.object({
  key: z.enum(['brand', 'contact', 'homepage', 'faq', 'auth', 'results']),
  value: z.unknown(),
});

export const planSchema = z
  .object({
    id: uuidSchema.optional(),
    code: z.string().regex(/^[a-z0-9-]{2,32}$/, 'errors.validation'),
    nameBn: z.string().trim().min(1).max(80),
    nameEn: z.string().trim().min(1).max(80),
    durationDays: z.number().int().min(1).max(1095).nullable(),
    fixedExpiresAt: optionalIsoDateTime,
    priceBdt: z.number().int().min(0).max(1_000_000),
    features: z.array(localized(120)).max(12).default([]),
    isHighlighted: z.boolean().default(false),
    isActive: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(1000).default(0),
  })
  .refine((plan) => (plan.durationDays === null) !== (plan.fixedExpiresAt === null), {
    path: ['durationDays'],
    message: 'errors.validation',
  });

export const paymentAccountSchema = z.object({
  id: uuidSchema.optional(),
  method: paymentMethodSchema,
  accountNumber: z.string().trim().min(3).max(40),
  accountLabel: optionalText(40),
  accountHolder: optionalText(80),
  instructionsBn: optionalText(1000),
  instructionsEn: optionalText(1000),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

export const assetUploadSchema = z.object({
  kind: z.enum(['logo', 'testimonial']),
  ext: z.enum(['png', 'jpg', 'jpeg', 'webp', 'svg']),
});

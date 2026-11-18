/**
 * Every shape the API accepts, described once with Zod.
 *
 * Validation lives here rather than in the controllers so that the rules are
 * in one readable list, and so that the same schema can be reused by a test or
 * by the documentation. A controller may then assume its input is already the
 * right shape and concentrate on what to do with it.
 */
import { z } from 'zod';
import { ZONE_IDS } from '../data/zones.js';

const zoneId = z.enum(ZONE_IDS);
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD.');

// Optional everywhere: an empty string means "no name".
const displayName = z.string().trim().max(40, 'Keep the name under 40 characters.');

export const registerSchema = z.object({
  email: z.email('Enter a valid e-mail address.'),
  password: z.string().min(8, 'Use at least 8 characters.').max(200),
  name: displayName.optional(),
  acceptPrivacyNotice: z.boolean(),
  acceptAiProcessing: z.boolean(),
});

export const loginSchema = z.object({
  email: z.email('Enter a valid e-mail address.'),
  password: z.string().min(1, 'Enter your password.'),
});

export const onboardingAnswerSchema = z.object({
  zoneId,
  value: z.coerce
    .number()
    .int()
    .min(1, 'Choose a value between 1 and 5.')
    .max(5, 'Choose a value between 1 and 5.'),
});

export const createEntrySchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'Write a few words before saving.')
    .max(20_000, 'That is longer than an entry can be.'),
  promptShownId: z.uuid().optional(),
});

export const entryFiltersSchema = z.object({
  zone: zoneId.optional(),
  from: isoDay.optional(),
  to: isoDay.optional(),
});

export const updateWeightsSchema = z.object({
  zones: z
    .array(
      z.object({
        zoneId,
        weight: z.coerce.number().min(0).max(1).optional(),
        isMuted: z.boolean().optional(),
      }),
    )
    .min(1, 'Send at least one zone to change.'),
});

export const nameSchema = z.object({
  name: displayName.nullable(),
});

export const ratingSchema = z.object({
  relevant: z.boolean(),
});

export const trendQuerySchema = z.object({
  zone: zoneId,
  days: z.coerce.number().int().min(2).max(365).default(30),
});

export const snapshotQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(60).default(7),
});

export const monthQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Use the format YYYY-MM.'),
});

export const dayParamSchema = z.object({ day: isoDay });

export const idParamSchema = z.object({ id: z.uuid('That is not a valid identifier.') });

export default {
  registerSchema,
  loginSchema,
  onboardingAnswerSchema,
  createEntrySchema,
  entryFiltersSchema,
  updateWeightsSchema,
  ratingSchema,
  nameSchema,
  snapshotQuerySchema,
  trendQuerySchema,
  monthQuerySchema,
  dayParamSchema,
  idParamSchema,
};

import { z } from 'zod';
import type { ReplicaAdapter } from '@/services/sync/replicaRegistry';
import type { ReplicaRow } from '@/types/replica';
import {
  READING_GROUPS,
  SET_FIELDS,
  SLOT_COUNT,
  SLOT_NAME_MAX,
  THEME_FIELDS,
  type ReadingGroup,
  type ReadingPlatform,
  type ReadingSetState,
  type ReadingSetValues,
  type SlotIndex,
} from '@/services/readingSets/model';
import { unwrap } from './helpers';

// Kalponik: one replica row per account, platform and kind of book, id
// `<platform>.<group>` (e.g. `android.text`). Each part is its own field, so
// two devices editing different slots both keep their change (per-field last
// write wins): current, active, basedOn, slot1, slot2, slot3.

export const READING_SET_KIND = 'reading_set';
export const READING_SET_SCHEMA_VERSION = 1;

const PLATFORMS: readonly ReadingPlatform[] = ['web', 'android', 'desktop', 'ios'];

export const readingSetReplicaId = (platform: ReadingPlatform, group: ReadingGroup) =>
  `${platform}.${group}`;

export const parseReadingSetReplicaId = (
  id: string,
): { platform: ReadingPlatform; group: ReadingGroup } | null => {
  const [platform, group, ...rest] = id.split('.');
  if (rest.length) return null;
  if (!PLATFORMS.includes(platform as ReadingPlatform)) return null;
  if (!READING_GROUPS.includes(group as ReadingGroup)) return null;
  return { platform: platform as ReadingPlatform, group: group as ReadingGroup };
};

const ALL_SET_KEYS = new Set<string>([...SET_FIELDS.text, ...SET_FIELDS.fixed, ...THEME_FIELDS]);
const MAX_VALUES_BYTES = 8 * 1024;

/** Known set fields with plain JSON values only; anything else is dropped. */
export const readingSetValuesSchema = z
  .record(z.string(), z.union([z.string().max(200), z.number().finite(), z.boolean()]))
  .refine((values) => Object.keys(values).every((key) => ALL_SET_KEYS.has(key)), {
    message: 'unknown reading set field',
  })
  .refine((values) => JSON.stringify(values).length <= MAX_VALUES_BYTES, {
    message: 'reading set too large',
  });

const slotSchema = z.union([
  z.literal(false),
  z.object({
    name: z.string().max(SLOT_NAME_MAX),
    basedOn: z.string().max(40),
    values: readingSetValuesSchema,
  }),
]);

export const readingSetFieldValueSchemas = {
  current: readingSetValuesSchema,
  active: z
    .number()
    .int()
    .min(-1)
    .max(SLOT_COUNT - 1),
  basedOn: z.string().max(40),
  slot1: slotSchema,
  slot2: slotSchema,
  slot3: slotSchema,
} as const;

export interface ReadingSetRecord {
  /** The replica id, `<platform>.<group>`. */
  name: string;
  state: ReadingSetState;
}

const SLOT_KEYS = ['slot1', 'slot2', 'slot3'] as const;

const toFields = (state: ReadingSetState): Record<string, unknown> => {
  const fields: Record<string, unknown> = {
    current: state.current,
    active: state.active ?? -1,
    basedOn: state.basedOn ?? '',
  };
  SLOT_KEYS.forEach((key, i) => {
    const slot = state.slots[i];
    fields[key] = slot
      ? { name: slot.name, basedOn: slot.basedOn ?? '', values: slot.values }
      : false;
  });
  return fields;
};

/** Field values back into a state; invalid parts fall back to empty. */
export const fromFields = (fields: Record<string, unknown>): ReadingSetState | null => {
  const current = readingSetValuesSchema.safeParse(fields['current']);
  if (!current.success) return null;
  const active = readingSetFieldValueSchemas.active.safeParse(fields['active']);
  const basedOn = readingSetFieldValueSchemas.basedOn.safeParse(fields['basedOn']);
  const slots = SLOT_KEYS.map((key) => {
    const parsed = slotSchema.safeParse(fields[key]);
    if (!parsed.success || parsed.data === false) return null;
    return {
      name: parsed.data.name,
      basedOn: parsed.data.basedOn || null,
      values: parsed.data.values as ReadingSetValues,
    };
  });
  const activeIndex = active.success && active.data >= 0 ? (active.data as SlotIndex) : null;
  return {
    current: current.data as ReadingSetValues,
    active: activeIndex !== null && slots[activeIndex] ? activeIndex : null,
    basedOn: basedOn.success && basedOn.data ? basedOn.data : null,
    slots,
  };
};

export const readingSetAdapter: ReplicaAdapter<ReadingSetRecord> = {
  kind: READING_SET_KIND,
  schemaVersion: READING_SET_SCHEMA_VERSION,
  pack: (record) => toFields(record.state),
  unpack: (fields) => {
    const state = fromFields(fields);
    if (!state) throw new Error('Invalid reading set');
    return { name: '', state };
  },
  computeId: async (record) => record.name,
  unpackRow: (row: ReplicaRow) => {
    if (!parseReadingSetReplicaId(row.replica_id)) return null;
    const fields: Record<string, unknown> = {};
    for (const [key, envelope] of Object.entries(row.fields_jsonb)) fields[key] = unwrap(envelope);
    const state = fromFields(fields);
    return state ? { name: row.replica_id, state } : null;
  },
};

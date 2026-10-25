import type { Prisma } from '#generated/prisma/client.ts';

/** Plain data for a JSON column (interfaces lack the index signature Prisma's JSON type requires). */
export const toJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/**
 * Shared branded identifier types. Branding prevents passing a TeamId where a
 * PlayerId is expected, without any runtime cost.
 */
export type Id<T extends string> = string & { readonly __brand: T };

export type PlayerId = Id<'player'>;
export type TeamId = Id<'team'>;
export type GameId = Id<'game'>;

/** Builds a branded ID from a plain string. Callers own uniqueness. */
export function makeId<T extends string>(value: string): Id<T> {
  return value as Id<T>;
}

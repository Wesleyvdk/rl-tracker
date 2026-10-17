interface CommandIdentity {
  name: string;
  type?: number;
}
const preservedFields = [
  "integration_types",
  "contexts",
  "default_member_permissions",
  "dm_permission",
  "nsfw",
] as const;

/** Source owns command content; unspecified visibility/permissions retain their live values. */
export function preserveRegistrationSettings(
  definitions: readonly CommandIdentity[],
  existing: unknown,
  globalScope = true,
): (CommandIdentity & Record<string, unknown>)[] {
  if (!Array.isArray(existing))
    throw new Error("Invalid existing command registration response");
  return definitions.map((definition) => {
    const current = existing.find(
      (c) =>
        c?.name === definition.name && (c.type ?? 1) === (definition.type ?? 1),
    );
    const result: CommandIdentity & Record<string, unknown> = { ...definition };
    for (const field of preservedFields)
      if (result[field] === undefined && current?.[field] !== undefined)
        result[field] = structuredClone(current[field]);
    if (!globalScope) {
      delete result.integration_types;
      delete result.contexts;
      delete result.dm_permission;
    }
    return result;
  });
}

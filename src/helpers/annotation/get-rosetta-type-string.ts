/**
 * Gets a type string from Rosetta information.
 * @param type The type to include in the string.
 * @param optional Whether the type should be marked as optional.
 * @param nullable Whether the type should be marked as nullable.
 * @returns
 */
export const getRosettaTypeString = (
    type: string | undefined,
    optional: boolean | undefined,
    nullable?: boolean,
): string => {
    type = (type ?? 'unknown').trim()

    if (optional || nullable) {
        return type.includes('|') || type.includes('fun(')
            ? `(${type})?`
            : `${type}?`
    }

    return type
}

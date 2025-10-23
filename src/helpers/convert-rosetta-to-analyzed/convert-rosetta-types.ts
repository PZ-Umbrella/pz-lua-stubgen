/**
 * Converts a type string from Rosetta into a set of types.
 * @param type The type string from Rosetta data.
 * @param nullable Whether nil should be included in the type set.
 */
export const convertRosettaTypes = (
    type: string | undefined,
    nullable: boolean | undefined,
): Set<string> => {
    const types = new Set<string>()
    if (type) {
        types.add(type)
    }

    if (nullable) {
        types.add('nil')
    }

    return types
}

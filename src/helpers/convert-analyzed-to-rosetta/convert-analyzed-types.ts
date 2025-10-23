/**
 * Converts analyzed types into a type string for a Rosetta file.
 * @param types The set of analyzed types.
 */
export const convertAnalyzedTypes = (
    types: Set<string>,
): [string | undefined, boolean] => {
    types = new Set(types)
    const nullable = types.delete('nil')

    if (types.size === 0) {
        return [undefined, nullable]
    }

    return [[...types].join(' | '), nullable]
}

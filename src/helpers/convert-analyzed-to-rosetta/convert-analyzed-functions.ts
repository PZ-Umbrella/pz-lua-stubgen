import { convertAnalyzedFunction } from './convert-analyzed-function'
import type { AnalyzedFunction } from '../../analysis'
import type { RosettaFunction } from '../../rosetta'

/**
 * Converts a list of analyzed functions into a list to be written to a Rosetta file.
 * @param functions The analyzed functions to convert.
 * @param mergeFunctions Existing Rosetta functions to merge with the analyzed functions.
 * @param keepTypes Flag for whether Rosetta types should be kept.
 * @param applyHeuristics Flag for whether type resolution heuristics should be applied.
 */
export const convertAnalyzedFunctions = (
    functions: AnalyzedFunction[],
    mergeFunctions?: Record<string, RosettaFunction>,
    keepTypes?: boolean,
    applyHeuristics?: boolean,
): RosettaFunction[] => {
    const converted = functions.map((x) =>
        convertAnalyzedFunction(
            x,
            mergeFunctions?.[x.name],
            keepTypes,
            applyHeuristics,
        ),
    )

    if (!mergeFunctions) {
        return converted
    }

    const seen = new Set(converted.map((x) => x.name))
    for (const [name, func] of Object.entries(mergeFunctions)) {
        if (!seen.has(name)) {
            converted.push(func)
        }
    }

    return converted
}

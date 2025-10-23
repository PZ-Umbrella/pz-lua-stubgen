import { convertAnalyzedParameters } from './convert-analyzed-parameters'
import { convertAnalyzedReturns } from './convert-analyzed-returns'
import type { AnalyzedFunction } from '../../analysis'
import type { RosettaOverload } from '../../rosetta'

/**
 * Converts a list of overloads into a list to be written to a Rosetta file.
 * @param overloads The analyzed overloads to convert.
 * @param existingOverloads Existing Rosetta overloads. These will be used instead of the analyzed overloads if given.
 * @param applyHeuristics Flag for whether type resolution heuristics should be applied.
 */
export const convertAnalyzedOverloads = (
    overloads: AnalyzedFunction[],
    existingOverloads?: RosettaOverload[],
    applyHeuristics?: boolean,
): RosettaOverload[] => {
    if (existingOverloads) {
        return existingOverloads
    }

    return overloads.map((x) => {
        const overload: RosettaOverload = {}

        if (x.parameters.length > 0) {
            overload.parameters = convertAnalyzedParameters(
                x.parameters,
                undefined,
                false,
                applyHeuristics,
            )
        }

        if (x.returnTypes.length > 0) {
            overload.return = convertAnalyzedReturns(x.returnTypes)
        }

        return overload
    })
}

import { convertAnalyzedParameter } from './convert-analyzed-parameter'
import type { RosettaParameter } from '../../rosetta'
import type { AnalyzedParameter } from '../../analysis'

/**
 * Converts a list of analyzed parameters into a list to be written to a Rosetta file.
 * @param params The analyzed parameters to convert.
 * @param mergeParams Existing Rosetta parameters to merge with the analyzed parameters.
 * @param keepTypes Flag for whether Rosetta types should be kept.
 * @param applyHeuristics Flag for whether type resolution heuristics should be applied.
 * @param funcName The name of the function that contains the parameters.
 */
export const convertAnalyzedParameters = (
    params: AnalyzedParameter[],
    mergeParams?: RosettaParameter[],
    keepTypes?: boolean,
    applyHeuristics?: boolean,
    funcName?: string,
): RosettaParameter[] => {
    const converted = params.map((x, i) =>
        convertAnalyzedParameter(
            x,
            mergeParams?.[i],
            keepTypes,
            applyHeuristics,
            funcName,
        ),
    )

    if (mergeParams && params.length < mergeParams.length) {
        for (let i = params.length; i < mergeParams.length; i++) {
            converted.push(mergeParams[i])
        }
    }

    return converted
}

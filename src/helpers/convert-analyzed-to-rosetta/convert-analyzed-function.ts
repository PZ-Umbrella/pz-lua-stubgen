import { removeUndefinedOrEmpty } from '../common/remove-undefined-or-empty'
import { convertAnalyzedParameters } from './convert-analyzed-parameters'
import { convertAnalyzedReturns } from './convert-analyzed-returns'
import type { AnalyzedFunction } from '../../analysis'
import type { RosettaFunction } from '../../rosetta'

/**
 * Converts an analyzed function into an object to be written to a Rosetta file.
 * @param func The analyzed function to convert.
 * @param mergeFunc An existing Rosetta function to merge with the analyzed function.
 * @param keepTypes Flag for whether Rosetta types should be kept.
 * @param applyHeuristics Flag for whether type resolution heuristics should be applied.
 */
export const convertAnalyzedFunction = (
    func: AnalyzedFunction,
    mergeFunc?: RosettaFunction,
    keepTypes?: boolean,
    applyHeuristics?: boolean,
): RosettaFunction => {
    const rosettaFunc: RosettaFunction = {
        name: func.name,
        deprecated: mergeFunc?.deprecated,
        notes: mergeFunc?.notes,
        tags: mergeFunc?.tags,
        parameters: convertAnalyzedParameters(
            func.parameters,
            mergeFunc?.parameters,
            keepTypes,
            applyHeuristics,
            func.name,
        ),
        return: convertAnalyzedReturns(
            func.returnTypes,
            mergeFunc?.return,
            keepTypes,
        ),
        overloads: mergeFunc?.overloads,
    }

    return removeUndefinedOrEmpty(rosettaFunc)
}

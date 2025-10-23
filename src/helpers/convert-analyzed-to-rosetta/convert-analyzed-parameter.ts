import { convertAnalyzedTypes } from './convert-analyzed-types'
import { removeUndefinedOrEmpty } from '../common/remove-undefined-or-empty'
import { getHeuristicTypes } from './get-heuristic-types'
import type { RosettaParameter } from '../../rosetta'
import type { AnalyzedParameter } from '../../analysis'

/**
 * Converts an analyzed parameter into an object to be written to a Rosetta file.
 * @param param The analyzed parameter to convert.
 * @param mergeParam An existing Rosetta parameter to merge with the analyzed parameter.
 * @param keepTypes Flag for whether Rosetta types should be kept.
 * @param applyHeuristics Flag for whether type resolution heuristics should be applied.
 * @param funcName The name of the function that contains the parameter.
 */
export const convertAnalyzedParameter = (
    param: AnalyzedParameter,
    mergeParam?: RosettaParameter,
    keepTypes?: boolean,
    applyHeuristics?: boolean,
    funcName?: string,
): RosettaParameter => {
    const rosettaParam: RosettaParameter = { name: param.name }

    const paramTypes = applyHeuristics
        ? getHeuristicTypes(param.name, param.types, funcName)
        : param.types

    const [type, nullable] = convertAnalyzedTypes(paramTypes)

    if (mergeParam && keepTypes) {
        rosettaParam.type = mergeParam.type ?? type
        rosettaParam.nullable = mergeParam.nullable
        rosettaParam.optional = mergeParam.optional
    } else {
        rosettaParam.type = type
        rosettaParam.nullable = nullable || undefined
        rosettaParam.optional = mergeParam?.optional
    }

    rosettaParam.notes = mergeParam?.notes

    return removeUndefinedOrEmpty(rosettaParam)
}

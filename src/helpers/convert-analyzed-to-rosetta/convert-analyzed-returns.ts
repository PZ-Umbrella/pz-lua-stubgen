import { removeUndefinedOrEmpty } from '../common/remove-undefined-or-empty'
import { convertAnalyzedTypes } from './convert-analyzed-types'
import type { RosettaReturn } from '../../rosetta'

/**
 * Converts a list of return types into a list to be written to a Rosetta file.
 * @param returns The analyzed return types to convert.
 * @param mergeReturns Existing Rosetta returns to merge with the analyzed return types.
 * @param keepTypes Flag for whether Rosetta types should be kept.
 */
export const convertAnalyzedReturns = (
    returns: Set<string>[],
    mergeReturns?: RosettaReturn[],
    keepTypes?: boolean,
): RosettaReturn[] => {
    return returns.map((x, i): RosettaReturn => {
        const ret: RosettaReturn = {}
        const mergeRet = mergeReturns?.[i]
        const [type, nullable] = convertAnalyzedTypes(x)

        if (mergeRet && keepTypes) {
            ret.type = mergeRet.type ?? type ?? 'unknown'
            ret.nullable = mergeRet.nullable
        } else {
            ret.type = type ?? 'unknown'
            ret.nullable = nullable ? true : undefined
        }

        ret.notes = mergeRet?.notes

        return removeUndefinedOrEmpty(ret)
    })
}

import { convertRosettaTypes } from './convert-rosetta-types'
import type { RosettaParameter } from '../../rosetta'
import type { AnalyzedParameter } from '../../analysis'

/**
 * Converts Rosetta parameters into a list of equivalent analyzed parameters.
 * @param params The Rosetta parameters to convert.
 */
export const convertRosettaParameters = (
    params: RosettaParameter[] | undefined,
): AnalyzedParameter[] => {
    if (!params) {
        return []
    }

    return params.map((x): AnalyzedParameter => {
        return {
            name: x.name,
            types: convertRosettaTypes(x.type, x.nullable || x.optional),
        }
    })
}

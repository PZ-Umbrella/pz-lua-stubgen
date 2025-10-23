import { convertRosettaParameters } from './convert-rosetta-parameters'
import { convertRosettaReturns } from './convert-rosetta-returns'
import type { AnalyzedFunction } from '../../analysis'
import type { RosettaOverload } from '../../rosetta'

/**
 * Converts Rosetta overloads into equivalent analyzed functions.
 * @param overloads The Rosetta overloads to convert.
 */
export const convertRosettaOverloads = (
    overloads: RosettaOverload[] | undefined,
): AnalyzedFunction[] => {
    if (!overloads) {
        return []
    }

    return overloads.map((x) => {
        return {
            name: 'overload',
            parameters: convertRosettaParameters(x.parameters),
            returnTypes: convertRosettaReturns(x.return),
        }
    })
}

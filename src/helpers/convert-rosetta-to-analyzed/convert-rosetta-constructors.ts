import { convertRosettaParameters } from './convert-rosetta-parameters'
import { convertRosettaTypes } from './convert-rosetta-types'
import type { AnalyzedFunction } from '../../analysis'
import type { RosettaConstructor } from '../../rosetta'

/**
 * Converts Rosetta constructors into equivalent analyzed functions.
 * @param constructors The Rosetta constructors to convert.
 * @param clsName The name of the class.
 */
export const convertRosettaConstructors = (
    constructors: RosettaConstructor[] | undefined,
    clsName: string,
): AnalyzedFunction[] => {
    if (!constructors) {
        return []
    }

    return constructors.map((x): AnalyzedFunction => {
        return {
            name: 'new',
            parameters: convertRosettaParameters(x.parameters),
            returnTypes: [convertRosettaTypes(clsName, false)],
            isMethod: true,
            isConstructor: true,
        }
    })
}

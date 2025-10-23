import { convertRosettaParameters } from './convert-rosetta-parameters'
import { convertRosettaReturns } from './convert-rosetta-returns'
import type { AnalyzedFunction } from '../../analysis'
import type { RosettaFunction } from '../../rosetta'

/**
 * Converts a Rosetta function into an equivalent analyzed function.
 * @param func The Rosetta function to convert.
 * @param isMethod Flag for whether the function is a method.
 */
export const convertRosettaFunction = (
    func: RosettaFunction,
    isMethod?: boolean,
): AnalyzedFunction => {
    return {
        name: func.name,
        parameters: convertRosettaParameters(func.parameters),
        returnTypes: convertRosettaReturns(func.return),
        isMethod,
    }
}

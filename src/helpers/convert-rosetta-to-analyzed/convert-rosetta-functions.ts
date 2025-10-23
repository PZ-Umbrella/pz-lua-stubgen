import { convertRosettaFunction } from './convert-rosetta-function'
import type { AnalyzedFunction } from '../../analysis'
import type { RosettaFunction } from '../../rosetta'

/**
 * Converts Rosetta functions into a list of equivalent analyzed functions.
 * @param functions The Rosetta functions to convert.
 * @param isMethod Flag for whether the functions are a method.
 */
export const convertRosettaFunctions = (
    functions: Record<string, RosettaFunction> | undefined,
    isMethod?: boolean,
): AnalyzedFunction[] => {
    if (!functions) {
        return []
    }

    return Object.values(functions).map((x) =>
        convertRosettaFunction(x, isMethod),
    )
}

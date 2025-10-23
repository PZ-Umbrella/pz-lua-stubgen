import { getFunctionStringFromParamNames } from './get-function-string-from-param-names'
import type { AnalyzedParameter } from '../../analysis'

/**
 * Returns a rewritten function expression with no body.
 * @param name The function name.
 * @param parameters Function parameter names.
 */
export const getFunctionString = (
    name: string | undefined,
    parameters: AnalyzedParameter[],
): string => {
    return getFunctionStringFromParamNames(
        name,
        parameters.map((x) => x.name),
    )
}

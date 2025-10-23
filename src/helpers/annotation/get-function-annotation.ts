import { getTypeString } from './get-type-string'
import type { AnalyzedParameter } from '../../analysis'

/**
 * Builds a function annotation.
 * @param parameters Parameters of the function.
 * @param returns Return types of the function.
 * @param allowAmbiguous Flag for whether to allow union types.
 * @param tabCount The number of tabs to include.
 */
export const getFunctionAnnotation = (
    parameters?: AnalyzedParameter[],
    returns?: Set<string>[],
    allowAmbiguous: boolean = true,
    tabCount: number = 0,
): string | undefined => {
    const tabs = '    '.repeat(tabCount)

    const out = []

    parameters ??= []
    for (const param of parameters) {
        const typeString = getTypeString(param.types, allowAmbiguous)
        if (typeString === 'unknown') {
            continue
        }

        out.push('\n')
        out.push(tabs)
        out.push(`---@param ${param.name} ${typeString}`)
    }

    returns ??= []
    for (const ret of returns) {
        out.push('\n')
        out.push(tabs)

        out.push(`---@return ${getTypeString(ret, allowAmbiguous)}`)
    }

    return out.join('')
}

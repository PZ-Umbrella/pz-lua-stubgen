import { getFunctionAnnotation } from './get-function-annotation'
import type { LuaExpression } from '../../analysis'

/**
 * Gets a function annotation from a literal function expression.
 * @param expression The expression to read.
 * @param allowAmbiguous Flag for whether to allow union types.
 * @param tabCount The number of tabs to include.
 */
export const getFunctionAnnotationFromExpression = (
    expression: LuaExpression,
    allowAmbiguous: boolean,
    tabCount: number = 0,
): string | undefined => {
    if (expression.type !== 'literal') {
        return
    }

    if (expression.luaType !== 'function') {
        return
    }

    return getFunctionAnnotation(
        expression.parameters,
        expression.returnTypes,
        allowAmbiguous,
        tabCount,
    )
}

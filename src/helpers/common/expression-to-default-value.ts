import { containsLiteralTable, getExpressionString } from '../annotation'
import type { LuaExpression } from '../../analysis'

/**
 * Returns a string to use to represent the value of an expression.
 * @param expression The expression to return a default string for.
 * @param tableDefault The string to use if the expression is a literal table.
 */
export const expressionToDefaultValue = (
    expression: LuaExpression,
    tableDefault?: string,
): string | undefined => {
    if (containsLiteralTable(expression)) {
        return tableDefault
    }

    const value = getExpressionString(expression)
    if (value !== 'nil') {
        return value
    }
}

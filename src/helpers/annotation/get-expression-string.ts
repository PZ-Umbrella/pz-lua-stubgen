import { LuaExpression } from '../../analysis'
import { getLiteralString } from './get-literal-string'
import { getOperationString } from './get-operation-string'

/**
 * Gets a string to use to rewrite an expression.
 * @param expression The expression to convert.
 * @param allowAmbiguous Flag for whether to allow union types.
 * @param depth The depth of the expression within a table.
 */
export const getExpressionString = (
    expression: LuaExpression,
    allowAmbiguous: boolean = true,
    depth: number = 1,
): string => {
    switch (expression.type) {
        case 'reference':
            return expression.id

        case 'require':
            return `require("${expression.module}")`

        case 'literal':
            return getLiteralString(expression, allowAmbiguous, depth)

        case 'index':
            let indexBase = getExpressionString(
                expression.base,
                allowAmbiguous,
                depth,
            )

            const index = getExpressionString(
                expression.index,
                allowAmbiguous,
                depth,
            )

            indexBase = doBaseParentheses(expression.base)
                ? `(${indexBase})`
                : indexBase

            return `${indexBase}[${index}]`

        case 'member':
            let memberBase = getExpressionString(
                expression.base,
                allowAmbiguous,
                depth,
            )

            memberBase = doBaseParentheses(expression.base)
                ? `(${memberBase})`
                : memberBase

            return `${memberBase}${expression.indexer}${expression.member}`

        case 'operation':
            return getOperationString(expression, allowAmbiguous, depth)
    }
}

/**
 * Determines whether to include parentheses on a member or index expression base.
 * @param base The base expression.
 */
const doBaseParentheses = (base: LuaExpression): boolean => {
    switch (base.type) {
        case 'reference':
        case 'index':
        case 'member':
        case 'require':
            return false

        case 'operation':
            return base.operator !== 'call'

        default:
            return true
    }
}

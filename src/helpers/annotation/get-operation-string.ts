import { getExpressionString } from './get-expression-string'
import type { LuaExpression, LuaOperation } from '../../analysis'

/**
 * Gets a string representing a rewritten operation expression.
 * @param expression The expression to get a literal string for.
 * @param allowAmbiguous Flag for whether to allow union types.
 * @param depth The depth of the expression within a table.
 */
export const getOperationString = (
    expression: LuaOperation,
    allowAmbiguous: boolean,
    depth?: number,
): string => {
    let lhs = expression.arguments[0]
    let rhs = expression.arguments[1]

    switch (expression.operator) {
        case 'call':
            const callBase = getExpressionString(
                expression.arguments[0],
                allowAmbiguous,
                depth,
            )

            const args: string[] = []
            for (let i = 1; i < expression.arguments.length; i++) {
                args.push(
                    getExpressionString(
                        expression.arguments[i],
                        allowAmbiguous,
                        depth,
                    ),
                )
            }

            return `${callBase}(${args.join(', ')})`

        default:
            let lhsString = getExpressionString(lhs, allowAmbiguous, depth)
            let rhsString = rhs
                ? getExpressionString(rhs, allowAmbiguous, depth)
                : undefined

            if (!isTernaryOperation(expression)) {
                if (!includeAsIs(lhs)) {
                    lhsString = `(${lhsString})`
                }

                if (rhs && !includeAsIs(rhs)) {
                    rhsString = `(${rhsString})`
                }
            }

            if (!rhsString) {
                return `${expression.operator}${lhsString}`
            }

            return `${lhsString} ${expression.operator} ${rhsString}`
    }
}

/**
 * Checks whether an expression should be rewritten as-is, as opposed to being wrapped in parentheses.
 * @param expr The expression to check.
 */
const includeAsIs = (expr: LuaExpression): boolean => {
    if (expr.type !== 'operation') {
        return true
    }

    switch (expr.operator) {
        case 'call':
        case '..':
        case '#':
            return true

        case '-':
            // unary minus as-is, binary minus with parentheses
            return expr.arguments.length === 1

        default:
            return false
    }
}

/**
 * Checks whether an expression is a boolean ternary operation (`X and Y or Z`).
 * @param expr The expression to check.
 */
const isTernaryOperation = (expr: LuaExpression): boolean => {
    if (expr.type !== 'operation' || expr.operator !== 'or') {
        return false
    }

    const lhs = expr.arguments[0]
    return lhs.type === 'operation' && lhs.operator === 'and'
}

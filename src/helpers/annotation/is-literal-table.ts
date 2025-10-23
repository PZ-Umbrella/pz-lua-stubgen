import type { LuaExpression } from '../../analysis'

/**
 * Checks whether an expression is a literal table expression.
 * @param expr The expression to check.
 */
export const isLiteralTable = (expr: LuaExpression): boolean => {
    if (expr.type !== 'literal') {
        return false
    }

    return expr.luaType === 'table'
}

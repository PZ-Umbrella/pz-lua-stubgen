import type { LuaExpression, LuaTableLiteral } from '../../analysis'

/**
 * Checks whether an expression is a table literal with no fields.
 * @param expr The expression to check.
 */
export const isEmptyTableLiteral = (
    expr: LuaExpression,
): expr is LuaTableLiteral => {
    return (
        expr.type === 'literal' &&
        expr.tableId !== undefined &&
        (!expr.fields || expr.fields.length === 0)
    )
}

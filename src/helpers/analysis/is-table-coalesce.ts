import type { LuaExpression, LuaTableCoalesceOperation } from '../../analysis'
import { isEmptyTableLiteral } from './is-empty-table-literal'
import { isExpressionEqual } from './is-expression-equal'

/**
 * Checks whether an assignment is of the form `X = X or {}`.
 * @param lhs The left side of the assignment.
 * @param rhs The right side of the assignment.
 */
export const isTableCoalesce = (
    lhs: LuaExpression,
    rhs: LuaExpression,
): rhs is LuaTableCoalesceOperation => {
    if (rhs.type !== 'operation' || rhs.operator !== 'or') {
        return false
    }

    if (!isEmptyTableLiteral(rhs.arguments[1])) {
        return false
    }

    return isExpressionEqual(lhs, rhs.arguments[0])
}

import type {
    LuaExpression,
    LuaIndex,
    LuaLiteral,
    LuaMember,
    LuaOperation,
    LuaReference,
    LuaRequire,
} from '../../analysis'

/**
 * Checks whether two expressions are equivalent.
 * @param expr The expression to check.
 * @param other The other expression to check.
 */
export const isExpressionEqual = (
    expr: LuaExpression,
    other: LuaExpression,
): boolean => {
    if (expr === other) {
        return true
    }

    if (expr.type !== other.type) {
        return false
    }

    switch (expr.type) {
        case 'reference':
            return expr.id === (other as LuaReference).id

        case 'require':
            return expr.module === (other as LuaRequire).module

        case 'literal':
            return isLiteralEqual(expr, other as LuaLiteral)

        case 'member':
            const otherMember = other as LuaMember
            return (
                expr.member === otherMember.member &&
                isExpressionEqual(expr.base, otherMember.base)
            )

        case 'index':
            const otherIndex = other as LuaIndex
            return (
                isExpressionEqual(expr.base, otherIndex.base) &&
                isExpressionEqual(expr.index, otherIndex.index)
            )

        case 'operation':
            return isOperationEqual(expr, other as LuaOperation)
    }

    return false
}

/**
 * Checks whether two literal expressions are equivalent.
 * @param expr The expression to check.
 * @param other The other expression to check.
 */
const isLiteralEqual = (expr: LuaLiteral, other: LuaLiteral): boolean => {
    if (expr === other) {
        return true
    }

    if (expr.luaType !== other.luaType) {
        return false
    }

    if (expr.literal !== other.literal) {
        return false
    }

    if (expr.functionId !== other.functionId) {
        return false
    }

    if (expr.tableId !== other.tableId) {
        return false
    }

    if (expr.isMethod !== other.isMethod) {
        return false
    }

    const exprReturns = expr.returnTypes ?? []
    const otherReturns = other.returnTypes ?? []
    if (exprReturns.length !== otherReturns.length) {
        return false
    }

    const exprParams = expr.parameters ?? []
    const otherParams = other.parameters ?? []
    if (exprParams.length !== otherParams.length) {
        return false
    }

    const exprFields = expr.fields ?? []
    const otherFields = other.fields ?? []
    if (exprFields.length !== otherFields.length) {
        return false
    }

    for (let i = 0; i < exprReturns.length; i++) {
        const ret = exprReturns[i]
        const otherRet = otherReturns[i]

        if (!isSetEqual(ret, otherRet)) {
            return false
        }
    }

    for (let i = 0; i < exprParams.length; i++) {
        const param = exprParams[i]
        const otherParam = otherParams[i]

        if (param.name !== otherParam.name) {
            return false
        }

        if (!isSetEqual(param.types, otherParam.types)) {
            return false
        }
    }

    for (let i = 0; i < exprFields.length; i++) {
        const field = exprFields[i]
        const otherField = otherFields[i]

        if (field.key !== otherField.key) {
            return false
        }

        if (!isSetEqual(field.types, otherField.types)) {
            return false
        }

        if (!isExpressionEqual(field.value, otherField.value)) {
            return false
        }
    }

    return true
}

/**
 * Checks whether two operation expressions are equivalent.
 * @param expr The expression to check.
 * @param other The other expression to check.
 */
const isOperationEqual = (expr: LuaOperation, other: LuaOperation): boolean => {
    if (expr === other) {
        return true
    }

    if (expr.operator !== other.operator) {
        return false
    }

    if (expr.arguments.length !== other.arguments.length) {
        return false
    }

    for (let i = 0; i < expr.arguments.length; i++) {
        if (!isExpressionEqual(expr.arguments[i], other.arguments[i])) {
            return false
        }
    }

    return true
}

/**
 * Checks whether two sets are equivalent.
 * @param set The set to check.
 * @param other The other set to check.
 */
const isSetEqual = (set?: Set<any>, other?: Set<any>): boolean => {
    if (set === other) {
        return true
    }

    if (!set || !other) {
        return false
    }

    if (set.size !== other.size) {
        return false
    }

    return [...set].every((x) => other.has(x))
}

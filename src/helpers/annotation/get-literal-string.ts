import { getFunctionString } from './get-function-string'
import { getTableString } from './get-table-string'
import type { LuaLiteral } from '../../analysis'

/**
 * Gets a string representing a rewritten literal expression.
 * @param expression The expression to get a literal string for.
 * @param allowAmbiguous Flag for whether to allow union types.
 * @param depth The depth of the expression within a table.
 */
export const getLiteralString = (
    expression: LuaLiteral,
    allowAmbiguous: boolean,
    depth: number = 1,
): string => {
    switch (expression.luaType) {
        case 'nil':
            return 'nil'

        case 'string':
            return expression.literal ?? '""'

        case 'number':
            return expression.literal ?? '0'

        case 'boolean':
            return expression.literal ?? 'false'

        case 'function':
            const params = [...(expression.parameters ?? [])]
            if (expression.isMethod) {
                params.unshift({ name: 'self', types: new Set() })
            }

            return getFunctionString(undefined, params)

        case 'table':
            return getTableString(expression, allowAmbiguous, depth) ?? '{}'
    }
}

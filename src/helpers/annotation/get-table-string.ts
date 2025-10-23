import { writeTableFields } from './write-table-fields'
import type { LuaExpression } from '../../analysis'

/**
 * Gets a string to use to rewrite a table expression.
 * @param expression The table expression to rewrite.
 * @param allowAmbiguous Flag for whether to allow union types.
 * @param depth The depth of the expression within a table.
 */
export const getTableString = (
    expression: LuaExpression,
    allowAmbiguous: boolean,
    depth: number = 1,
): string | undefined => {
    if (expression.type !== 'literal') {
        return
    }

    if (expression.luaType !== 'table') {
        return
    }

    const fields = expression.fields ?? []
    if (fields.length === 0) {
        return '{}'
    }

    const out: string[] = ['{']
    writeTableFields(fields, out, allowAmbiguous, depth)

    out.push('\n')
    out.push('    '.repeat(Math.max(depth - 1, 0)))
    out.push('}')

    return out.join('')
}

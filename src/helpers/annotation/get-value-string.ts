import { getExpressionString } from './get-expression-string'
import type { LuaExpression } from '../../analysis'
import type { RosettaField } from '../../rosetta'

/**
 * Gets the value and type strings to use for an expression.
 * @param expression The expression to get a rewritten value for.
 * @param rosettaField A Rosetta field associated with the expression.
 * @param typeString The current type string for the expression.
 * @param hasRosettaType Flag for whether the type string came from the Rosetta data.
 * @param hasTableLiteral Flag for whether a table literal
 * @param allowAmbiguous Flag for whether to allow union types.
 * @param depth The depth of the expression within a table.
 */
export const getValueString = (
    expression: LuaExpression | undefined,
    rosettaField: RosettaField | undefined,
    typeString: string | undefined,
    hasRosettaType: boolean,
    hasTableLiteral: boolean,
    allowAmbiguous: boolean,
    depth: number = 1,
): [value: string, type: string | undefined] => {
    let valueString: string
    if (rosettaField?.defaultValue) {
        valueString = rosettaField.defaultValue
        typeString = hasRosettaType ? typeString : undefined
    } else if (expression && !hasRosettaType) {
        valueString = getExpressionString(expression, allowAmbiguous, depth)
    } else {
        valueString = 'nil'

        // use empty table instead of nil for non-optional table types
        if (!rosettaField?.defaultValue && isRequiredTableType(typeString)) {
            valueString = '{}'
            hasTableLiteral = true
        }
    }

    if (valueString === 'nil' && typeString === 'unknown?') {
        typeString = undefined
    }

    // don't write `---@type table` when a table literal is available
    if (hasTableLiteral && typeString === 'table' && valueString !== 'nil') {
        typeString = undefined
    }

    return [valueString.trim(), typeString]
}

/**
 * Returns whether a type string includes a non-optional table type.
 * @param type The type string.
 */
const isRequiredTableType = (type?: string): boolean => {
    if (!type) {
        return false
    }

    if (type.endsWith('?')) {
        return false
    }

    if (type === 'table' || type.startsWith('table<')) {
        return true
    }

    if (type.endsWith('[]') && !type.includes('|')) {
        return true
    }

    return false
}

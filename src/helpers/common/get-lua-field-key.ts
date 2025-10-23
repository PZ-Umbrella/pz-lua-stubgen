import { readLuaStringLiteral } from './read-lua-string-literal'

/**
 * Converts a Lua literal to the key to use as a table field.
 * Strings that are valid Lua identifiers will use the internal string directly.
 *
 * @param literal The Lua literal value.
 */
export const getLuaFieldKey = (literal: string): string => {
    const key = readLuaStringLiteral(literal) ?? literal

    // match on valid Lua identifier
    if (/^[a-zA-Z_][\w_]*$/.exec(key)) {
        return key
    }

    return `[${literal}]`
}

import { LuaType } from '../../analysis/types'
import { readLuaStringLiteral } from './read-lua-string-literal'

/**
 * Converts a string key value to a valid table key string.
 * @param key The key value.
 * @param type The type of the value.
 */
export const getLiteralKey = (key: string, type?: LuaType) => {
    let internal: string | undefined
    if (!type) {
        internal = key
    } else if (type === 'string') {
        internal = readLuaStringLiteral(key)
    }

    if (!internal) {
        return key
    }

    return '"' + internal.replaceAll('"', '\\"') + '"'
}

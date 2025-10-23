/**
 * Checks whether a value is of a certain type.
 * @param value The value to check the type of.
 * @param type Type expected type.
 * @param name The name of the value.
 * @param optional Flag for whether the value is optional.
 * If this is not `true`, an error will be thrown for a missing value.
 * @returns A flag for whether the value exists and is the expected type.
 */
export const expect = (
    value: any,
    type: string,
    name?: string,
    optional = false,
): boolean => {
    const given = typeof value
    if (given === type) {
        return true
    }

    if (type === 'array' && Array.isArray(value)) {
        return true
    }

    if (optional && (value === undefined || value === null)) {
        return false
    }

    if (name) {
        throw new Error(`Expected ${type} for ${name} (got ${given})`)
    }

    throw new Error(`Expected ${type} (got ${given})`)
}

/**
 * Checks whether a field is of a certain type.
 * @param value The object containing the value to check the type of.
 * @param type Type expected type.
 * @param name The name of the value.
 * This can have multiple parts delimited by `.` to indicate child object fields.
 * @param optional Flag for whether the value is optional.
 * If this is not `true`, an error will be thrown for a missing value.
 * @returns A flag for whether the value exists and is the expected type.
 */
export const expectField = (
    value: any,
    name: string,
    type: string,
    optional = true,
): boolean => {
    const fields = name.split('.')

    let expectArray = false
    if (type === 'array') {
        expectArray = true
        type = 'object'
    }

    const names: string[] = []
    for (let i = 0; i < fields.length; i++) {
        const field = fields[i]
        value = value[field]
        names.push(field)

        const given = typeof value
        const isTarget = i === fields.length - 1
        const expected = isTarget ? type : 'object'

        if (given === expected) {
            continue
        }

        if (optional && (value === undefined || value == null)) {
            return false
        }

        const name = names.join('.')
        throw new Error(
            `Expected ${expected} for field '${name}' (got ${given})`,
        )
    }

    if (expectArray && !Array.isArray(value)) {
        throw new Error(
            `Expected array for field '${name}' (got ${typeof value})`,
        )
    }

    return true
}

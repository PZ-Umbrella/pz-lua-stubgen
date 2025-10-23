/**
 * Converts an array of objects with `name` properties to a record.
 * @param arr The array to convert.
 */
export const arrayToRecord = (arr: any): Record<any, any> => {
    const rec: Record<any, any> = {}
    if (!Array.isArray(arr)) {
        return rec
    }

    for (const obj of arr) {
        if (typeof obj !== 'object' || !obj?.name) {
            continue
        }

        rec[obj.name] = obj
    }

    return rec
}

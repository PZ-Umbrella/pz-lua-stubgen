import { convertRosettaTypes } from './convert-rosetta-types'
import type { AnalyzedField } from '../../analysis'
import type { RosettaField } from '../../rosetta'

/**
 * Converts a Rosetta field to an equivalent analyzed field.
 * @param field The Rosetta field to convert.
 * @param name The name of the field.
 */
export const convertRosettaField = (
    field: RosettaField,
    name: string,
): AnalyzedField => {
    return {
        name,
        types: convertRosettaTypes(field.type, field.nullable),
    }
}

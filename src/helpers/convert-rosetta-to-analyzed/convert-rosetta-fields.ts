import { convertRosettaField } from './convert-rosetta-field'
import type { AnalyzedField } from '../../analysis'
import type { RosettaField } from '../../rosetta'

/**
 * Converts Rosetta fields into a list of equivalent analyzed fields.
 * @param fields Rosetta fields to convert.
 */
export const convertRosettaFields = (
    fields: Record<string, RosettaField> | undefined,
): AnalyzedField[] => {
    if (!fields) {
        return []
    }

    return Object.entries(fields).map(([name, field]) =>
        convertRosettaField(field, name),
    )
}

import { convertAnalyzedField } from './convert-analyzed-field'
import type { AnalyzedField } from '../../analysis'
import type { RosettaField } from '../../rosetta'

/**
 * Converts a list of analyzed fields into a record to be written to a Rosetta file.
 * @param fields The analyzed fields to convert.
 * @param mergeFields Existing Rosetta fields to merge with the analyzed fields.
 * @param keepTypes Flag for whether Rosetta types should be kept.
 * @param applyHeuristics Flag for whether type resolution heuristics should be applied.
 */
export const convertAnalyzedFields = (
    fields: AnalyzedField[],
    mergeFields?: Record<string, RosettaField>,
    keepTypes?: boolean,
    applyHeuristics?: boolean,
): Record<string, RosettaField> => {
    const converted = fields
        .map((x): [string, RosettaField] => [
            x.name,
            convertAnalyzedField(
                x,
                mergeFields?.[x.name],
                keepTypes,
                applyHeuristics,
            ),
        ])
        .reduce<Record<string, RosettaField>>((rec, value) => {
            rec[value[0]] = value[1]
            return rec
        }, {})

    for (const [key, field] of Object.entries(mergeFields ?? {})) {
        if (!converted[key]) {
            converted[key] = field
        }
    }

    return converted
}

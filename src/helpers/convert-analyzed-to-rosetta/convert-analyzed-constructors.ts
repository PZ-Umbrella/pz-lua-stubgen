import { convertAnalyzedParameters } from './convert-analyzed-parameters'
import type { AnalyzedFunction } from '../../analysis'
import type { RosettaConstructor } from '../../rosetta'

/**
 * Converts analyzed constructors into Rosetta constructors, for writing to a Rosetta file.
 * @param constructors The list of constructors to convert.
 * @param mergeConstructors The existing constructors from Rosetta to merge.
 * @param keepTypes Flag for whether Rosetta types should be kept.
 * @param applyHeuristics Flag for whether type resolution heuristics should be applied.
 */
export const convertAnalyzedConstructors = (
    constructors: AnalyzedFunction[],
    mergeConstructors?: RosettaConstructor[],
    keepTypes?: boolean,
    applyHeuristics?: boolean,
): RosettaConstructor[] => {
    const converted = constructors.map((x, i): RosettaConstructor => {
        const cons: RosettaConstructor = {}
        const mergeCons = mergeConstructors ? mergeConstructors[i] : undefined

        if (mergeCons?.deprecated) {
            cons.deprecated = true
        }

        if (mergeCons?.notes) {
            cons.notes = mergeCons.notes
        }

        if (x.parameters.length > 0) {
            cons.parameters = convertAnalyzedParameters(
                x.parameters,
                mergeCons?.parameters,
                keepTypes,
                applyHeuristics,
                'new',
            )
        } else if (mergeCons?.parameters && mergeCons.parameters.length > 0) {
            cons.parameters = mergeCons.parameters
        }

        return cons
    })

    if (mergeConstructors && constructors.length < mergeConstructors.length) {
        for (let i = constructors.length; i < mergeConstructors.length; i++) {
            converted.push(mergeConstructors[i])
        }
    }

    return converted
}

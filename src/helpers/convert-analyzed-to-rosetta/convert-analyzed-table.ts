import { removeUndefinedOrEmpty } from '../common/remove-undefined-or-empty'
import { convertAnalyzedFields } from './convert-analyzed-fields'
import { convertAnalyzedFunctions } from './convert-analyzed-functions'
import { convertAnalyzedOverloads } from './convert-analyzed-overloads'
import type { AnalyzedTable } from '../../analysis'
import type { RosettaTable, WritableRosettaTable } from '../../rosetta'

/**
 * Converts an analyzed table into an object to be written to a Rosetta file.
 * @param table The analyzed table to convert.
 * @param mergeTable Existing Rosetta table to merge with the analyzed table.
 * @param keepTypes Flag for whether Rosetta types should be kept.
 * @param applyHeuristics Flag for whether type resolution heuristics should be applied.
 */
export const convertAnalyzedTable = (
    table: AnalyzedTable,
    mergeTable?: RosettaTable,
    keepTypes?: boolean,
    applyHeuristics?: boolean,
): WritableRosettaTable => {
    const rosettaTable: WritableRosettaTable = {
        name: table.name,
        deprecated: mergeTable?.deprecated,
        mutable: mergeTable?.mutable,
        local: table.local ? true : undefined,
        notes: mergeTable?.notes,
        tags: mergeTable?.tags,
        staticFields: convertAnalyzedFields(
            table.staticFields,
            mergeTable?.staticFields,
            keepTypes,
            applyHeuristics,
        ),
        overloads: convertAnalyzedOverloads(
            table.overloads,
            mergeTable?.overloads,
            applyHeuristics,
        ),
        operators: mergeTable?.operators,
        methods: convertAnalyzedFunctions(
            table.methods,
            mergeTable?.methods,
            keepTypes,
            applyHeuristics,
        ),
        staticMethods: convertAnalyzedFunctions(
            table.functions,
            mergeTable?.staticMethods,
            keepTypes,
            applyHeuristics,
        ),
    }

    return removeUndefinedOrEmpty(rosettaTable)
}

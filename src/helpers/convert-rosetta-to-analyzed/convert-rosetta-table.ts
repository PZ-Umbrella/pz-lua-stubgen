import { convertRosettaFields } from './convert-rosetta-fields'
import { convertRosettaFunctions } from './convert-rosetta-functions'
import { convertRosettaOverloads } from './convert-rosetta-overloads'
import type { AnalyzedTable } from '../../analysis'
import type { RosettaTable } from '../../rosetta'

/**
 * Converts a Rosetta table into an equivalent analyzed table.
 * @param table The Rosetta table to convert.
 */
export const convertRosettaTable = (table: RosettaTable): AnalyzedTable => {
    return {
        name: table.name,
        local: table.local,
        staticFields: convertRosettaFields(table.staticFields),
        methods: convertRosettaFunctions(table.methods),
        functions: convertRosettaFunctions(table.staticMethods),
        overloads: convertRosettaOverloads(table.overloads),
    }
}

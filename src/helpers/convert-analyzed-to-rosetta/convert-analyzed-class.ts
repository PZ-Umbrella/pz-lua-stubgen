import { removeUndefinedOrEmpty } from '../common/remove-undefined-or-empty'
import { convertAnalyzedConstructors } from './convert-analyzed-constructors'
import { convertAnalyzedFields } from './convert-analyzed-fields'
import { convertAnalyzedFunctions } from './convert-analyzed-functions'
import { convertAnalyzedOverloads } from './convert-analyzed-overloads'
import type { AnalyzedClass } from '../../analysis'
import type { RosettaClass, WritableRosettaClass } from '../../rosetta'

/**
 * Converts an analyzed class into an object to be written to a Rosetta file.
 * @param cls The analyzed class to convert.
 * @param mergeCls An existing Rosetta class to merge with the analyzed class.
 * @param keepTypes Flag for whether Rosetta types should be kept.
 * @param applyHeuristics Flag for whether type resolution heuristics should be applied.
 */
export const convertAnalyzedClass = (
    cls: AnalyzedClass,
    mergeCls?: RosettaClass,
    keepTypes?: boolean,
    applyHeuristics?: boolean,
): WritableRosettaClass => {
    const rosettaCls: WritableRosettaClass = {
        name: cls.name,
        extends: mergeCls?.extends?.includes(',')
            ? mergeCls.extends
            : (cls.extends ?? mergeCls?.extends),
        deprecated: mergeCls?.deprecated,
        mutable: mergeCls?.mutable,
        local: cls.local ? true : undefined,
        notes: mergeCls?.notes,
        tags: mergeCls?.tags,
        constructors: convertAnalyzedConstructors(
            cls.constructors,
            mergeCls?.constructors,
            keepTypes,
            applyHeuristics,
        ),
        staticFields: convertAnalyzedFields(
            [...cls.staticFields, ...cls.setterFields],
            mergeCls?.staticFields,
            keepTypes,
            applyHeuristics,
        ),
        fields: convertAnalyzedFields(
            cls.fields,
            mergeCls?.fields,
            keepTypes,
            applyHeuristics,
        ),
        overloads: convertAnalyzedOverloads(
            cls.overloads,
            mergeCls?.overloads,
            applyHeuristics,
        ),
        operators: mergeCls?.operators,
        methods: convertAnalyzedFunctions(
            cls.methods,
            mergeCls?.methods,
            keepTypes,
            applyHeuristics,
        ),
        staticMethods: convertAnalyzedFunctions(
            [...cls.functions, ...cls.functionConstructors],
            mergeCls?.staticMethods,
            keepTypes,
            applyHeuristics,
        ),
    }

    return removeUndefinedOrEmpty(rosettaCls)
}

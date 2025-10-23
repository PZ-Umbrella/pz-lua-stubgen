import { BaseAnnotateArgs } from '../common'

/**
 * Arguments for annotation.
 */
export interface AnnotateArgs extends BaseAnnotateArgs {
    /**
     * Flag for whether fields and functions in the generated stubs should be alphabetized.
     */
    alphabetize: boolean

    /**
     * Flag for wheter to include the kahlua stub in generated output.
     */
    includeKahlua: boolean

    /**
     * Flag for wheter fields should be treated as strict.
     */
    strictFields: boolean

    /**
     * Flag for wheter ambiguous analyzed types are allowed.
     */
    ambiguity: boolean

    /**
     * Regular expression used to determine whether a class or table is a helper type.
     * If matched, the initializer won't be written unless necessary. If the initializer is necessary,
     * a local table will be emitted.
     */
    helperPattern?: string
}

/**
 * Information about how to write a table initialier.
 */
export interface InitializerSettings {
    /**
     * Flag for whether the table initializer should be skipped.
     */
    skipInitializer: boolean

    /**
     * Flag for whether the table should be written as local.
     */
    forceLocal: boolean
}

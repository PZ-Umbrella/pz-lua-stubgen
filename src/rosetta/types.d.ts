import { BaseAnnotateArgs } from '../common'

/**
 * Arguments for reading Rosetta data.
 */
export interface RosettaArgs {
    /**
     * The directory to read Rosetta files from.
     */
    inputDirectory: string
}

/**
 * Arguments for Rosetta generation.
 */
export interface RosettaGenerateArgs extends BaseAnnotateArgs {
    /**
     * The format of Rosetta files to generate.
     */
    format?: 'json' | 'yml'

    /**
     * Flag for whether types in existing Rosetta files should be kept.
     */
    keepTypes?: boolean

    /**
     * Pattern for files to ignore.
     */
    skipPattern?: string
}

/**
 * Arguments for Rosetta updating.
 */
export interface RosettaUpdateArgs extends RosettaGenerateArgs {
    /**
     * The directory to write Rosetta files.
     * This is also used as the input directory if `rosetta` is not specified.
     */
    outputDirectory: string

    /**
     * The directory to read Rosetta files from.
     */
    rosetta?: string

    /**
     * Flag for whether unknown files should be deleted.
     */
    deleteUnknown?: boolean

    /**
     * File identifiers to treat as extra and not update.
     */
    extraFiles?: string[]
}

/**
 * Rosetta data read from a file.
 */
export interface RosettaFile {
    /**
     * The file identifier.
     */
    id: string

    /**
     * The filename that the data was read from.
     */
    filename: string

    /**
     * Aliases to include, annotated with `@alias`.
     */
    aliases: RosettaAlias[]

    /**
     * Map of class names to classes to include, annotated with `@class`.
     */
    classes: Record<string, RosettaClass>

    /**
     * Map of table identifiers to tables to include.
     */
    tables: Record<string, RosettaTable>

    /**
     * Map of function identifiers to functions to include.
     */
    functions: Record<string, RosettaFunction>

    /**
     * Map of identifiers to global fields to include.
     */
    fields: Record<string, RosettaField>

    /**
     * Set of file-level tags.
     */
    tags: Set<string>
}

/**
 * Rosetta data about a class.
 */
export interface RosettaClass {
    /**
     * The class name.
     */
    name: string

    /**
     * The classes that the class extends.
     */
    extends?: string

    /**
     * Notes to include in the class annotation.
     */
    notes?: string

    /**
     * Flag for whether the class should be marked as deprecated.
     */
    deprecated?: boolean

    /**
     * Flag for whether the class is "mutable".
     * If this is `true`, an `[any]` field is included with the type `any`.
     */
    mutable?: boolean

    /**
     * Flag for whether the class should be emitted with a local variable.
     */
    local?: boolean

    /**
     * List of class constructors.
     */
    constructors?: RosettaConstructor[]

    /**
     * List of class fields, annotated with `@field`.
     */
    fields?: Record<string, RosettaField>

    /**
     * List of static class fields, written as assignments.
     */
    staticFields?: Record<string, RosettaField>

    /**
     * Associates method names to class methods.
     */
    methods?: Record<string, RosettaMethod>

    /**
     * Associates method names to static class methods.
     */
    staticMethods?: Record<string, RosettaMethod>

    /**
     * List of overloads, annotated with `@overload`.
     */
    overloads?: RosettaOverload[]

    /**
     * List of operators, annotated with `@operator`.
     */
    operators?: RosettaOperator[]

    /**
     * List of tags for the class.
     */
    tags?: string[]
}

/**
 * Rosetta data about a table.
 */
export interface RosettaTable {
    /**
     * The table identifier.
     */
    name: string

    /**
     * Notes to include for the table.
     */
    notes?: string

    /**
     * Flag for whether the table should be marked as deprecated.
     */
    deprecated?: boolean

    /**
     * Flag for whether the table is "mutable".
     * Unused.
     */
    mutable?: boolean

    /**
     * Flag for whether the table should be emitted with a local variable.
     */
    local?: boolean

    /**
     * List of static table fields, written as assignments.
     */
    staticFields?: Record<string, RosettaField>

    /**
     * Associates method names to methods.
     */
    methods?: Record<string, RosettaMethod>

    /**
     * Associates method names to static methods.
     */
    staticMethods?: Record<string, RosettaMethod>

    /**
     * List of overloads, annotated with `@overload`.
     */
    overloads?: RosettaOverload[]

    /**
     * List of operators, annotated with `@operator`.
     */
    operators?: RosettaOperator[]

    /**
     * List of tags for the table.
     */
    tags?: string[]
}

/**
 * Rosetta data about a class constructor.
 */
export interface RosettaConstructor {
    /**
     * Notes to include in the annotation.
     */
    notes?: string

    /**
     * Flag for whether the constructor should be marked as deprecated.
     */
    deprecated?: boolean

    /**
     * Function parameters.
     */
    parameters?: RosettaParameter[]
}

/**
 * Rosetta data about a function.
 */
export interface RosettaFunction {
    /**
     * The function name.
     */
    name: string

    /**
     * Notes to include in the annotation.
     */
    notes?: string

    /**
     * Flag for whether the function should be marked as deprecated.
     */
    deprecated?: boolean

    /**
     * Function parameters.
     */
    parameters?: RosettaParameter[]

    /**
     * Function returns.
     */
    return?: RosettaReturn[]

    /**
     * List of overloads, annotated with `@overload`.
     */
    overloads?: RosettaOverload[]

    /**
     * List of tags for the function.
     */
    tags?: string[]
}

/**
 * Rosetta data about a method.
 */
export type RosettaMethod = RosettaFunction

/**
 * Rosetta data about an operator.
 */
export interface RosettaOperator {
    /**
     * The operator for the annotation.
     * Expected to be one of the following:
     * - add
     * - sub
     * - mul
     * - div
     * - mod
     * - pow
     * - unm
     * - concat
     * - len
     * - eq
     * - lt
     * - le
     */
    operation?: string

    /**
     * A parameter to include in the operator annotation.
     */
    parameter?: string

    /**
     * The return type of the operator.
     */
    return?: string

    /**
     * List of tags for the operator.
     */
    tags?: string[]
}

/**
 * Rosetta data about an overload.
 */
export interface RosettaOverload {
    /**
     * Notes to include in the overload annotation.
     */
    notes?: string

    /**
     * Overload parameters.
     */
    parameters?: RosettaParameter[]

    /**
     * Overload returns.
     */
    return?: RosettaReturn[]

    /**
     * List of tags for the overload.
     */
    tags?: string[]
}

/**
 * Rosetta data about a module or class field.
 */
export interface RosettaField {
    /**
     * The field type.
     */
    type?: string

    /**
     * Notes to include in the overload annotation.
     */
    notes?: string

    /**
     * Flag for whether the field is nullable.
     */
    nullable?: boolean

    /**
     * A default value to include with the field.
     */
    defaultValue?: string

    /**
     * List of tags for the field.
     */
    tags?: string[]
}

/**
 * Rosetta data about a function parameter.
 */
export interface RosettaParameter {
    /**
     * The parameter name.
     */
    name: string

    /**
     * The parameter type.
     */
    type?: string

    /**
     * Notes to include in the parameter annotation.
     */
    notes?: string

    /**
     * Flag for whether the parameter is optional.
     */
    optional?: boolean

    /**
     * Flag for whether the parameter is nullable.
     */
    nullable?: boolean
}

/**
 * Rosetta data about a function return.
 */
export interface RosettaReturn {
    /**
     * The name of the return value.
     */
    name?: string

    /**
     * The return type.
     */
    type?: string

    /**
     * Notes to include in the return annotation.
     */
    notes?: string

    /**
     * Flag for whether the return is nullable.
     */
    nullable?: boolean
}

/**
 * Rosetta data about a single alias type.
 */
export interface RosettaAliasType {
    /**
     * The alias type.
     */
    type: string

    /**
     * Notes to include in the alias annotation.
     */
    notes?: string
}

/**
 * Rosetta data about an alias.
 */
export interface RosettaAlias {
    /**
     * The alias name.
     */
    name: string

    /**
     * Alias types.
     */
    types: RosettaAliasType[]
}

/**
 * Helper type for a writable object with method lists.
 */
interface HasMethodLists {
    /**
     * Methods to write to a Rosetta data file.
     */
    methods?: RosettaMethod[]

    /**
     * Static methods to write to a Rosetta data file.
     */
    staticMethods?: RosettaMethod[]
}

/**
 * An object representing a Rosetta class prepared for writing.
 */
export type WritableRosettaClass = HasMethodLists &
    Omit<RosettaClass, 'methods' | 'staticMethods'>

/**
 * An object representing a Rosetta table prepared for writing.
 */
export type WritableRosettaTable = HasMethodLists &
    Omit<RosettaTable, 'methods' | 'staticMethods'>

/**
 * Function that reads a string and returns a Rosetta data object.
 */
export type RosettaDataReader = (text: string) => any

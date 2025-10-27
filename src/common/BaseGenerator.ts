import path from 'path'
import { Analyzer } from '../analysis/Analyzer'
import { AnalyzedClass, AnalyzedModule } from '../analysis/types'
import { Rosetta } from '../rosetta/Rosetta'
import type { RosettaFile } from '../rosetta/types'
import { BaseAnnotateArgs } from './types'
import { BaseCommandHandler } from './BaseCommandHandler'
import {
    convertRosettaClass,
    convertRosettaField,
    convertRosettaFunction,
    convertRosettaTable,
    readLuaStringLiteral,
} from '../helpers'

/**
 * Default list of classes for which fields should be excluded from the generated typestub.
 */
const DEFAULT_EXCLUDES = [
    'RecMedia',
    'Distributions',
    'ProceduralDistributions',
    'VehicleDistributions',
    'SuburbsDistributions',
    'ClutterTables',
    'BagsAndContainers',
    'SpecialLootSpawns',
]

/**
 * Base class for generating files.
 */
export abstract class BaseGenerator extends BaseCommandHandler {
    /**
     * The directory to output typestub files to.
     */
    protected outDirectory: string

    /**
     * The container for Rosetta data.
     */
    protected rosetta: Rosetta

    /**
     * Flag for whether the Rosetta data should be loaded.
     */
    protected useRosetta: boolean

    /**
     * Flag for whether injecting new data from Rosetta is not allowed.
     * If this is set, only items found via analysis will be included.
     */
    protected noInject: boolean

    /**
     * Flag for whether typestubs are being generated using only Rosetta data.
     */
    protected rosettaOnly: boolean

    /**
     * Flag for whether type heuristics are enabled.
     */
    protected heuristics: boolean

    /**
     * Set of class names to exclude from generated typestubs.
     */
    protected exclude: Set<string>

    /**
     * Set of class names for which fields should be excluded from generated typestubs.
     */
    protected excludeFields: Set<string>

    /**
     * Creates a new annotator.
     * @param args Arguments for annotation.
     */
    constructor(args: BaseAnnotateArgs) {
        super(args)

        this.outDirectory = path.normalize(args.outputDirectory)
        this.noInject = !(args.inject ?? true)
        this.exclude = new Set(args.exclude)
        this.excludeFields = new Set(args.excludeFields)
        this.rosettaOnly = args.rosettaOnly ?? false
        this.heuristics = args.heuristics ?? false

        if (!args.includeLargeDefs) {
            DEFAULT_EXCLUDES.forEach((x) => this.excludeFields.add(x))
        }

        this.useRosetta = args.rosetta !== undefined
        this.rosetta = new Rosetta({
            inputDirectory: args.rosetta ?? '',
        })
    }

    /**
     * Injects a static `Type` string field to classes created with a `:derive()` call.
     * @param modules Modules to augment.
     */
    protected addTypeField(modules: AnalyzedModule[]) {
        for (const mod of modules) {
            const rosettaFile = this.rosetta.files[mod.id]
            for (const cls of mod.classes) {
                const rosettaClass = rosettaFile?.classes?.[cls.name]
                const rosettaType = rosettaClass?.staticFields?.Type

                let deriveName: string | undefined
                if (cls.deriveName) {
                    // inject static `Type` field for derived classes
                    deriveName = cls.deriveName
                } else if (cls.extends && rosettaType?.defaultValue) {
                    // use rosetta field if defined & valid string literal
                    deriveName = readLuaStringLiteral(rosettaType.defaultValue)
                }

                if (deriveName) {
                    cls.staticFields.unshift({
                        name: 'Type',
                        types: new Set(),
                        expression: {
                            type: 'literal',
                            luaType: 'string',
                            literal: `"${deriveName}"`,
                        },
                    })
                }
            }
        }
    }

    /**
     * Excludes classes and class fields based on the options.
     * @param modules Modules to modify classes within.
     */
    protected applyExclusions(modules: AnalyzedModule[]) {
        for (const mod of modules) {
            mod.classes = mod.classes.filter((x) => !this.exclude.has(x.name))

            for (const cls of mod.classes) {
                if (!this.excludeFields.has(cls.name)) {
                    continue
                }

                cls.fields = []
                cls.literalFields = []
                cls.setterFields = []

                // include nested classes, throw away the rest
                cls.staticFields = cls.staticFields.filter(
                    (x) => x.types.size === 1 && !x.expression,
                )
            }
        }
    }

    /**
     * Augments an analyzed class with information from a Rosetta file.
     * @param cls The class to augment.
     * @param rosettaFile The Rosetta file containing the class.
     * @returns The augmented class. Augmentation occurs in-place, so this is `cls`.
     */
    protected augmentClass(
        cls: AnalyzedClass,
        rosettaFile: RosettaFile,
    ): AnalyzedClass {
        const rosettaClass = rosettaFile.classes[cls.name]
        if (!rosettaClass) {
            return cls
        }

        const fieldSet = new Set<string>(cls.fields.map((x) => x.name))

        const staticFieldSet = new Set<string>(
            [...cls.staticFields, ...cls.setterFields].map((x) => x.name),
        )

        const funcSet = new Set<string>(
            [...cls.functions, ...cls.functionConstructors].map((x) => x.name),
        )

        const methodSet = new Set<string>(cls.methods.map((x) => x.name))

        cls.fields.push(
            ...Object.entries(rosettaClass.fields ?? {})
                .filter(([name]) => !fieldSet.has(name))
                .map(([name, x]) => convertRosettaField(x, name)),
        )

        cls.staticFields.push(
            ...Object.entries(rosettaClass.staticFields ?? {})
                .filter(([name]) => !staticFieldSet.has(name))
                .map(([name, x]) => convertRosettaField(x, name)),
        )

        cls.functions.push(
            ...Object.entries(rosettaClass.staticMethods ?? {})
                .filter(([name]) => !funcSet.has(name))
                .map(([, x]) => convertRosettaFunction(x)),
        )

        cls.methods.push(
            ...Object.entries(rosettaClass.methods ?? {})
                .filter(([name]) => !methodSet.has(name))
                .map(([, x]) => convertRosettaFunction(x, true)),
        )

        // in rosetta-only mode, assume static `Type` field on subclass is derive name
        if (this.rosettaOnly && cls.extends) {
            const typeField = cls.staticFields.find((x) => x.name === 'Type')
            const typeValue =
                typeField?.expression?.type === 'literal' &&
                typeField.expression.literal
                    ? readLuaStringLiteral(typeField.expression.literal)
                    : undefined

            if (typeValue) {
                cls.deriveName = typeValue
            }
        }

        return cls
    }

    /**
     * Augments an analyzed module with information from a Rosetta file.
     * @param mod The module to augment.
     * @returns The augmented module. Augmentation occurs in-place, so this is `mod`.
     */
    protected augmentModule(mod: AnalyzedModule): AnalyzedModule {
        const rosettaFile = this.rosetta.files[mod.id]
        if (!rosettaFile) {
            return mod
        }

        for (const cls of mod.classes) {
            this.augmentClass(cls, rosettaFile)
        }

        const clsSet = new Set<string>(mod.classes.map((x) => x.name))
        const funcSet = new Set<string>(mod.functions.map((x) => x.name))
        const tableSet = new Set<string>(mod.tables.map((x) => x.name))

        mod.classes.push(
            ...Object.values(rosettaFile.classes)
                .filter((x) => !clsSet.has(x.name))
                .map(convertRosettaClass),
        )

        mod.functions.push(
            ...Object.values(rosettaFile.functions)
                .filter((x) => !funcSet.has(x.name))
                .map((x) => convertRosettaFunction(x)),
        )

        mod.tables.push(
            ...Object.values(rosettaFile.tables)
                .filter((x) => !tableSet.has(x.name))
                .map(convertRosettaTable),
        )

        const fieldSet = new Set<string>(mod.fields.map((x) => x.name))
        mod.fields.push(
            ...Object.entries(rosettaFile.fields)
                .filter(([name]) => !fieldSet.has(name))
                .map(([name, x]) => convertRosettaField(x, name)),
        )

        return mod
    }

    /**
     * Creates an analyzed module populated with information from Rosetta.
     * @param file The Rosetta file to create a module from.
     * @returns The new module.
     */
    protected createModule(file: RosettaFile): AnalyzedModule {
        const mod: AnalyzedModule = {
            id: file.id,
            prefix: file.tags.has('StubGen_Definitions')
                ? '---@meta _'
                : undefined,
            classes: [],
            functions: [],
            tables: [],
            fields: [],
            returns: [],
        }

        return this.augmentModule(mod)
    }

    /**
     * Performs analysis and returns a list of analyzed modules.
     * @param forRosetta Flag for whether this is running in the context of Rosetta initialization or update.
     * @returns A list of analyzed modules.
     */
    protected async getModules(forRosetta = false): Promise<AnalyzedModule[]> {
        let modules: AnalyzedModule[] = []

        if (!this.rosettaOnly) {
            const analyzer = new Analyzer({
                inputDirectory: this.inDirectory,
                subdirectories: this.subdirectories,
                isForRosetta: forRosetta,
                heuristics: this.heuristics,
            })

            modules = await analyzer.run()
        }

        await this.transformModules(modules)
        return modules
    }

    /**
     * Loads Rosetta files from the Rosetta directory.
     * @returns Flag for whether files were loaded.
     */
    protected async loadRosetta(): Promise<boolean> {
        if (!this.useRosetta) {
            return false
        }

        return await this.rosetta.load()
    }

    /**
     * Applies transformations to analyzed modules.
     * This includes:
     * - Applying exclusions
     * - Adding information indicated in Rosetta files
     * - Adding the `Type` field implied by derived classes
     *
     * @param modules The modules to apply transformations to.
     */
    protected async transformModules(modules: AnalyzedModule[]) {
        this.applyExclusions(modules)

        const idSet = new Set<string>(modules.map((x) => x.id))
        for (const [id, file] of Object.entries(this.rosetta.files)) {
            if (!idSet.has(id)) {
                modules.push(this.createModule(file))
            }
        }

        this.addTypeField(modules)

        if (this.rosettaOnly || !this.noInject) {
            for (const mod of modules) {
                this.augmentModule(mod)
            }
        }
    }
}

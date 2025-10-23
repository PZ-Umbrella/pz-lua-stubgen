import fs from 'fs'
import path from 'path'
import { log } from '../helpers'
import { RosettaGenerator } from './RosettaGenerator'

import {
    convertAnalyzedParameter,
    expressionToDefaultValue,
    time,
} from '../helpers'

import type {
    AnalyzedField,
    AnalyzedFunction,
    AnalyzedModule,
} from '../analysis'

import type {
    RosettaClass,
    RosettaConstructor,
    RosettaField,
    RosettaFile,
    RosettaFunction,
    RosettaParameter,
    RosettaUpdateArgs,
} from './types'

/**
 * Handles updating Rosetta data files.
 */
export class RosettaUpdater extends RosettaGenerator {
    /**
     * The directory to use for Rosetta files.
     */
    protected rosettaDir: string

    /**
     * Flag for whether unknown files should be deleted.
     */
    protected deleteUnknown: boolean

    /**
     * A set of file identifiers to treat as extra and not update.
     */
    protected extraFiles: Set<string>

    /**
     * Creates a new updater.
     * @param args Arguments for updating.
     */
    constructor(args: RosettaUpdateArgs) {
        const rosettaDir = args.rosetta ?? args.outputDirectory
        delete args.rosetta

        super(args)

        this.rosettaDir = rosettaDir
        this.deleteUnknown = args.deleteUnknown ?? true
        this.extraFiles = new Set(args.extraFiles)
    }

    /**
     * Runs Rosetta generation.
     * @returns A list of analyzed modules.
     */
    async run(): Promise<AnalyzedModule[]> {
        const modules = await this.getModules(true)

        let isUpdate = true
        if (await this.rosetta.load(this.rosettaDir)) {
            await time('updating Rosetta data', async () =>
                this.update(modules),
            )
        } else {
            isUpdate = false
            log.warn(`No Rosetta data to update; initializing data`)
        }

        await this.writeModules(modules, 'rewriting data', this.extraFiles)

        const resolvedOutDir = path.resolve(this.outDirectory)
        log.info(
            `${isUpdate ? 'Updated' : 'Generated'} Rosetta data at '${resolvedOutDir}'`,
        )

        return modules
    }

    /**
     * Determines whether a module should be skipped.
     * @param name The module identifier.
     * @param tags Tags included in a Rosetta file.
     */
    protected shouldSkip(name: string, tags?: string[]): boolean {
        return (
            tags?.includes('StubGen_Extra') ||
            this.skipPattern?.test(name) ||
            false
        )
    }

    /**
     * Updates Rosetta data for the given modules.
     * @param modules The modules to update.
     */
    protected async update(modules: AnalyzedModule[]) {
        for (const mod of modules) {
            if (this.extraFiles.has(mod.id)) {
                continue
            }

            const file = this.rosetta.files[mod.id]
            if (!file) {
                continue
            }

            this.updateClasses(mod, file)

            this.updateTables(mod, file)

            this.updateFunctions(
                mod.id,
                'function',
                mod.functions,
                file.functions,
            )

            this.updateFields(mod.id, mod.fields, file.fields)
        }

        const moduleIds = new Set(modules.map((x) => x.id))

        const toDelete = new Set<RosettaFile>()
        for (const file of Object.values(this.rosetta.files)) {
            if (moduleIds.has(file.id) || this.extraFiles.has(file.id)) {
                continue
            }

            if (file.tags.has('StubGen_Definitions')) {
                // don't rewrite definition files
                delete this.rosetta.files[file.id]
                continue
            }

            const filename = file.filename
            if (!filename || !this.deleteUnknown) {
                log.warn(`Found unknown file in Rosetta data: '${file.id}'`)
                continue
            }

            toDelete.add(file)
        }

        for (const file of toDelete) {
            delete this.rosetta.files[file.id]

            try {
                await fs.promises.unlink(file.filename!)
                log.verbose(`Deleted Rosetta data file '${file.id}'`)
            } catch (e) {
                log.error(
                    `Failed to delete Rosetta data file '${file.id}': ${e}`,
                )
            }
        }

        await this.transformModules(modules)
    }

    /**
     * Updates classes in a Rosetta file.
     * @param mod The module to update.
     * @param file The associated Rosetta file.
     */
    protected updateClasses(mod: AnalyzedModule, file: RosettaFile) {
        const clsMap = new Map(mod.classes.map((x) => [x.name, x]))

        const toDelete = new Set<string>()
        for (const rosettaCls of Object.values(file.classes)) {
            if (this.shouldSkip(rosettaCls.name, rosettaCls.tags)) {
                continue
            }

            const cls = clsMap.get(rosettaCls.name)
            if (!cls) {
                if (this.deleteUnknown) {
                    toDelete.add(rosettaCls.name)
                    log.debug(
                        `Deleted unknown class '${rosettaCls.name}' from '${mod.id}'`,
                    )
                } else {
                    log.warn(
                        `Found unknown class '${rosettaCls.name}' in '${mod.id}'`,
                    )
                }

                continue
            }

            this.updateConstructors(mod.id, cls.constructors, rosettaCls)

            this.updateFunctions(
                mod.id,
                'method',
                cls.methods,
                rosettaCls.methods,
                rosettaCls.name,
            )

            this.updateFunctions(
                mod.id,
                'function',
                [...cls.functions, ...cls.functionConstructors],
                rosettaCls.staticMethods,
                rosettaCls.name,
            )

            this.updateFields(
                mod.id,
                cls.fields,
                rosettaCls.fields,
                rosettaCls.name,
                false,
            )

            this.updateFields(
                mod.id,
                [...cls.staticFields, ...cls.setterFields],
                rosettaCls.staticFields,
                rosettaCls.name,
            )
        }

        for (const name of toDelete) {
            delete file.classes[name]
        }
    }

    /**
     * Updates constructors for a Rosetta class.
     * @param moduleId A module file identifier.
     * @param constructors The constructor list.
     * @param rosettaCls The Rosetta class.
     */
    protected updateConstructors(
        moduleId: string,
        constructors: AnalyzedFunction[],
        rosettaCls: RosettaClass,
    ) {
        if (!rosettaCls.constructors) {
            return
        }

        const clsName = rosettaCls.name
        const count = rosettaCls.constructors.length
        if (count > 1) {
            if (this.deleteUnknown) {
                rosettaCls.constructors.splice(1)
                log.debug(
                    `Deleted extra constructors from class '${clsName}' in '${moduleId}'`,
                )
            } else {
                log.warn(
                    `Found extra constructors in class '${clsName}', in '${moduleId}'`,
                )
            }
        }

        const rosettaCons = rosettaCls.constructors[0]
        if (!rosettaCons) {
            return
        }

        const cons = constructors[0]
        if (!cons) {
            if (this.deleteUnknown) {
                delete rosettaCls.constructors
                log.debug(
                    `Deleted constructor from class '${clsName}' in '${moduleId}'`,
                )
            } else {
                log.warn(
                    `Found unknown constructor in class '${clsName}', in '${moduleId}'`,
                )
            }

            return
        }

        this.updateParameters(
            moduleId,
            `'${clsName}' constructor`,
            cons,
            rosettaCons,
        )
    }

    /**
     * Updates module or class fields.
     * @param moduleId A module file identifier.
     * @param fields The analyzed fields.
     * @param rosettaFields The Rosetta fields.
     * @param parentName The name of the containing class, if these are class fields.
     * @param updateDefault Flag for whether the field's default value should be updated.
     */
    protected updateFields(
        moduleId: string,
        fields: AnalyzedField[],
        rosettaFields: Record<string, RosettaField> | undefined,
        parentName?: string,
        updateDefault = true,
    ) {
        if (!rosettaFields) {
            return
        }

        const toDelete = new Set<string>()
        const fieldMap = new Map(fields.map((x) => [x.name, x]))
        for (const [name, rosettaField] of Object.entries(rosettaFields)) {
            if (this.shouldSkip(name, rosettaField.tags)) {
                continue
            }

            // don't touch type fields; these aren't auto-generated
            if (/^\[[a-zA-Z_.][\w.]*\]/.test(name)) {
                continue
            }

            let fullName = name
            if (parentName) {
                fullName = `${parentName}.${name}`
            }

            const field = fieldMap.get(name)
            if (!field) {
                if (this.deleteUnknown) {
                    toDelete.add(name)
                    log.debug(
                        `Deleted unknown field '${fullName}' from '${moduleId}'`,
                    )
                } else {
                    log.warn(
                        `Found unknown field '${fullName}' in '${moduleId}'`,
                    )
                }

                continue
            }

            if (updateDefault && field.expression) {
                const expr = expressionToDefaultValue(field.expression)

                if (expr && expr !== rosettaField.defaultValue) {
                    rosettaField.defaultValue = expr

                    log.debug(
                        `Updated default value for field '${fullName}' in '${moduleId}'`,
                    )
                }
            }
        }

        for (const name of toDelete) {
            delete rosettaFields[name]
        }
    }

    /**
     * Updates functions for a class or module.
     * @param moduleId A module file identifier.
     * @param type The type of the functions.
     * @param funcs The analyzed functions.
     * @param rosettaFuncs The Rosetta functions.
     * @param parentName The name of the containing class, if these are class functions.
     */
    protected updateFunctions(
        moduleId: string,
        type: 'method' | 'function',
        funcs: AnalyzedFunction[],
        rosettaFuncs: Record<string, RosettaFunction> | undefined,
        parentName?: string,
    ) {
        if (!rosettaFuncs) {
            return
        }

        const toDelete = new Set<string>()
        const funcMap = new Map(funcs.map((x) => [x.name, x]))
        for (const rosettaFunc of Object.values(rosettaFuncs)) {
            if (this.shouldSkip(rosettaFunc.name, rosettaFunc.tags)) {
                continue
            }

            let fullName = rosettaFunc.name
            if (parentName) {
                const indexer = type === 'method' ? ':' : '.'
                fullName = `${parentName}${indexer}${rosettaFunc.name}`
            }

            const func = funcMap.get(rosettaFunc.name)
            if (!func) {
                if (this.deleteUnknown) {
                    toDelete.add(rosettaFunc.name)
                    log.debug(
                        `Deleted unknown ${type} '${fullName}' from '${moduleId}'`,
                    )
                } else {
                    log.warn(
                        `Found unknown ${type} '${fullName}' in '${moduleId}'`,
                    )
                }

                continue
            }

            this.updateParameters(
                moduleId,
                `'${fullName}'`,
                func,
                rosettaFunc,
                type === 'method',
            )
        }

        for (const name of toDelete) {
            delete rosettaFuncs[name]
        }
    }

    /**
     * Updates parameters for a function.
     * @param moduleId A module file identifier.
     * @param funcName The name of the containing function.
     * @param func The analyzed function to update parameters on.
     * @param rosettaFunc The Rosetta function.
     * @param isMethod Flag for whether the function is a method.
     */
    protected updateParameters(
        moduleId: string,
        funcName: string,
        func: AnalyzedFunction,
        rosettaFunc: RosettaFunction | RosettaConstructor,
        isMethod: boolean = false,
    ) {
        const params = rosettaFunc.parameters ?? []

        const unknown: RosettaParameter[] = []
        const paramSet = new Set(func.parameters.map((x) => x.name))
        if (isMethod) {
            paramSet.add('self')
        }

        for (const param of params) {
            if (paramSet.has(param.name)) {
                continue
            }

            if (this.deleteUnknown) {
                log.debug(
                    `Deleted unknown parameter '${param.name}' from ${funcName} in '${moduleId}'`,
                )

                continue
            }

            unknown.push(param)
            log.warn(
                `Found unknown parameter '${param.name}' in ${funcName}, in '${moduleId}'`,
            )
        }

        const updated: RosettaParameter[] = []
        const rosettaParamMap = new Map(params.map((x) => [x.name, x]))

        const includeSelf =
            isMethod &&
            rosettaParamMap.has('self') &&
            !func.parameters.find((x) => x.name === 'self')

        if (includeSelf) {
            func.parameters.unshift({
                name: 'self',
                types: new Set(),
            })
        }

        for (const param of func.parameters) {
            let rosettaParam = rosettaParamMap.get(param.name)
            if (!rosettaParam) {
                rosettaParam = convertAnalyzedParameter(param)
                log.debug(
                    `Added new parameter '${param.name}' to ${funcName} in '${moduleId}'`,
                )
            }

            updated.push(rosettaParam)
        }

        updated.push(...unknown)

        if (updated.length > 0) {
            rosettaFunc.parameters = updated
        } else {
            delete rosettaFunc.parameters
        }
    }

    /**
     * Updates module tables.
     * @param mod The module to update tables for.
     * @param file The Rosetta file.
     */
    protected updateTables(mod: AnalyzedModule, file: RosettaFile) {
        const tableMap = new Map(mod.tables.map((x) => [x.name, x]))

        const toDelete = new Set<string>()
        for (const rosettaTable of Object.values(file.tables)) {
            if (this.shouldSkip(rosettaTable.name, rosettaTable.tags)) {
                continue
            }

            const table = tableMap.get(rosettaTable.name)
            if (!table) {
                if (this.deleteUnknown) {
                    toDelete.add(rosettaTable.name)
                    log.debug(
                        `Deleted unknown table '${rosettaTable.name}' from '${mod.id}'`,
                    )
                } else {
                    log.warn(
                        `Found unknown table '${rosettaTable.name}' in '${mod.id}'`,
                    )
                }

                continue
            }

            this.updateFunctions(
                mod.id,
                'method',
                table.methods,
                rosettaTable.methods,
                rosettaTable.name,
            )

            this.updateFunctions(
                mod.id,
                'function',
                table.functions,
                rosettaTable.staticMethods,
                rosettaTable.name,
            )

            this.updateFields(
                mod.id,
                table.staticFields,
                rosettaTable.staticFields,
                rosettaTable.name,
            )
        }

        for (const name of toDelete) {
            delete file.tables[name]
        }
    }
}

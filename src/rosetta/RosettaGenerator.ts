import path from 'path'
import YAML from 'yaml'
import { BaseGenerator } from '../common'
import type { RosettaGenerateArgs } from './types'
import type { AnalyzedModule } from '../analysis/types'

import {
    convertAnalyzedClass,
    convertAnalyzedFields,
    convertAnalyzedFunctions,
    convertAnalyzedTable,
    log,
    writeFile,
    time,
} from '../helpers'

/**
 * Handles generation of Rosetta data files.
 */
export class RosettaGenerator extends BaseGenerator {
    /**
     * The format to use for output Rosetta files.
     */
    protected rosettaFormat: 'json' | 'yml'

    /**
     * Flag for whether types in existing Rosetta files should be kept.
     */
    protected keepTypes: boolean

    /**
     * Pattern for files to ignore.
     */
    protected skipPattern: RegExp | undefined

    /**
     * Creates a new generator.
     * @param args Arguments for file generation.
     */
    constructor(args: RosettaGenerateArgs) {
        super(args)

        this.keepTypes = args.keepTypes ?? false
        this.rosettaFormat = args.format ?? 'yml'

        if (args.skipPattern) {
            this.skipPattern = new RegExp(args.skipPattern)
        }
    }

    /**
     * Generates a string containing Rosetta data for an analyzed module.
     * @param mod The module to generate Rosetta data for.
     */
    generateRosetta(mod: AnalyzedModule): string {
        const rosettaFile = this.rosetta.files[mod.id]

        const classes: Record<string, any> = {}
        for (const cls of mod.classes) {
            const converted: any = convertAnalyzedClass(
                cls,
                rosettaFile?.classes[cls.name],
                this.keepTypes,
                this.heuristics,
            )

            delete converted.name
            classes[cls.name] = converted
        }

        const tables: Record<string, any> = {}
        for (const table of mod.tables) {
            const converted: any = convertAnalyzedTable(
                table,
                rosettaFile?.tables[table.name],
                this.keepTypes,
                this.heuristics,
            )

            delete converted.name
            tables[table.name] = converted
        }

        const luaData: any = {}
        if (rosettaFile?.aliases && rosettaFile.aliases.length > 0) {
            const aliases: Record<string, any> = {}

            for (const alias of rosettaFile.aliases) {
                aliases[alias.name] = alias.types
            }

            luaData.aliases = aliases
        }

        if (mod.tables.length > 0) {
            luaData.tables = tables
        }

        if (mod.classes.length > 0) {
            luaData.classes = classes
        }

        if (mod.functions.length > 0) {
            luaData.functions = convertAnalyzedFunctions(
                mod.functions,
                rosettaFile?.functions,
                this.keepTypes,
                this.heuristics,
            )
        }

        if (mod.fields.length > 0) {
            luaData.fields = convertAnalyzedFields(
                mod.fields,
                rosettaFile?.fields,
                this.keepTypes,
                this.heuristics,
            )
        }

        const data: any = {
            version: '1.1',
            languages: {
                lua: luaData,
            },
        }

        let out: string
        const format = this.rosettaFormat
        if (format === 'json') {
            out = JSON.stringify(data, undefined, 2)
        } else {
            out = YAML.stringify(data)
        }

        return out.replaceAll('\r', '').trimEnd() + '\n'
    }

    /**
     * Runs Rosetta generation.
     * @returns A list of analyzed modules.
     */
    async run(): Promise<AnalyzedModule[]> {
        const modules = await this.getModules(true)
        await this.writeModules(modules)

        const resolvedOutDir = path.resolve(this.outDirectory)
        log.info(`Generated Rosetta data at '${resolvedOutDir}'`)

        return modules
    }

    /**
     * Generates Rosetta files and writes them to the output directory.
     * @param modules The modules to convert and write.
     * @param taskName The name of the task for log output.
     * @param skipIds A set of module IDs that should be skipped.
     */
    protected async writeModules(
        modules: AnalyzedModule[],
        taskName = 'Rosetta initialization',
        skipIds?: Set<string>,
    ) {
        skipIds ??= new Set()

        await time(taskName, async () => {
            const outDir = this.outDirectory
            const extension = this.rosettaFormat === 'json' ? '.json' : '.yml'

            for (const mod of modules) {
                if (skipIds.has(mod.id) || this.skipPattern?.test(mod.id)) {
                    continue
                }

                const outFile = path.resolve(
                    path.join(outDir, this.rosettaFormat, mod.id + extension),
                )

                let data: string
                try {
                    data = this.generateRosetta(mod)
                } catch (e) {
                    log.error(
                        `Failed to generate Rosetta data for file '${outFile}': ${e}`,
                    )

                    continue
                }

                try {
                    await writeFile(outFile, data)
                } catch (e) {
                    log.error(`Failed to write file '${outFile}': ${e}`)
                }
            }
        })
    }
}

import fs from 'fs'
import path from 'path'
import YAML from 'yaml'

import type {
    RosettaAlias,
    RosettaAliasType,
    RosettaArgs,
    RosettaClass,
    RosettaDataReader,
    RosettaField,
    RosettaFile,
    RosettaFunction,
    RosettaTable,
} from './types'

import {
    arrayToRecord,
    expect,
    expectField,
    getFileIdentifier,
    log,
    readFileContents,
    time,
} from '../helpers'

/**
 * Handles reading Rosetta data files.
 */
export class Rosetta {
    /**
     * Record associating file identifiers to Rosetta files.
     */
    readonly files: Record<string, RosettaFile>

    /**
     * Input directory to read Rosetta files from.
     */
    protected inputDirectory: string

    /**
     * Creates a new Rosetta helper.
     * @param args Arguments for reading Rosetta files.
     */
    constructor(args: RosettaArgs) {
        this.inputDirectory = args.inputDirectory

        this.files = {}
    }

    /**
     * Loads Rosetta files from a directory and logs the result.
     * @param dir The directory to load files from. Defaults to the input directory.
     * @returns Flag for whether Rosetta data was found.
     */
    async load(dir?: string): Promise<boolean> {
        const targetDir = dir ?? this.inputDirectory
        return time(
            'loading Rosetta',
            async () => {
                if (await this.loadJSON(dir)) {
                    log.verbose(`Using JSON Rosetta data from '${targetDir}'`)
                    return true
                }

                if (await this.loadYAML(dir)) {
                    log.verbose(`Using YAML Rosetta data from '${targetDir}'`)
                    return true
                }

                return false
            },
            (result) => {
                if (!result) {
                    return `Failed to find Rosetta definitions in '${targetDir}'`
                }
            },
        )
    }

    /**
     * Loads Rosetta JSON files from a directory.
     * @param dir The directory to load files from. Defaults to the input directory.
     * @returns Flag for whether Rosetta data was found.
     */
    async loadJSON(dir?: string): Promise<boolean> {
        return await this.loadFiles('json', dir)
    }

    /**
     * Loads a single Rosetta JSON file.
     * @param filePath The path to the JSON file.
     * @param basePath The base path. Defaults to the parent directory of `filePath`.
     * @returns The loaded Rosetta file.
     */
    async loadJsonFile(
        filePath: string,
        basePath?: string,
    ): Promise<RosettaFile | undefined> {
        return await this.loadFile(
            filePath,
            basePath ?? path.dirname(filePath),
            JSON.parse,
            ['.json'],
        )
    }

    /**
     * Loads Rosetta YAML files from a directory.
     * @param dir The directory to load files from. Defaults to the input directory.
     * @returns Flag for whether Rosetta data was found.
     */
    async loadYAML(dir?: string): Promise<boolean> {
        return await this.loadFiles('yml', dir)
    }

    /**
     * Loads a single Rosetta YAML file.
     * @param filePath The path to the YAML file.
     * @param basePath The base path. Defaults to the parent directory of `filePath`.
     * @returns The loaded Rosetta file.
     */
    async loadYamlFile(
        filePath: string,
        basePath?: string,
    ): Promise<RosettaFile | undefined> {
        return await this.loadFile(
            filePath,
            basePath ?? path.dirname(filePath),
            YAML.parse,
            ['.yml', '.yaml'],
        )
    }

    /**
     * Loads a single Rosetta data file.
     * @param filePath The path to the Rosetta data file.
     * @param basePath The base path.
     * @param reader The function to use to read the data into an object.
     * @param extensions Expected file extensions.
     * @returns The loaded Rosetta file.
     */
    protected async loadFile(
        filePath: string,
        basePath: string,
        reader: RosettaDataReader,
        extensions: string[],
    ): Promise<RosettaFile | undefined> {
        try {
            const content = await readFileContents(filePath)
            const data = reader(content)
            const id = getFileIdentifier(filePath, basePath, extensions)
            return this.readData(data, id, path.resolve(filePath))
        } catch (e) {
            log.error(`Failed to read Rosetta file '${filePath}': ${e}`)
        }
    }

    /**
     * Loads Rosetta files from a directory.
     * @param type The file type to load.
     * @param dir The directory to load files from.
     * @returns Flag for whether Rosetta data was found.
     */
    protected async loadFiles(type: string, dir?: string): Promise<boolean> {
        const basePath = `${dir ?? this.inputDirectory}/${type}`
        if (!fs.existsSync(basePath) || !fs.statSync(basePath).isDirectory) {
            return false
        }

        let reader: RosettaDataReader
        let extensions: string[] = []
        switch (type) {
            case 'json':
                extensions = ['.json']
                reader = JSON.parse
                break

            case 'yml':
                extensions = ['.yml', '.yaml']
                reader = YAML.parse
                break

            default:
                return false
        }

        const stack = [basePath]
        while (stack.length > 0) {
            const dirPath = stack.pop()!

            try {
                const dir = await fs.promises.opendir(dirPath)

                for await (const fileOrDir of dir) {
                    const childPath = path.join(dirPath, fileOrDir.name)

                    if (fileOrDir.isDirectory()) {
                        stack.push(childPath)
                        continue
                    }

                    if (!fileOrDir.isFile()) {
                        continue
                    }

                    const extname = path.extname(childPath)
                    if (!extensions.includes(extname)) {
                        continue
                    }

                    await this.loadFile(childPath, basePath, reader, extensions)
                }
            } catch (e) {
                log.error(`Failed to read Rosetta directory '${dirPath}': ${e}`)
            }
        }

        return true
    }

    /**
     * Validates and converts data from a Rosetta file.
     * @param data The data read from a Rosetta file.
     * @param id The file identifier.
     * @param filename The filename.
     */
    protected readData(
        data: any,
        id: string,
        filename: string,
    ): RosettaFile | undefined {
        expect(data, 'object')

        expectField(data, 'version', 'string', false)
        if (data.version !== '1.1') {
            throw new Error(`Unexpected version '${data.version}'`)
        }

        // no Lua data → ignore
        if (!expectField(data, 'languages.lua', 'object')) {
            return
        }

        const lua = data.languages.lua

        const aliases: RosettaAlias[] = []
        if (expectField(data, 'languages.lua.aliases', 'object')) {
            for (const name of Object.keys(lua.aliases)) {
                const arr = lua.aliases[name]
                expect(arr, 'array', `alias '${name}'`)

                const types: RosettaAliasType[] = []
                for (let i = 0; i < arr.length; i++) {
                    const alias = arr[i]
                    expect(
                        alias.type,
                        'string',
                        `'type' field of alias '${name}' at index ${i}`,
                    )

                    types.push(alias)
                }

                if (types.length === 0) {
                    continue
                }

                aliases.push({ name, types })
            }
        }

        const classes: Record<string, RosettaClass> = {}
        if (expectField(data, 'languages.lua.classes', 'object')) {
            for (const name of Object.keys(lua.classes)) {
                const obj = lua.classes[name]
                expect(obj, 'object', `class '${name}'`)

                const cls = obj as RosettaClass
                cls.name = name
                cls.methods = arrayToRecord(obj.methods)
                cls.staticMethods = arrayToRecord(obj.staticMethods)

                classes[name] = cls
            }
        }

        const tables: Record<string, RosettaTable> = {}
        if (expectField(data, 'languages.lua.tables', 'object')) {
            for (const name of Object.keys(lua.tables)) {
                const obj = lua.tables[name]
                expect(obj, 'object', `table '${name}'`)

                const tab = obj as RosettaTable
                tab.name = name
                tab.methods = arrayToRecord(obj.methods)
                tab.staticMethods = arrayToRecord(obj.staticMethods)

                tables[name] = tab
            }
        }

        const fields: Record<string, RosettaField> = {}
        if (expectField(data, 'languages.lua.fields', 'object')) {
            for (const name of Object.keys(lua.fields)) {
                const obj = lua.fields[name]
                expect(obj, 'object', `field '${name}'`)

                fields[name] = obj
            }
        }

        const functions: Record<string, RosettaFunction> = {}
        if (expectField(data, 'languages.lua.functions', 'array')) {
            for (let i = 0; i < lua.functions.length; i++) {
                const obj = lua.functions[i]
                expect(obj, 'object', `value at index ${i} of function list`)

                functions[obj.name] = obj
            }
        }

        const tags = new Set<string>()
        if (expectField(data, 'languages.lua.tags', 'array')) {
            for (let i = 0; i < lua.tags.length; i++) {
                const tag = lua.tags[i]
                expect(tag, 'string', `value at index ${i} of tags list`)

                tags.add(tag)
            }
        }

        if (tags.has('StubGen_Definitions')) {
            for (const cls of Object.values(classes)) {
                if (cls.local) {
                    continue
                }

                cls.tags ??= []
                cls.tags.push('StubGen_NoInitializer')
            }
        }

        const file: RosettaFile = {
            id,
            filename,
            aliases,
            classes,
            tables,
            functions,
            fields,
            tags,
        }

        this.files[id] = file
        return file
    }
}

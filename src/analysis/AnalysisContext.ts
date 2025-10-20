import ast from 'luaparse'
import { LuaScope } from '../scopes'
import {
    LuaExpression,
    LuaExpressionInfo,
    ResolvedScopeItem,
    TableField,
    FunctionInfo,
    TableInfo,
    ResolvedModule,
    AnalysisContextArgs,
    AssignmentItem,
    FunctionDefinitionItem,
    RequireAssignmentItem,
} from './types'

import { TypeResolver } from './TypeResolver'
import { AnalysisFinalizer } from './AnalysisFinalizer'
import { ClassResolver } from './ClassResolver'

/**
 * Shared context for analysis of multiple Lua files.
 */
export class AnalysisContext {
    /**
     * Mapping of file aliases to file identifiers.
     */
    aliasMap: Map<string, Set<string>>

    /**
     * Whether heuristics based on item names should be applied.
     */
    applyHeuristics: boolean

    /**
     * Helper for finding and resolving class definitions.
     */
    classResolver: ClassResolver

    /**
     * The identifier of the module being processed.
     */
    currentModule: string

    /**
     * Definitions for items.
     */
    definitions: Map<string, LuaExpressionInfo[]>

    /**
     * Helper for finalizing analyzed types.
     */
    finalizer: AnalysisFinalizer

    /**
     * Whether the analysis is running in the context of Rosetta initialization or updating.
     */
    isRosettaInit: boolean

    /**
     * Maps file identifiers to resolved modules.
     */
    modules: Map<string, ResolvedModule>

    /**
     * Helper for resolving types.
     */
    typeResolver: TypeResolver

    /**
     * Expression types inferred by usage.
     */
    usageTypes: Map<LuaExpression, Set<string>>

    /**
     * Associates unrecognized global names to temporary table IDs used to represent them.
     * This is reset for each module.
     */
    unknownClasses: Map<string, string>

    /**
     * Maps function declarations to function IDs.
     */
    protected functionToId: Map<ast.FunctionDeclaration, string>

    /**
     * Maps function IDs to info about the function they describe.
     */
    protected idToFunctionInfo: Map<string, FunctionInfo>

    /**
     * Maps table IDs to info about the table they describe.
     */
    protected idToTableInfo: Map<string, TableInfo>

    /**
     * The next available table ID number.
     */
    protected nextTableIndex: number = 1

    /**
     * The next available function ID number.
     */
    protected nextFunctionIndex: number = 1

    /**
     * Maps parameter IDs to function IDs.
     */
    protected parameterToFunctionId: Map<string, string>

    /**
     * Maps table constructor expressions to table IDs.
     */
    protected tableToId: Map<ast.TableConstructorExpression, string>

    constructor(args: AnalysisContextArgs) {
        this.currentModule = ''
        this.aliasMap = new Map()
        this.tableToId = new Map()
        this.functionToId = new Map()
        this.idToTableInfo = new Map()
        this.idToFunctionInfo = new Map()
        this.parameterToFunctionId = new Map()
        this.definitions = new Map()
        this.usageTypes = new Map()
        this.unknownClasses = new Map()
        this.modules = new Map()

        this.classResolver = new ClassResolver(this)
        this.typeResolver = new TypeResolver(this)
        this.finalizer = new AnalysisFinalizer(this)

        this.isRosettaInit = args.isRosettaInit ?? false
        this.applyHeuristics = args.heuristics ?? false
    }

    /**
     * Adds an assignment to the list of definitions or fields.
     */
    addAssignment(
        scope: LuaScope,
        item: AssignmentItem | FunctionDefinitionItem | RequireAssignmentItem,
    ) {
        scope.addItem(item)
        this.typeResolver.resolveAssignment(scope, item)
    }

    /**
     * Returns the current module's name.
     * This is the last part of the file identifier path.
     */
    getCurrentModuleName(): string {
        const slash = this.currentModule.lastIndexOf('/')
        if (slash === -1) {
            return this.currentModule
        }

        return this.currentModule.slice(slash + 1)
    }

    /**
     * Gets the list of definitions for an item ID.
     */
    getDefinitions(id: string): LuaExpressionInfo[] {
        return this.definitions.get(id) ?? []
    }

    /**
     * Gets the ID to use for a function.
     */
    getFunctionId(expr: ast.FunctionDeclaration, name?: string): string {
        let id = this.functionToId.get(expr)
        if (!id) {
            const count = this.nextFunctionIndex++
            id = `@function(${count})` + (name ? `[${name}]` : '')

            this.functionToId.set(expr, id)
        }

        return id
    }

    /**
     * Gets a function ID given an ID of one of its parameter.
     */
    getFunctionIdFromParamId(id: string): string | undefined {
        return this.parameterToFunctionId.get(id)
    }

    /**
     * Gets function info from a function ID, creating it if it doesn't exist.
     */
    getFunctionInfo(id: string): FunctionInfo {
        let info = this.idToFunctionInfo.get(id)
        if (info) {
            return info
        }

        info = {
            id,
            parameters: [],
            parameterNames: [],
            parameterTypes: [],
            returnTypes: [],
            returnExpressions: [],
        }

        this.idToFunctionInfo.set(id, info)
        return info
    }

    /**
     * Gets a module given its name.
     */
    getModule(name: string, checkAliases = false): ResolvedModule | undefined {
        let mod = this.modules.get(name)
        if (mod || !checkAliases) {
            return mod
        }

        let alias = this.aliasMap.get(name)
        const firstAlias = alias ? [...alias][0] : undefined
        return firstAlias ? this.modules.get(firstAlias) : undefined
    }

    /**
     * Gets the ID to use for a table.
     */
    getTableId(expr: ast.TableConstructorExpression, name?: string): string {
        let id = this.tableToId.get(expr)
        if (!id) {
            id = this.newTableId(name)
            this.tableToId.set(expr, id)
        }

        return id
    }

    /**
     * Gets table info from a table ID, creating it if it doesn't exist.
     */
    getTableInfo(id: string): TableInfo {
        let info = this.idToTableInfo.get(id)
        if (info) {
            return info
        }

        info = {
            id,
            literalFields: [],
            definitions: new Map(),
            definingModule: this.currentModule,
        }

        this.idToTableInfo.set(id, info)
        return info
    }

    /**
     * Creates a new table ID.
     * @param name A name to include in the ID.
     */
    newTableId(name?: string): string {
        const count = this.nextTableIndex++
        return `@table(${count})` + (name ? `[${name}]` : '')
    }

    /**
     * Sets the current module being processed.
     * @param id The file identifier for the current module.
     */
    setCurrentReadingModule(id?: string) {
        this.currentModule = id ?? ''
        this.unknownClasses.clear()
    }

    /**
     * Sets up basic info for a function.
     */
    setFunctionInfo(
        functionId: string,
        scope: LuaScope,
        node: ast.FunctionDeclaration,
        identExpr: LuaExpression | undefined,
    ): string[] {
        const info = this.getFunctionInfo(functionId)
        info.identifierExpression = identExpr

        this.typeResolver.resolveFunctionParams(scope, node, info)

        for (const param of info.parameters) {
            this.parameterToFunctionId.set(param, functionId)
        }

        return info.parameters
    }

    /**
     * Sets resolved information about a module.
     */
    setModule(id: string, scope: LuaScope, resolved: ResolvedScopeItem) {
        const mod = resolved as ResolvedModule
        mod.scope = scope

        this.modules.set(id, mod)
    }

    /**
     * Sets the fields used to define a table.
     * This is used later for expression rewriting.
     */
    setTableLiteralFields(
        scope: LuaScope,
        tableId: string,
        fields: TableField[],
    ) {
        const info = this.getTableInfo(tableId)
        info.literalFields = fields

        this.typeResolver.resolveTableLiteralFields(scope, info)
    }
}

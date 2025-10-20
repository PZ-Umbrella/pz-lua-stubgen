import ast from 'luaparse'
import { LuaScope } from '../scopes'
import { readLuaStringLiteral } from '../helpers'
import {
    AssignmentItem,
    FunctionDefinitionItem,
    LuaExpression,
    LuaExpressionInfo,
    LuaType,
    RequireAssignmentItem,
    ResolvedClassInfo,
    ResolvedFunctionInfo,
    ResolvedScopeItem,
    ResolvedReturnInfo,
    TableField,
    UsageItem,
    FunctionInfo,
    TableInfo,
    LuaReference,
    ResolvedModule,
    ResolvedRequireInfo,
    AnalysisContextArgs,
    ReturnsItem,
    ResolvedFieldInfo,
} from './types'

import { TypeResolver } from './TypeResolver'
import { AnalysisFinalizer } from './AnalysisFinalizer'
import { ClassResolver } from './ClassResolver'
import type { Analyzer } from './Analyzer'

/**
 * Shared context for analysis of multiple Lua files.
 */
export class AnalysisContext {
    /**
     * The analysis driver.
     */
    analyzer: Analyzer

    /**
     * Helper for finding and resolving class definitions.
     */
    classResolver: ClassResolver

    /**
     * The identifier of the module being processed.
     */
    currentModule: string

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
     * Mapping of files aliases to file identifiers.
     */
    protected aliasMap: Map<string, Set<string>>

    /**
     * Whether heuristics based on item names should be applied.
     */
    protected applyHeuristics: boolean

    /**
     * Definitions for items.
     */
    protected definitions: Map<string, LuaExpressionInfo[]>

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

    /**
     * Expression types inferred by usage.
     */
    protected usageTypes: Map<LuaExpression, Set<string>>

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
        this.modules = new Map()

        this.analyzer = args.analyzer
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
        const lhs =
            item.type === 'functionDefinition' ? item.expression : item.lhs

        // anonymous functions have no assignment
        if (!lhs) {
            return
        }

        let rhs: LuaExpression
        switch (item.type) {
            case 'assignment':
            case 'requireAssignment':
                rhs = item.rhs
                break

            case 'functionDefinition':
                rhs = item.literal
                break
        }

        const index = item.type === 'assignment' ? item.index : undefined
        switch (lhs.type) {
            case 'reference':
                const tableId = this.tryAddPartialItem(scope, item, lhs, rhs)

                if (tableId) {
                    rhs = {
                        type: 'literal',
                        luaType: 'table',
                        tableId,
                    }
                }

                this.addDefinition(scope, lhs.id, rhs, index)
                break

            case 'index':
                const indexBase = [
                    ...this.typeResolver.resolve({ expression: lhs.base }),
                ]

                if (indexBase.length !== 1) {
                    break
                }

                const resolved = this.typeResolver.resolveToLiteral(lhs.index)
                if (!resolved || !resolved.literal) {
                    break
                }

                const key = this.getLiteralKey(
                    resolved.literal,
                    resolved.luaType,
                )

                this.addField(scope, indexBase[0], key, rhs, lhs, index)
                break

            case 'member':
                let isInstance = false
                const memberBase = [
                    ...this.typeResolver.resolve({ expression: lhs.base }),
                ].filter((x) => {
                    if (!x.startsWith('@self') && !x.startsWith('@instance')) {
                        return true
                    }

                    isInstance = true
                    return false
                })

                if (memberBase.length !== 1) {
                    break
                }

                // ignore __index in instances
                if (isInstance && lhs.member === '__index') {
                    break
                }

                // add original assignment name to tables
                if (rhs.type === 'literal' && rhs.tableId) {
                    const info = this.getTableInfo(rhs.tableId)
                    info.originalName ??= this.classResolver.getFieldClassName(
                        scope,
                        lhs,
                    )
                }

                const memberKey = this.getLiteralKey(lhs.member)
                this.addField(
                    scope,
                    memberBase[0],
                    memberKey,
                    rhs,
                    lhs,
                    index,
                    isInstance,
                )

                break

            // operation or literal should not occur directly in lhs
        }
    }

    /**
     * Finalizes analyzed modules.
     */
    finalizeModules() {
        return this.finalizer.finalize()
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
     * Gets the literal key to use for a table field mapping.
     */
    getLiteralKey(key: string, type?: LuaType) {
        let internal: string | undefined
        if (!type) {
            internal = key
        } else if (type === 'string') {
            internal = readLuaStringLiteral(key)
        }

        if (!internal) {
            return key
        }

        return '"' + internal.replaceAll('"', '\\"') + '"'
    }

    /**
     * Gets a module given its name.
     */
    getModule(name: string, checkAliases = false): ResolvedModule | undefined {
        let mod = this.modules.get(name)
        if (!mod && checkAliases) {
            let alias = this.aliasMap.get(name)
            const firstAlias = alias ? [...alias][0] : undefined
            if (firstAlias) {
                mod = this.modules.get(firstAlias)
            }
        }

        return mod
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
     * Gets the types determined based on usage for an expression.
     * Returns undefined if types couldn't be determined.
     */
    getUsageTypes(expr: LuaExpression): Set<string> | undefined {
        const types = this.usageTypes.get(expr)
        if (!types || types.size === 0 || types.size === 5) {
            return
        }

        return types
    }

    newTableId(name?: string): string {
        const count = this.nextTableIndex++
        return `@table(${count})` + (name ? `[${name}]` : '')
    }

    /**
     * Resolves the types of the analysis items for a module.
     */
    resolveItems(scope: LuaScope): ResolvedScopeItem {
        // collect usage information
        for (const item of scope.items) {
            if (item.type !== 'usage') {
                continue
            }

            this.addUsage(item)
        }

        // resolve classes, functions, and returns
        const classes: ResolvedClassInfo[] = []
        const functions: ResolvedFunctionInfo[] = []
        const requires: ResolvedRequireInfo[] = []
        const fields: ResolvedFieldInfo[] = []
        const seenClasses = new Set<string>()

        let hasReturn = false
        for (const item of scope.items) {
            hasReturn ||= item.type === 'returns'

            switch (item.type) {
                case 'partial':
                    if (item.classInfo) {
                        const info = this.getTableInfo(item.classInfo.tableId)
                        if (!info.isEmptyClass) {
                            classes.push(item.classInfo)
                        }
                    }

                    if (item.functionInfo) {
                        functions.push(item.functionInfo)
                    }

                    if (item.requireInfo) {
                        requires.push(item.requireInfo)
                    }

                    if (item.fieldInfo) {
                        fields.push(item.fieldInfo)
                    }

                    if (item.seenClassId) {
                        seenClasses.add(item.seenClassId)
                    }

                    break

                case 'resolved':
                    item.functions.forEach((x) => functions.push(x))
                    item.classes.forEach((x) => classes.push(x))
                    item.requires.forEach((x) => requires.push(x))
                    item.fields.forEach((x) => fields.push(x))
                case 'returns':
                    this.resolveReturns(item)
                    break
            }
        }

        let returns: ResolvedReturnInfo[] | undefined
        if (hasReturn || scope.type !== 'block') {
            const funcInfo = this.getFunctionInfo(scope.id)
            returns = funcInfo.returnTypes.map(
                (returnTypes, i): ResolvedReturnInfo => {
                    return {
                        types: new Set(returnTypes),
                        expressions: funcInfo.returnExpressions[i] ?? new Set(),
                    }
                },
            )
        }

        if (scope.type === 'module') {
            const declaredClasses = new Set<string>()
            classes.forEach((x) => declaredClasses.add(x.tableId))

            for (const id of seenClasses) {
                if (declaredClasses.has(id)) {
                    continue
                }

                const info = this.getTableInfo(id)
                if (!info.className || info.isEmptyClass) {
                    continue
                }

                classes.push({
                    name: info.className,
                    tableId: info.id,
                })
            }
        }

        return {
            type: 'resolved',
            id: scope.id,
            classes,
            functions,
            returns,
            requires,
            fields,
            seenClasses,
        }
    }

    resolveReturns(item: ReturnsItem | ResolvedScopeItem) {
        if (item.returns === undefined) {
            return
        }

        const funcInfo = this.getFunctionInfo(item.id)

        // don't add returns to a class constructor
        if (funcInfo.isConstructor) {
            funcInfo.minReturns = Math.min(
                funcInfo.minReturns ?? Number.MAX_VALUE,
                item.returns.length,
            )

            return
        }

        let fullReturnCount = item.returns.length
        for (let i = 0; i < item.returns.length; i++) {
            funcInfo.returnTypes[i] ??= new Set()
            funcInfo.returnExpressions[i] ??= new Set()

            if (item.type === 'resolved') {
                item.returns[i].types.forEach((x) =>
                    funcInfo.returnTypes[i].add(x),
                )

                continue
            }

            const ret = item.returns[i]
            const isTailCall =
                i === item.returns.length - 1 &&
                ret.type === 'operation' &&
                ret.operator === 'call'

            if (isTailCall) {
                const funcReturns = this.typeResolver.resolveReturnTypes(ret)
                if (funcReturns) {
                    fullReturnCount += funcReturns.length - 1
                    funcInfo.returnExpressions[i].add(ret)

                    for (let j = 0; j < funcReturns.length; j++) {
                        funcInfo.returnTypes[i + j] ??= new Set()

                        this.remapBooleans(funcReturns[j]).forEach((x) =>
                            funcInfo.returnTypes[i + j].add(x),
                        )
                    }

                    continue
                }
            }

            funcInfo.returnExpressions[i].add(ret)
            this.remapBooleans(
                this.typeResolver.resolve({ expression: ret }),
            ).forEach((x) => funcInfo.returnTypes[i].add(x))
        }

        funcInfo.minReturns = Math.min(
            funcInfo.minReturns ?? Number.MAX_VALUE,
            fullReturnCount,
        )

        const min = funcInfo.minReturns
        if (min === undefined) {
            return
        }

        if (funcInfo.returnTypes.length <= min) {
            return
        }

        // mark returns exceeding the minimum as nullable
        for (let i = min; i < funcInfo.returnTypes.length; i++) {
            funcInfo.returnTypes[i].add('nil')
        }
    }

    setAliasMap(map: Map<string, Set<string>>) {
        this.aliasMap = map
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
        info.parameters = []
        info.parameterTypes = []
        info.returnTypes = []
        info.identifierExpression = identExpr

        if (identExpr?.type === 'member') {
            // add implicit self parameter
            if (identExpr.indexer === ':') {
                info.parameters.push(scope.getOrAddSelf())
            }

            this.classResolver.tryAddFromFunctionDefinition(
                scope,
                node,
                info,
                identExpr,
            )
        }

        for (const param of node.parameters) {
            const paramId = scope.getLocalId(
                param.type === 'Identifier' ? param.name : '...',
            )

            if (paramId) {
                info.parameters.push(paramId)
            }
        }

        info.parameterNames = info.parameters.map((x) => scope.getName(x))

        if (this.applyHeuristics) {
            this.typeResolver.applyParamNameHeuristics(info)
        }

        for (const param of info.parameters) {
            this.parameterToFunctionId.set(param, functionId)
        }

        return info.parameters
    }

    /**
     * Modifies types based on a setmetatable call.
     */
    setMetatable(scope: LuaScope, lhs: LuaExpression, meta: LuaExpression) {
        if (lhs.type !== 'reference') {
            return
        }

        const name = scope.localIdToName(lhs.id)
        if (!name) {
            return
        }

        if (meta.type === 'literal') {
            const fields = meta.fields

            // { X = Y }
            if (fields?.length !== 1) {
                return
            }

            // { __index = X }
            const field = fields[0]
            if (field.key.type !== 'string' || field.key.name !== '__index') {
                return
            }

            meta = field.value
        }

        // get metatable type
        const metaTypes = [
            ...this.typeResolver.resolve({ expression: meta }),
        ].filter((x) => !x.startsWith('@self'))

        const resolvedMeta = metaTypes[0]
        if (metaTypes.length !== 1 || !resolvedMeta.startsWith('@table')) {
            return
        }

        // check that metatable is a class
        const metaInfo = this.getTableInfo(resolvedMeta)
        if (!metaInfo.className && !metaInfo.fromHiddenClass) {
            return
        }

        // get lhs types
        const lhsTypes = [
            ...this.typeResolver.resolve({ expression: lhs }),
        ].filter((x) => x !== '@instance')

        if (lhsTypes.find((x) => !x.startsWith('@table'))) {
            // non-table lhs → don't treat as instance
            return
        }

        for (const resolvedLhs of lhsTypes) {
            const lhsInfo = this.getTableInfo(resolvedLhs)
            // don't copy class fields
            if (lhsInfo.className) {
                continue
            }

            // copy table fields to class instance fields
            lhsInfo.definitions.forEach((list, key) => {
                let fieldDefs = metaInfo.definitions.get(key)
                if (!fieldDefs) {
                    fieldDefs = []
                    metaInfo.definitions.set(key, fieldDefs)
                }

                for (const info of list) {
                    fieldDefs.push({
                        expression: info.expression,
                        index: info.index,
                        instance: true,
                        definingModule: this.currentModule,
                        functionLevel: !scope.id.startsWith('@module'),
                    })
                }
            })
        }

        // mark lhs as class instance
        const newId = scope.addInstance(name)
        this.definitions.set(newId, [
            {
                expression: {
                    type: 'literal',
                    luaType: 'table',
                    tableId: resolvedMeta,
                },
            },
        ])
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

        for (const field of fields) {
            const key = field.key

            let literalKey: string | undefined
            switch (key.type) {
                case 'string':
                    literalKey = this.getLiteralKey(key.name)
                    break

                case 'literal':
                    literalKey = this.getLiteralKey(key.literal, key.luaType)
                    break

                case 'auto':
                    literalKey = key.index.toString()
                    break

                // can't resolve expressions
            }

            if (!literalKey) {
                continue
            }

            this.addField(
                scope,
                tableId,
                literalKey,
                field.value,
                undefined,
                1,
                false,
                true,
            )
        }
    }

    protected addDefinition(
        scope: LuaScope,
        id: string,
        expression: LuaExpression,
        index?: number,
    ) {
        let defs = this.definitions.get(id)
        if (!defs) {
            defs = []
            this.definitions.set(id, defs)
        }

        defs.push({
            expression,
            index,
            definingModule: this.currentModule,
            functionLevel: !scope.id.startsWith('@module'),
        })
    }

    protected addField(
        scope: LuaScope,
        id: string,
        field: string,
        rhs: LuaExpression,
        lhs?: LuaExpression,
        index?: number,
        instance?: boolean,
        fromLiteral?: boolean,
    ) {
        if (!id.startsWith('@table')) {
            return
        }

        const parentInfo = this.getTableInfo(id)

        // treat closure-based classes' non-function fields as instance fields
        if (parentInfo.isClosureClass) {
            instance = rhs.type !== 'literal' || rhs.luaType !== 'function'
        }

        // check for `:derive` calls in field setters
        if (lhs && rhs.type === 'operation') {
            rhs = this.classResolver.tryAddFromFieldCallAssignment(
                scope,
                lhs,
                rhs,
            )
        }

        const types = this.typeResolver.resolve({ expression: rhs })
        const tableId = types.size === 1 ? [...types][0] : undefined
        const fieldInfo = tableId?.startsWith('@table')
            ? this.getTableInfo(tableId)
            : undefined

        if (parentInfo.className) {
            // include partial reference for class with fields set
            scope.items.push({
                type: 'partial',
                seenClassId: id,
            })

            // mark the table as contained by the class
            if (fieldInfo) {
                fieldInfo.containerId ??= id
            }
        } else if (fieldInfo?.containerId) {
            scope.items.push({
                type: 'partial',
                seenClassId: fieldInfo.containerId,
            })
        } else if (parentInfo.containerId) {
            if (fieldInfo) {
                // bubble up container IDs
                fieldInfo.containerId = parentInfo.containerId
            }

            scope.items.push({
                type: 'partial',
                seenClassId: parentInfo.containerId,
            })
        }

        if (lhs?.type === 'member' || lhs?.type === 'index') {
            this.classResolver.addSeenClasses(scope, lhs.base)
        }

        let fieldDefs = parentInfo.definitions.get(field)
        if (!fieldDefs) {
            fieldDefs = []
            parentInfo.definitions.set(field, fieldDefs)
        }

        fieldDefs.push({
            expression: rhs,
            index,
            instance,
            fromLiteral,
            definingModule: this.currentModule,
            functionLevel: !scope.id.startsWith('@module'),
        })

        // created a class → done
        if (parentInfo.className || !parentInfo.containerId) {
            return
        }

        // function assignment to a non-class table within a class → create nested class
        const isFunctionAssignment =
            lhs &&
            (lhs.type === 'member' || lhs.type === 'index') &&
            rhs.type === 'literal' &&
            rhs.functionId

        if (!isFunctionAssignment) {
            return
        }

        const addedClass = this.classResolver.tryAddImpliedClass(
            scope,
            lhs.base,
            parentInfo,
        )

        if (!addedClass) {
            return
        }

        // extract the field name
        const endIdx = parentInfo.className.lastIndexOf('.')
        const targetName = this.getLiteralKey(
            parentInfo.className.slice(endIdx ? endIdx + 1 : 0),
        )

        // overwrite defs with reference to class
        const containerInfo = this.getTableInfo(parentInfo.containerId)
        if (!containerInfo.definitions.has(targetName)) {
            return
        }

        fieldDefs = []
        fieldDefs.push({
            expression: {
                type: 'literal',
                luaType: 'table',
                tableId: id,
            },
            definingModule: this.currentModule,
        })

        containerInfo.definitions.set(targetName, fieldDefs)
    }

    /**
     * Adds information about the usage of an expression.
     */
    protected addUsage(item: UsageItem) {
        let usageTypes = this.usageTypes.get(item.expression)
        if (!usageTypes) {
            usageTypes = new Set([
                'boolean',
                'function',
                'number',
                'string',
                'table',
            ])

            this.usageTypes.set(item.expression, usageTypes)
        }

        if (item.supportsConcatenation) {
            // string | number
            usageTypes.delete('boolean')
            usageTypes.delete('function')
            usageTypes.delete('table')
        }

        if (item.supportsIndexing || item.supportsLength) {
            // table | string
            usageTypes.delete('boolean')
            usageTypes.delete('function')
            usageTypes.delete('number')
        }

        if (item.supportsIndexAssignment) {
            // table
            usageTypes.delete('boolean')
            usageTypes.delete('function')
            usageTypes.delete('number')
            usageTypes.delete('string')
        }

        if (item.supportsMath || item.inNumericFor) {
            // number
            usageTypes.delete('boolean')
            usageTypes.delete('function')
            usageTypes.delete('string')
            usageTypes.delete('table')
        }

        // handle function argument analysis
        if (item.arguments === undefined) {
            return
        }

        // function
        usageTypes.delete('boolean')
        usageTypes.delete('number')
        usageTypes.delete('string')
        usageTypes.delete('table')

        const types = [
            ...this.typeResolver.resolve({ expression: item.expression }),
        ]

        const id = types[0]
        if (types.length !== 1 || !id.startsWith('@function')) {
            return
        }

        const funcInfo = this.getFunctionInfo(id)
        const parameterTypes = funcInfo.parameterTypes

        // add passed arguments to inferred parameter types
        for (let i = 0; i < item.arguments.length; i++) {
            parameterTypes[i] ??= new Set()
            this.typeResolver
                .resolve({ expression: item.arguments[i] })
                .forEach((x) => parameterTypes[i].add(x))
        }

        // if arguments aren't passed for a parameter, add nil
        for (let i = item.arguments.length; i < parameterTypes.length; i++) {
            parameterTypes[i] ??= new Set()
            parameterTypes[i].add('nil')
        }
    }

    protected remapBooleans(types: Set<string>) {
        const remapped = [...types].map((x) =>
            x === 'true' || x === 'false' ? 'boolean' : x,
        )

        types.clear()
        remapped.forEach((x) => types.add(x))

        return types
    }

    protected tryAddPartialItem(
        scope: LuaScope,
        item: AssignmentItem | RequireAssignmentItem | FunctionDefinitionItem,
        lhs: LuaReference,
        rhs: LuaExpression,
    ): string | undefined {
        // edge case: closure-based classes
        if (scope.type === 'function') {
            if (scope.localIdToName(lhs.id) !== scope.classSelfName) {
                return
            }

            // self = {} | Base.new() → use the generated table
            return scope.classTableId
        }

        // check module and module-level blocks, excluding functions
        if (!scope.id.startsWith('@module')) {
            return
        }

        // include requires as module fields
        if (item.type === 'requireAssignment') {
            scope.items.push({
                type: 'partial',
                requireInfo: {
                    name: lhs.id,
                    module: item.rhs.module,
                },
            })

            return
        }

        // global function definition
        if (item.type === 'functionDefinition') {
            // ignore local functions
            if (item.isLocal) {
                return
            }

            scope.items.push({
                type: 'partial',
                functionInfo: {
                    name: lhs.id,
                    functionId: item.id,
                },
            })

            return
        }

        // class definition
        const id = this.classResolver.tryAddPartial(scope, lhs, rhs)
        if (id) {
            return typeof id === 'string' ? id : undefined
        }

        // global function assignment
        const rhsTypes = [
            ...this.typeResolver.resolve({ expression: item.rhs }),
        ]

        if (rhsTypes.length !== 1) {
            return
        }

        const rhsType = rhsTypes[0]
        if (rhsType.startsWith('@function')) {
            scope.items.push({
                type: 'partial',
                functionInfo: {
                    name: lhs.id,
                    functionId: rhsType,
                },
            })
        }
    }
}

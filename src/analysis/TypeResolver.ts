import type ast from 'luaparse'
import { getLiteralKey } from '../helpers'
import { LuaScope } from '../scopes'
import { AnalysisContext } from './AnalysisContext'
import {
    AssignmentItem,
    FunctionDefinitionItem,
    FunctionInfo,
    LuaExpression,
    LuaExpressionInfo,
    LuaLiteral,
    LuaOperation,
    LuaReference,
    RequireAssignmentItem,
    ResolvedClassInfo,
    ResolvedFieldInfo,
    ResolvedFunctionInfo,
    ResolvedRequireInfo,
    ResolvedReturnInfo,
    ResolvedScopeItem,
    ReturnsItem,
    TableInfo,
    UsageItem,
} from './types'

const RGBA_NAMES = new Set(['r', 'g', 'b', 'a'])
const POS_SIZE_NAMES = new Set(['x', 'y', 'z', 'w', 'h', 'width', 'height'])
const DX_DY_NAMES = new Set(['dx', 'dy'])
const UNKNOWN_NAMES = /^(?:target|(?:param|arg)\d+)$/

/**
 * Handles resolution of Lua types.
 */
export class TypeResolver {
    protected context: AnalysisContext

    constructor(context: AnalysisContext) {
        this.context = context
    }

    /**
     * The class resolver on the context.
     */
    protected get classResolver() {
        return this.context.classResolver
    }

    /**
     * Applies heuristics to the parameters of a function.
     */
    applyParamNameHeuristics(info: FunctionInfo) {
        const checkNames = info.parameterNames.map((x) =>
            x.startsWith('_') ? x.slice(1) : x,
        )

        let dxDyCount = 0
        let posSizeCount = 0
        let rgbaCount = 0

        for (const name of checkNames) {
            if (DX_DY_NAMES.has(name)) {
                // both of dx, dy → assume number
                dxDyCount++
            } else if (POS_SIZE_NAMES.has(name)) {
                // 2+ of {x, y, z, w, h, width, height} → assume number
                posSizeCount++
            } else if (RGBA_NAMES.has(name)) {
                // 3+ of {r, g, b, a} → assume number
                rgbaCount++
            }
        }

        for (let i = 0; i < info.parameters.length; i++) {
            const name = checkNames[i]
            const assumeNum =
                (posSizeCount >= 2 && POS_SIZE_NAMES.has(name)) ||
                (rgbaCount >= 3 && RGBA_NAMES.has(name)) ||
                (dxDyCount >= 2 && DX_DY_NAMES.has(name))

            if (assumeNum) {
                info.parameterTypes[i] ??= new Set()
                info.parameterTypes[i].add('number')
                continue
            }

            // isX → boolean
            const third = name.slice(2, 3)
            if (name.startsWith('is') && third.toUpperCase() === third) {
                info.parameterTypes[i] ??= new Set()
                info.parameterTypes[i].add('boolean')
                continue
            }

            // avoid heuristics for doTitle
            const upper = name.toUpperCase()
            if (upper.startsWith('DO')) {
                continue
            }

            // starts or ends with num → assume number
            if (upper.startsWith('NUM') || upper.endsWith('NUM')) {
                info.parameterTypes[i] ??= new Set()
                info.parameterTypes[i].add('number')
                continue
            }

            // ends with name, title, or str → assume string
            if (
                upper.endsWith('STR') ||
                upper.endsWith('NAME') ||
                upper.endsWith('TITLE')
            ) {
                info.parameterTypes[i] ??= new Set()
                info.parameterTypes[i].add('string')
                continue
            }

            // target, paramN, argN → unknown
            if (UNKNOWN_NAMES.test(name)) {
                info.parameterTypes[i] ??= new Set()
                info.parameterTypes[i].add('unknown')
            }
        }
    }

    /**
     * Resolves the potential types of an expression.
     */
    resolve(
        info: LuaExpressionInfo,
        seen?: Map<LuaExpressionInfo, Set<string>>,
    ): Set<string> {
        seen ??= new Map()
        const types = new Set<string>()

        if (this.checkCycle(info, types, seen)) {
            return types
        }

        seen.set(info, new Set())

        const expression = info.expression
        let typesToAdd: Set<string>
        switch (expression.type) {
            case 'literal':
                typesToAdd = new Set()
                if (expression.literal === 'true') {
                    typesToAdd.add('true')
                } else if (expression.literal === 'false') {
                    typesToAdd.add('false')
                } else if (expression.tableId) {
                    typesToAdd.add(expression.tableId)
                } else if (expression.functionId) {
                    typesToAdd.add(expression.functionId)
                } else {
                    typesToAdd.add(expression.luaType)
                }

                break

            case 'operation':
                typesToAdd = this.resolveOperationTypes(
                    expression,
                    seen,
                    info.index,
                )

                break

            case 'reference':
                typesToAdd = new Set()
                const id = expression.id
                const isParam =
                    id.startsWith('@parameter') || id.startsWith('@self')

                // add IDs as types for later resolution
                if (
                    isParam ||
                    id.startsWith('@function') ||
                    id.startsWith('@instance')
                ) {
                    typesToAdd.add(id)
                }

                if (isParam) {
                    const funcId = this.context.getFunctionIdFromParamId(id)
                    if (!funcId) {
                        break
                    }

                    const funcInfo = this.context.getFunctionInfo(funcId)
                    for (let i = 0; i < funcInfo.parameters.length; i++) {
                        if (id !== funcInfo.parameters[i]) {
                            continue
                        }

                        funcInfo.parameterTypes[i]?.forEach((x) =>
                            typesToAdd.add(x),
                        )

                        break
                    }
                }

                for (const def of this.context.getDefinitions(id)) {
                    this.resolve(def, seen).forEach((x) => typesToAdd.add(x))
                }

                break

            case 'member':
                const memberBaseTypes = this.resolve(
                    { expression: expression.base, index: info.index },
                    seen,
                )

                typesToAdd = this.resolveFieldTypes(
                    memberBaseTypes,
                    expression.member,
                    false,
                    seen,
                )

                break

            case 'index':
                const indexBaseTypes = this.resolve(
                    { expression: expression.base, index: info.index },
                    seen,
                )

                const index = this.resolveToLiteral(expression.index, seen)

                if (!index || !index.literal) {
                    typesToAdd = new Set()
                    break
                }

                const key = getLiteralKey(index.literal, index.luaType)

                typesToAdd = this.resolveFieldTypes(
                    indexBaseTypes,
                    key,
                    true,
                    seen,
                )

                break

            case 'require':
                const mod = this.context.getModule(expression.module, true)
                if (!mod) {
                    typesToAdd = new Set()
                    break
                }

                const targetIdx = info.index ?? 1
                typesToAdd = mod.returns[targetIdx - 1]?.types ?? new Set()

                break
        }

        this.narrowTypes(expression, typesToAdd)

        typesToAdd.forEach((x) => types.add(x))
        seen.set(info, types)

        if (types.has('true') && types.has('false')) {
            types.delete('true')
            types.delete('false')
            types.add('boolean')
        }

        return types
    }

    /**
     * Adds an assignment to the list of definitions or fields.
     */
    resolveAssignment(
        scope: LuaScope,
        item: AssignmentItem | FunctionDefinitionItem | RequireAssignmentItem,
    ) {
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
                const indexBase = [...this.resolve({ expression: lhs.base })]

                if (indexBase.length !== 1) {
                    break
                }

                const resolved = this.resolveToLiteral(lhs.index)
                if (!resolved || !resolved.literal) {
                    break
                }

                const key = getLiteralKey(resolved.literal, resolved.luaType)

                this.addField(scope, indexBase[0], key, rhs, lhs, index)
                break

            case 'member':
                let isInstance = false
                const memberBase = [
                    ...this.resolve({ expression: lhs.base }),
                ].filter((x) => {
                    if (!x.startsWith('@self') && !x.startsWith('@instance')) {
                        return true
                    }

                    isInstance = true
                    return false
                })

                // method definition on unknown global → unknown class for base
                if (memberBase.length === 0) {
                    const id = this.classResolver.tryAddUnknownClass(
                        scope,
                        lhs,
                        item,
                    )

                    if (id) {
                        memberBase.push(id)
                    }
                }

                // no types or ambiguous type
                if (memberBase.length !== 1) {
                    break
                }

                // ignore __index in instances
                if (isInstance && lhs.member === '__index') {
                    break
                }

                // add original assignment name to tables
                if (rhs.type === 'literal' && rhs.tableId) {
                    const info = this.context.getTableInfo(rhs.tableId)
                    info.originalName ??= this.classResolver.getFieldClassName(
                        scope,
                        lhs,
                    )
                }

                const memberKey = getLiteralKey(lhs.member)
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

    resolveFunctionParams(
        scope: LuaScope,
        node: ast.FunctionDeclaration,
        info: FunctionInfo,
    ) {
        const identExpr = info.identifierExpression
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

        if (this.context.applyHeuristics) {
            this.applyParamNameHeuristics(info)
        }
    }

    resolveReturns(item: ReturnsItem | ResolvedScopeItem) {
        if (item.returns === undefined) {
            return
        }

        const funcInfo = this.context.getFunctionInfo(item.id)

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
                const funcReturns = this.resolveReturnTypes(ret)
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
            this.remapBooleans(this.resolve({ expression: ret })).forEach((x) =>
                funcInfo.returnTypes[i].add(x),
            )
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

    /**
     * Resolves the return types of a function operation.
     */
    resolveReturnTypes(
        op: LuaOperation,
        seen?: Map<LuaExpressionInfo, Set<string>>,
    ): Set<string>[] | undefined {
        const func = op.arguments[0]
        if (!func) {
            return
        }

        const types: Set<string>[] = []
        const knownTypes = new Set<string>()
        if (this.addKnownReturns(func, knownTypes)) {
            types.push(knownTypes)
            return types
        }

        const resolvedFuncTypes = this.resolve({ expression: func }, seen)
        if (!resolvedFuncTypes || resolvedFuncTypes.size !== 1) {
            return
        }

        const resolvedFunc = [...resolvedFuncTypes][0]
        if (!resolvedFunc.startsWith('@function')) {
            return
        }

        // handle constructors
        const funcInfo = this.context.getFunctionInfo(resolvedFunc)
        if (funcInfo.isConstructor) {
            types.push(new Set())
            types[0].add('@instance') // mark as an instance to correctly attribute fields
            funcInfo.returnTypes[0]?.forEach((x) => types[0].add(x))
            return types
        }

        for (let i = 0; i < funcInfo.returnTypes.length; i++) {
            types.push(new Set(funcInfo.returnTypes[i]))
        }

        return types
    }

    /**
     * Resolves the types of the analysis items for a module.
     */
    resolveScope(scope: LuaScope): ResolvedScopeItem {
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
                        const info = this.context.getTableInfo(
                            item.classInfo.tableId,
                        )

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
            const funcInfo = this.context.getFunctionInfo(scope.id)
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

                const info = this.context.getTableInfo(id)
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

    /**
     * Modifies types based on a setmetatable call.
     */
    resolveSetMetatable(
        scope: LuaScope,
        lhs: LuaExpression,
        meta: LuaExpression,
    ) {
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
        const metaTypes = [...this.resolve({ expression: meta })].filter(
            (x) => !x.startsWith('@self'),
        )

        const resolvedMeta = metaTypes[0]
        if (metaTypes.length !== 1 || !resolvedMeta.startsWith('@table')) {
            return
        }

        // check that metatable is a class
        const metaInfo = this.context.getTableInfo(resolvedMeta)
        if (!metaInfo.className && !metaInfo.fromHiddenClass) {
            return
        }

        // get lhs types
        const lhsTypes = [...this.resolve({ expression: lhs })].filter(
            (x) => x !== '@instance',
        )

        if (lhsTypes.find((x) => !x.startsWith('@table'))) {
            // non-table lhs → don't treat as instance
            return
        }

        for (const resolvedLhs of lhsTypes) {
            const lhsInfo = this.context.getTableInfo(resolvedLhs)
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
                        definingModule: this.context.currentModule,
                        functionLevel: !scope.id.startsWith('@module'),
                    })
                }
            })
        }

        // mark lhs as class instance
        const newId = scope.addInstance(name)
        this.context.definitions.set(newId, [
            {
                expression: {
                    type: 'literal',
                    luaType: 'table',
                    tableId: resolvedMeta,
                },
            },
        ])
    }

    resolveTableLiteralFields(scope: LuaScope, tableInfo: TableInfo) {
        const tableId = tableInfo.id
        const fields = tableInfo.literalFields

        for (const field of fields) {
            const key = field.key

            let literalKey: string | undefined
            switch (key.type) {
                case 'string':
                    literalKey = getLiteralKey(key.name)
                    break

                case 'literal':
                    literalKey = getLiteralKey(key.literal, key.luaType)

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

    /**
     * Resolves an expression into a basic literal, if it can be determined
     * to be resolvable to one.
     */
    resolveToLiteral(
        expression: LuaExpression,
        seen?: Map<LuaExpressionInfo, Set<string>>,
    ): LuaLiteral | undefined {
        const stack: LuaExpressionInfo[] = []

        stack.push({ expression })

        while (stack.length > 0) {
            const info = stack.pop()!
            const expr = info.expression

            let key: string
            let tableInfo: TableInfo
            let fieldDefs: LuaExpressionInfo[] | undefined
            switch (expr.type) {
                case 'literal':
                    if (
                        expr.luaType !== 'table' &&
                        expr.luaType !== 'function'
                    ) {
                        return expr
                    }

                    return

                case 'reference':
                    fieldDefs = this.context.getDefinitions(expr.id)
                    if (fieldDefs.length === 1) {
                        stack.push(fieldDefs[0])
                    }

                    break

                case 'member':
                    const memberBase = [
                        ...this.resolve({ expression: expr.base }),
                    ]

                    if (memberBase.length !== 1) {
                        break
                    }

                    tableInfo = this.context.getTableInfo(memberBase[0])
                    key = getLiteralKey(expr.member)
                    fieldDefs = tableInfo.definitions.get(key) ?? []

                    if (fieldDefs.length === 1) {
                        stack.push(fieldDefs[0])
                    }

                    break

                case 'index':
                    const indexBase = [
                        ...this.resolve({ expression: expr.base }),
                    ]

                    if (indexBase.length !== 1) {
                        break
                    }

                    const index = this.resolveToLiteral(expr.index, seen)

                    if (!index || !index.literal) {
                        break
                    }

                    tableInfo = this.context.getTableInfo(indexBase[0])
                    key = getLiteralKey(index.literal, index.luaType)

                    fieldDefs = tableInfo.definitions.get(key) ?? []

                    if (fieldDefs.length === 1) {
                        stack.push(fieldDefs[0])
                    }

                    break

                case 'operation':
                    const types = [...this.resolve({ expression: expr }, seen)]

                    if (types.length !== 1) {
                        break
                    }

                    // only resolve known booleans
                    if (types[0] === 'true' || types[0] === 'false') {
                        return {
                            type: 'literal',
                            luaType: 'boolean',
                            literal: types[0],
                        }
                    }

                    break
            }
        }
    }

    protected addDefinition(
        scope: LuaScope,
        id: string,
        expression: LuaExpression,
        index?: number,
    ) {
        let defs = this.context.definitions.get(id)
        if (!defs) {
            defs = []
            this.context.definitions.set(id, defs)
        }

        defs.push({
            expression,
            index,
            definingModule: this.context.currentModule,
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

        const parentInfo = this.context.getTableInfo(id)

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

        const types = this.resolve({ expression: rhs })
        const tableId = types.size === 1 ? [...types][0] : undefined
        const fieldInfo = tableId?.startsWith('@table')
            ? this.context.getTableInfo(tableId)
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
            definingModule: this.context.currentModule,
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
        const targetName = getLiteralKey(
            parentInfo.className.slice(endIdx ? endIdx + 1 : 0),
        )

        // overwrite defs with reference to class
        const containerInfo = this.context.getTableInfo(parentInfo.containerId)
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
            definingModule: this.context.currentModule,
        })

        containerInfo.definitions.set(targetName, fieldDefs)
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
        const rhsTypes = [...this.resolve({ expression: item.rhs })]

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

    /**
     * Adds known return types based on function names.
     */
    protected addKnownReturns(
        expr: LuaExpression,
        types: Set<string>,
    ): boolean {
        if (expr.type !== 'reference') {
            return false
        }

        const name = expr.id
        switch (name) {
            case 'tonumber':
                types.add('number')
                types.add('nil')
                return true

            case 'getTextOrNull':
                types.add('string')
                types.add('nil')
                return true

            case 'tostring':
            case 'getText':
                types.add('string')
                return true
        }

        return false
    }

    /**
     * Adds information about the usage of an expression.
     */
    protected addUsage(item: UsageItem) {
        let usageTypes = this.context.usageTypes.get(item.expression)
        if (!usageTypes) {
            usageTypes = new Set([
                'boolean',
                'function',
                'number',
                'string',
                'table',
            ])

            this.context.usageTypes.set(item.expression, usageTypes)
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

        const types = [...this.resolve({ expression: item.expression })]

        const id = types[0]
        if (types.length !== 1 || !id.startsWith('@function')) {
            return
        }

        const funcInfo = this.context.getFunctionInfo(id)
        const parameterTypes = funcInfo.parameterTypes

        // add passed arguments to inferred parameter types
        for (let i = 0; i < item.arguments.length; i++) {
            parameterTypes[i] ??= new Set()
            this.resolve({ expression: item.arguments[i] }).forEach((x) =>
                parameterTypes[i].add(x),
            )
        }

        // if arguments aren't passed for a parameter, add nil
        for (let i = item.arguments.length; i < parameterTypes.length; i++) {
            parameterTypes[i] ??= new Set()
            parameterTypes[i].add('nil')
        }
    }

    /**
     * Checks whether the given expression has already been seen.
     * This will attempt to use known types, and will otherwise add `unknown`.
     */
    protected checkCycle(
        info: LuaExpressionInfo,
        types: Set<string>,
        seen: Map<LuaExpressionInfo, Set<string>>,
    ): boolean {
        const existing = seen.get(info)
        if (!existing) {
            return false
        }

        existing.forEach((x) => types.add(x))
        return true
    }

    /**
     * Gets the truthiness of a set of types.
     * If the truth cannot be determined, returns `undefined`
     */
    protected getTruthiness(types: Set<string>): boolean | undefined {
        let hasTruthy = false
        let hasFalsy = false

        for (const type of types) {
            if (type === 'boolean') {
                // can't determine truthiness of `boolean`
                hasTruthy = true
                hasFalsy = true
                break
            }

            if (type === 'false' || type === 'nil') {
                hasFalsy = true
            } else {
                hasTruthy = true
            }
        }

        if (hasTruthy === hasFalsy) {
            return
        } else {
            return hasTruthy
        }
    }

    /**
     * Gets the types determined based on usage for an expression.
     * Returns undefined if types couldn't be determined.
     */
    protected getUsageTypes(expr: LuaExpression): Set<string> | undefined {
        const types = this.context.usageTypes.get(expr)
        if (!types || types.size === 0 || types.size === 5) {
            return
        }

        return types
    }

    /**
     * Checks whether an expression is a literal or an
     * operation containing only literals.
     */
    protected isLiteralOperation(expr: LuaExpression) {
        if (expr.type === 'literal') {
            return true
        }

        const stack: LuaExpression[] = [expr]
        while (stack.length > 0) {
            const expression = stack.pop()!

            if (expression.type === 'operation') {
                if (expression.operator === 'call') {
                    return false
                }

                expression.arguments.forEach((x) => stack.push(x))
            } else if (expression.type !== 'literal') {
                return false
            }
        }

        return true
    }

    /**
     * Narrows possible expression types based on usage.
     */
    protected narrowTypes(expr: LuaExpression, types: Set<string>) {
        if (types.size <= 1) {
            // no narrowing necessary
            return
        }

        const usage = this.getUsageTypes(expr)
        if (!usage) {
            // no narrowing is possible
            return
        }

        // filter possible types to narrowed types
        const narrowed = [...types].filter((type) => {
            if (type.startsWith('@function') && usage.has('function')) {
                return true
            } else if (type.startsWith('@table') && usage.has('table')) {
                return true
            }

            return usage.has(type)
        })

        if (narrowed.length === 0) {
            // oops, too much narrowing
            return
        }

        types.clear()
        narrowed.forEach((x) => types.add(x))
    }

    protected remapBooleans(types: Set<string>) {
        const remapped = [...types].map((x) =>
            x === 'true' || x === 'false' ? 'boolean' : x,
        )

        types.clear()
        remapped.forEach((x) => types.add(x))

        return types
    }

    /**
     * Resolves the possible types of a table field.
     * @param types The set of types for the base.
     * @param scope The relevant scope.
     * @param field A string representing the field.
     * @param isIndex Whether this is an index operation. If it is, `field` will be interpreted as a literal key.
     */
    protected resolveFieldTypes(
        types: Set<string>,
        field: string,
        isIndex: boolean = false,
        seen?: Map<LuaExpressionInfo, Set<string>>,
    ): Set<string> {
        const fieldTypes = new Set<string>()
        if (types.size === 0) {
            return fieldTypes
        }

        for (const type of types) {
            if (!type.startsWith('@table')) {
                continue
            }

            const info = this.context.getTableInfo(type)
            const literalKey = isIndex ? field : getLiteralKey(field)

            const fieldDefs = info.definitions.get(literalKey) ?? []

            for (const def of fieldDefs) {
                this.resolve(def, seen).forEach((x) => fieldTypes.add(x))
            }
        }

        return fieldTypes
    }

    /**
     * Resolves the possible types for the result of an operation.
     * @param op The operation expression.
     * @param scope The relevant scope.
     * @param index For call operations, this is used to determine which return type to use.
     */
    protected resolveOperationTypes(
        op: LuaOperation,
        seen?: Map<LuaExpressionInfo, Set<string>>,
        index: number = 1,
    ): Set<string> {
        const types = new Set<string>()

        let lhs: LuaExpression | undefined
        let rhs: LuaExpression | undefined
        let lhsTypes: Set<string> | undefined
        let rhsTypes: Set<string> | undefined
        let lhsTruthy: boolean | undefined

        switch (op.operator) {
            case 'call':
                const returnTypes = this.resolveReturnTypes(op, seen)
                if (returnTypes === undefined) {
                    break
                }

                const returns = returnTypes[index - 1]
                if (!returns) {
                    types.add('nil')
                    break
                }

                returns.forEach((x) => types.add(x))
                break

            case '..':
                types.add('string')
                break

            case '~=':
            case '==':
            case '<':
            case '<=':
            case '>':
            case '>=':
                types.add('boolean')
                break

            case '+':
            case '-':
            case '*':
            case '%':
            case '^':
            case '/':
            case '//':
            case '&':
            case '|':
            case '~':
            case '<<':
            case '>>':
            case '#':
                types.add('number')
                break

            case 'not':
                const argTypes = this.resolve(
                    { expression: op.arguments[0] },
                    seen,
                )

                const truthy = this.isLiteralOperation(op.arguments[0])
                    ? this.getTruthiness(argTypes)
                    : undefined

                if (truthy === undefined) {
                    // can't determine truthiness; use boolean
                    types.add('boolean')
                    break
                } else {
                    types.add(truthy ? 'false' : 'true')
                    break
                }

            case 'or':
                lhs = op.arguments[0]
                rhs = op.arguments[1]

                lhsTypes = this.resolve({ expression: lhs }, seen)
                rhsTypes = this.resolve({ expression: rhs }, seen)

                // X and Y or Z → use Y & Z (ternary special case)
                if (lhs.type === 'operation' && lhs.operator === 'and') {
                    lhsTypes = this.resolve(
                        { expression: lhs.arguments[1] },
                        seen,
                    )
                }

                lhsTruthy = this.isLiteralOperation(lhs)
                    ? this.getTruthiness(lhsTypes)
                    : undefined

                rhsTypes.forEach((x) => types.add(x))

                // lhs falsy → use only rhs types
                if (lhsTruthy === false) {
                    break
                }

                // lhs truthy or undetermined → use both
                lhsTypes.forEach((x) => types.add(x))
                break

            case 'and':
                lhs = op.arguments[0]
                rhs = op.arguments[1]

                lhsTypes = this.resolve({ expression: lhs }, seen)
                rhsTypes = this.resolve({ expression: rhs }, seen)

                lhsTruthy = this.isLiteralOperation(lhs)
                    ? this.getTruthiness(lhsTypes)
                    : undefined

                if (lhsTruthy === true) {
                    // lhs truthy → use rhs types
                    rhsTypes.forEach((x) => types.add(x))
                } else if (lhsTruthy === false) {
                    // lhs falsy → use lhs types
                    lhsTypes.forEach((x) => types.add(x))
                } else {
                    // undetermined → use both
                    lhsTypes.forEach((x) => types.add(x))
                    rhsTypes.forEach((x) => types.add(x))
                }

                break
        }

        return types
    }
}

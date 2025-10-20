import type ast from 'luaparse'
import { getLuaFieldKey, readLuaStringLiteral } from '../helpers'
import { LuaScope } from '../scopes'
import { AnalysisContext } from './AnalysisContext'
import {
    FunctionInfo,
    LuaExpression,
    LuaMember,
    LuaReference,
    TableInfo,
    TableInfoWithClass,
} from './types'

/**
 * Handles finding and creating class types.
 */
export class ClassResolver {
    /**
     * The shared analysis context.
     */
    protected context: AnalysisContext

    /**
     * Creates a class resolver.
     * @param context The analysis context.
     */
    constructor(context: AnalysisContext) {
        this.context = context
    }

    /**
     * The type resolver on the context.
     */
    protected get typeResolver() {
        return this.context.typeResolver
    }

    /**
     * Adds partial items for classes referenced in an expression.
     * @param scope The current scope.
     * @param expression The expression to check.
     */
    addSeenClasses(scope: LuaScope, expression: LuaExpression) {
        switch (expression.type) {
            case 'literal':
            case 'operation':
            case 'require':
                return

            case 'index':
            case 'member':
                this.addSeenClasses(scope, expression.base)
                return
        }

        const types = this.typeResolver.resolve({ expression })
        if (types.size !== 1) {
            return
        }

        const resolved = [...types][0]
        if (!resolved.startsWith('@table')) {
            return
        }

        const info = this.context.getTableInfo(resolved)
        if (info.className) {
            scope.items.push({
                type: 'partial',
                seenClassId: resolved,
            })
        }
    }

    /**
     * Determines the class name to use based on a field assignment lhs expression.
     * For member expressions, this will create a class name in the format `X.Y.Z`.
     * For references, it will use the variable name (local or global).
     *
     * If the expression is neither a reference nor a member expression, or contains expressions that are neither
     * of those, this will return `undefined`.
     *
     * @param scope The current scope.
     * @param expr The expression to extract a name from.
     * @return The name to use for the class.
     */
    getFieldClassName(
        scope: LuaScope,
        expr: LuaExpression,
    ): string | undefined {
        if (expr.type !== 'member') {
            return
        }

        const names: string[] = [expr.member]

        while (expr.type === 'member') {
            const parent: LuaExpression = expr.base
            if (parent.type === 'reference') {
                names.push(scope.getName(parent.id))
                break
            } else if (parent.type !== 'member') {
                return
            }

            names.push(parent.member)
            expr = parent
        }

        return names.reverse().join('.')
    }

    /**
     * Attempts to create a partial class from an assignment of a call result to a field.
     * This handles `:derive` and UI nodes.
     * @param scope The current scope.
     * @param lhs The left side of the assignment.
     * @param rhs The right side of the assignment.
     * @returns The expression to use for analysis of the RHS of the assignment.
     */
    tryAddFromFieldCallAssignment(
        scope: LuaScope,
        lhs: LuaExpression,
        rhs: LuaExpression,
    ): LuaExpression {
        // check for `:derive` calls
        const [base, deriveName] = this.findDerive(rhs) ?? []
        const name = base && this.getFieldClassName(scope, lhs)
        if (base && name) {
            const newId = this.context.newTableId()
            const newInfo = this.context.getTableInfo(newId)
            newInfo.className = name
            newInfo.isLocalClass = true

            scope.items.push({
                type: 'partial',
                classInfo: {
                    name,
                    tableId: newId,
                    base,
                    deriveName,
                    generated: true,
                    definingModule: this.context.currentModule,
                },
            })

            return {
                type: 'literal',
                luaType: 'table',
                tableId: newId,
            }
        }

        // check for base `UI.Node` initialization
        const baseUiRhs = this.tryAddUIBaseNode(scope, lhs, rhs)
        if (baseUiRhs) {
            return baseUiRhs
        }

        // check for child UI node initialization
        const childUiRhs = this.tryAddUIChildNode(scope, lhs, rhs)
        if (childUiRhs) {
            return childUiRhs
        }

        return rhs
    }

    /**
     * Attempts to create a class from a function definition on a table.
     * This includes closure-based classes and classes implied from the existence of a `:new` method.
     * @param scope The current scope.
     * @param node The method node.
     * @param info Analysis information for the method.
     * @param identExpr Information about the method identifier.
     */
    tryAddFromFunctionDefinition(
        scope: LuaScope,
        node: ast.FunctionDeclaration,
        info: FunctionInfo,
        identExpr: LuaMember,
    ) {
        // check for closure-based class first
        const addedClosureClass = this.tryAddClosureClass(
            scope,
            node,
            info,
            identExpr,
        )

        if (!addedClosureClass) {
            this.tryAddImpliedFromMethod(scope, info, identExpr)
        }
    }

    /**
     * Attempts to add a class definition that should exist based on the context.
     * @param scope The current scope.
     * @param base The expression to use to determine the class name.
     * @param tableInfo The table to add the class to.
     * @returns Flag representing whether a class was added.
     */
    tryAddImpliedClass(
        scope: LuaScope,
        base: LuaExpression,
        tableInfo: TableInfo,
    ): tableInfo is TableInfoWithClass {
        let name: string | undefined
        let isLocal = false

        // determine a class name & whether the class should be generated as a local class
        switch (base.type) {
            case 'reference':
                const localName = scope.localIdToName(base.id)
                name = tableInfo.originalName ?? localName ?? base.id

                isLocal =
                    tableInfo.originalName !== undefined ||
                    localName !== undefined

                break

            case 'member':
                name =
                    tableInfo.originalName ??
                    this.getFieldClassName(scope, base)

                isLocal = true
                break
        }

        if (!name) {
            return false
        }

        tableInfo.className = name
        tableInfo.isLocalClass = isLocal
        tableInfo.definingModule ??= this.context.currentModule
        scope.items.push({
            type: 'partial',
            classInfo: {
                name,
                tableId: tableInfo.id,
                generated: isLocal,
                definingModule: tableInfo.definingModule,
            },
        })

        return true
    }

    /**
     * Attempts to add a partial item for a class or field based on an assignment.
     * @param scope The current scope.
     * @param lhs The left side of the assignment.
     * @param rhs The right side of the assignment.
     * @returns Returns a string class ID if a class was added.
     * Otherwise, returns a boolean representing whether a partial of a different type was added.
     */
    tryAddPartial(
        scope: LuaScope,
        lhs: LuaReference,
        rhs: LuaExpression,
    ): string | boolean {
        const [base, deriveName] = this.findDerive(rhs) ?? []

        // check for local class
        if (lhs.id.startsWith('@')) {
            // if there's a derive call, return a table so fields aren't misattributed
            if (base) {
                const newId = this.context.newTableId()
                const info = this.context.getTableInfo(newId)
                info.fromHiddenClass = true
                info.originalBase = base
                info.originalDeriveName = deriveName

                return newId
            }

            // ignore local classes otherwise
            return true
        }

        const tableId = !base
            ? this.findClassTable(rhs)
            : this.context.newTableId()

        if (!tableId) {
            return false
        }

        // global table or derive call → class
        const tableInfo = this.context.getTableInfo(tableId)

        // assignment to existing class table → add a field instead
        if (
            tableInfo.className &&
            !tableInfo.isEmptyClass &&
            rhs.type !== 'literal' &&
            rhs.type !== 'operation'
        ) {
            scope.items.push({
                type: 'partial',
                fieldInfo: {
                    name: lhs.id,
                    types: new Set([tableInfo.className]),
                },
            })

            return true
        }

        tableInfo.className ??= lhs.id
        tableInfo.definingModule ??= this.context.currentModule

        this.removeEmptyDefinition(lhs.id)

        scope.items.push({
            type: 'partial',
            classInfo: {
                name: lhs.id,
                tableId,
                definingModule: tableInfo.definingModule,
                base: base ?? tableInfo.originalBase,
                deriveName: deriveName ?? tableInfo.originalDeriveName,
            },
        })

        return tableId
    }

    /**
     * Adds an Atom UI class definition.
     * @param scope The current scope.
     * @param name The class name.
     * @param tableInfo The argument table for the node.
     * @param base The name of the base UI node class.
     * @returns The table info for the created class.
     */
    protected addAtomUIClass(
        scope: LuaScope,
        name: string,
        tableInfo: TableInfo,
        base?: string,
    ): TableInfoWithClass {
        const tableId = this.context.newTableId()
        const info = this.context.getTableInfo(tableId)
        info.className = name
        info.isAtomUI = true
        info.isLocalClass = true

        for (const [field, defs] of tableInfo.definitions) {
            info.definitions.set(field, defs)

            if (defs.length !== 1) {
                continue
            }

            // functions with self → methods
            const def = defs[0]
            const expr = def.expression
            if (expr.type !== 'literal' || !expr.functionId) {
                continue
            }

            const funcInfo = this.context.getFunctionInfo(expr.functionId)
            if (funcInfo.parameterNames[0] !== 'self') {
                continue
            }

            funcInfo.identifierExpression = {
                type: 'member',
                base: { type: 'reference', id: '@generated' },
                member: getLuaFieldKey(field),
                indexer: ':',
            }
        }

        scope.items.push({
            type: 'partial',
            classInfo: {
                name,
                tableId,
                base,
                generated: true,
                definingModule: this.context.currentModule,
            },
        })

        return info as TableInfoWithClass
    }

    /**
     * Matches an expression to determine whether it should be used to declare a class.
     * @param expr The expression to check.
     * @returns A table ID to use for a class.
     */
    protected findClassTable(expr: LuaExpression): string | undefined {
        // don't declare classes from calls (`:derive` is handled in `tryAddFromFieldCallAssignment`)
        if (expr.type === 'operation' && expr.operator === 'call') {
            return
        }

        // X = X or {} → treat as X
        if (expr.type === 'operation' && expr.operator === 'or') {
            const orLhs = expr.arguments[0]
            const orRhs = expr.arguments[1]
            const orRhsFields = (orRhs.type === 'literal' && orRhs.fields) || []

            if (orLhs.type === 'reference' && orRhsFields.length === 0) {
                const result = this.findClassTable(orLhs)
                if (result) {
                    return result
                }
            }
        }

        const typeSet = this.typeResolver.resolve({ expression: expr })

        // expect unambiguous type
        if (typeSet.size !== 1) {
            return
        }

        // expect table
        const tableId = [...typeSet][0]
        if (!tableId.startsWith('@table')) {
            return
        }

        return tableId
    }

    /**
     * Matches an expression against a `:derive` call.
     * @returns The reference ID and the string literal type passed to the derive call.
     */
    protected findDerive(expr: LuaExpression): [string, string] | undefined {
        if (expr.type !== 'operation' || expr.operator !== 'call') {
            return
        }

        // expect single argument (base + arg count)
        if (expr.arguments.length !== 2) {
            return
        }

        // expect string
        const arg = expr.arguments[1]
        if (arg.type !== 'literal' || arg.luaType !== 'string') {
            return
        }

        const type = readLuaStringLiteral(arg.literal ?? '')
        if (!type) {
            return
        }

        // expect X:Y(...)
        const callBase = expr.arguments[0]
        if (callBase?.type !== 'member' || callBase.indexer !== ':') {
            return
        }

        // expect X:derive(...)
        if (callBase.member !== 'derive') {
            return
        }

        // expect base:derive(...)
        const base = callBase.base
        if (base.type !== 'reference') {
            return
        }

        let id = base.id

        // resolve local variables for global classes
        if (id.startsWith('@')) {
            const types = this.typeResolver.resolve({
                expression: base,
            })
            const resolved = [...types][0]
            if (types.size !== 1 || !resolved.startsWith('@table')) {
                return
            }

            const tableInfo = this.context.getTableInfo(resolved)
            if (!tableInfo.className) {
                return
            }

            id = tableInfo.className
        }

        // found derive; return base class name
        return [id, type]
    }

    /**
     * Searches a function body for a `setmetatable` call with a table that includes an `__index` field.
     * This is used to avoid adding closure-based classes where they shouldn't be added.
     * @returns Flag for whether a matching call was found.
     */
    protected findSetIndexedMetatable(node: ast.FunctionDeclaration) {
        for (const child of node.body) {
            // check for a setmetatable call
            if (child.type !== 'CallStatement') {
                continue
            }

            if (child.expression.type !== 'CallExpression') {
                continue
            }

            const base = child.expression.base
            if (base.type !== 'Identifier' || base.name !== 'setmetatable') {
                continue
            }

            // check for a metatable
            const meta = child.expression.arguments[1]
            if (!meta) {
                continue
            }

            // identifier → using table as index
            if (meta.type === 'Identifier') {
                return true
            }

            if (meta.type !== 'TableConstructorExpression') {
                continue
            }

            // table → check for an __index field
            for (const field of meta.fields) {
                if (field.type !== 'TableKeyString') {
                    continue
                }

                if (field.key.name === '__index') {
                    return true
                }
            }
        }

        return false
    }

    /**
     * Matches against a function definition to determine whether it's a closure-based class.
     * @param scope The current scope.
     * @param node The function to search.
     * @param info Analysis information about the function.
     * @param identExpr The function identifier.
     * @returns A flag representing whether a class was added.
     */
    protected tryAddClosureClass(
        scope: LuaScope,
        node: ast.FunctionDeclaration,
        info: FunctionInfo,
        identExpr: LuaMember,
    ): boolean {
        const base = identExpr.base
        if (base.type !== 'reference') {
            return false
        }

        // setmetatable instances should be handled elsewhere
        if (this.findSetIndexedMetatable(node)) {
            return false
        }

        // all closure-based classes set a local `self` or `publ`
        // this will be either a table or a call to the base class `.new`
        let classTable: ast.TableConstructorExpression | undefined
        let baseClass: string | undefined
        let selfName = 'self'
        for (const child of node.body) {
            // local self/publ = ...
            if (child.type !== 'LocalStatement') {
                continue
            }

            const name = child.variables[0]?.name
            if (name !== 'self' && name !== 'publ') {
                continue
            }

            // local self/publ = {}
            const init = child.init[0]
            if (init.type === 'TableConstructorExpression') {
                classTable = init
                selfName = name
                break
            }

            // no closure-based classes are defined as local publ = X.new(...)
            if (name === 'publ') {
                continue
            }

            // local self = X.new()
            const base = init.type === 'CallExpression' ? init.base : undefined

            if (base?.type !== 'MemberExpression') {
                continue
            }

            if (base.identifier.name !== 'new') {
                continue
            }

            const memberBase = base.base
            if (memberBase.type !== 'Identifier') {
                continue
            }

            selfName = name
            baseClass = memberBase.name
            break
        }

        if (!baseClass && !classTable) {
            return false
        }

        // require at least one `self.X` function to identify it as a closure-based class
        const foundFunction = node.body.find((child) => {
            if (child.type !== 'FunctionDeclaration') {
                return
            }

            if (child.identifier?.type !== 'MemberExpression') {
                return
            }

            const base = child.identifier.base
            if (base.type !== 'Identifier') {
                return
            }

            return base.name === selfName
        })

        if (!foundFunction) {
            return false
        }

        const tableId = classTable
            ? this.context.getTableId(classTable)
            : this.context.newTableId()

        const tableInfo = this.context.getTableInfo(tableId)
        if (tableInfo.className) {
            // already has a class
            return false
        }

        let name: string
        const memberName = identExpr.member
        if (memberName === 'new' || memberName === 'getInstance') {
            name = scope.localIdToName(base.id) ?? base.id

            // name collision → don't emit a class annotation for the container
            const types = this.typeResolver.resolve({
                expression: base,
            })

            const resolved = [...types][0]
            if (types.size === 1 && resolved.startsWith('@table')) {
                const containerInfo = this.context.getTableInfo(resolved)
                if (containerInfo.className === name) {
                    containerInfo.emitAsTable = true
                }
            }
        } else {
            const lastSlash = this.context.currentModule.lastIndexOf('/')
            name = this.context.currentModule.slice(lastSlash + 1)
        }

        tableInfo.className = name
        tableInfo.isClosureClass = true
        tableInfo.isLocalClass = true
        scope.items.push({
            type: 'partial',
            classInfo: {
                name,
                tableId,
                definingModule: this.context.currentModule,
                base: baseClass,
                generated: true,
            },
        })

        scope.classSelfName = selfName
        if (!classTable) {
            // to identify the table when it's being defined
            scope.classTableId = tableId
        }

        // mark the instance in the base class
        const resolvedBaseTypes = [
            ...this.typeResolver.resolve({
                expression: base,
            }),
        ]

        const resolvedBase =
            resolvedBaseTypes.length === 1 ? resolvedBaseTypes[0] : undefined

        if (resolvedBase?.startsWith('@table')) {
            const baseTableInfo = this.context.getTableInfo(resolvedBase)
            if (baseTableInfo.className) {
                baseTableInfo.instanceName = name
                baseTableInfo.instanceId = tableId
            }
        }

        if (identExpr.indexer === ':') {
            info.parameterTypes.push(
                this.typeResolver.resolve({ expression: base }),
            )
        }

        info.returnTypes.push(new Set([tableId]))
        info.isConstructor = true
        return true
    }

    /**
     * Matches on a `:new` method & adds an implied class if found.
     * @param scope The current scope.
     * @param info Information about the method.
     * @param identExpr The identifier for the method name.
     */
    protected tryAddImpliedFromMethod(
        scope: LuaScope,
        info: FunctionInfo,
        identExpr: LuaMember,
    ) {
        // verify that this is a method
        if (identExpr.indexer !== ':') {
            return
        }

        // find the base type & fetch its table info
        const base = identExpr.base
        const types = this.typeResolver.resolve({ expression: base })
        if (types.size !== 1) {
            return
        }

        const tableId = [...types][0]
        const tableInfo = tableId.startsWith('@table')
            ? this.context.getTableInfo(tableId)
            : undefined

        // add self type
        if (info.parameterTypes.length === 0) {
            info.parameterTypes.push(types)
        }

        // `:new` method without class → create class
        if (identExpr.member !== 'new') {
            return
        }

        info.returnTypes.push(new Set(types)) // assume Class:new(...) returns Class
        info.isConstructor = true

        if (tableInfo && !tableInfo.className && !tableInfo.fromHiddenClass) {
            this.tryAddImpliedClass(scope, base, tableInfo)
        }
    }

    /**
     * Matches an assignment against a definition of the base level UI node class (i.e., `UI.Node`).
     * Creates an Atom UI class if successful.
     *
     * @param scope The current scope.
     * @param lhs The left side of the assignment.
     * @param rhs The right side of the assignment.
     * @returns A literal table expression representing the created class.
     */
    protected tryAddUIBaseNode(
        scope: LuaScope,
        lhs: LuaExpression,
        rhs: LuaExpression,
    ): LuaExpression | undefined {
        const name = this.getFieldClassName(scope, lhs)
        if (!name) {
            return
        }

        if (rhs.type !== 'operation' || rhs.operator !== 'call') {
            return
        }

        // A(X)
        if (rhs.arguments.length !== 2) {
            return
        }

        // A.__call(X)
        const callBase = rhs.arguments[0]
        if (callBase.type !== 'member' || callBase.member !== '__call') {
            return
        }

        // A.__call({ ... })
        const callArg = rhs.arguments[1]
        if (callArg.type !== 'literal' || !callArg.tableId) {
            return
        }

        // A.__call({ _ATOM_UI_CLASS = X, ... })
        const argInfo = this.context.getTableInfo(callArg.tableId)
        const atomField = argInfo.literalFields.find(
            (x) => x.key.type === 'string' && x.key.name === '_ATOM_UI_CLASS',
        )

        if (!atomField || atomField.value.type !== 'reference') {
            return
        }

        const info = this.addAtomUIClass(scope, name, argInfo)
        info.isAtomUIBase = true

        return {
            type: 'literal',
            luaType: 'table',
            tableId: info.id,
        }
    }

    /**
     * Matches an assignment against a definition of a UI node.
     * Creates an Atom UI class if successful.
     * @param scope The current scope.
     * @param lhs The left side of the assignment.
     * @param rhs The right side of the assignment.
     * @returns A literal table expression representing the created class.
     */
    protected tryAddUIChildNode(
        scope: LuaScope,
        lhs: LuaExpression,
        rhs: LuaExpression,
    ): LuaExpression | undefined {
        const name = this.getFieldClassName(scope, lhs)
        if (!name) {
            return
        }

        if (rhs.type !== 'operation' || rhs.operator !== 'call') {
            return
        }

        // A(X)
        if (rhs.arguments.length !== 2) {
            return
        }

        // A({ ... })
        const callArg = rhs.arguments[1]
        if (callArg.type !== 'literal' || !callArg.tableId) {
            return
        }

        // TableRef({ ... })
        const callBase = rhs.arguments[0]
        const types = this.typeResolver.resolve({
            expression: callBase,
        })

        const argId = [...types][0]
        if (types.size !== 1 || !argId.startsWith('@table')) {
            return
        }

        // Node({ ... })
        const baseInfo = this.context.getTableInfo(argId)
        if (!baseInfo.isAtomUI) {
            return
        }

        const argInfo = this.context.getTableInfo(callArg.tableId)
        const info = this.addAtomUIClass(
            scope,
            name,
            argInfo,
            baseInfo.className,
        )

        return {
            type: 'literal',
            luaType: 'table',
            tableId: info.id,
        }
    }

    /**
     * Removes an empty class definition from the definition and marks it as empty.
     *
     * This exists to deal with the `ThermoDebug` edge case, in which it is set to an empty
     * table directly before the class is defined with `:derive`.
     *
     * @param name The reference ID to check.
     */
    protected removeEmptyDefinition(name: string) {
        const defs = this.context.getDefinitions(name)

        // single def?
        if (!defs || defs.length !== 1) {
            return
        }

        // belongs to this module?
        const def = defs[0]
        if (def.definingModule !== this.context.currentModule) {
            return
        }

        // table?
        const expr = def.expression
        if (expr.type !== 'literal' || expr.luaType !== 'table') {
            return
        }

        if (!expr.tableId) {
            return
        }

        // empty?
        if (expr.fields && expr.fields.length > 0) {
            return
        }

        const info = this.context.getTableInfo(expr.tableId)
        if (info.definitions.size > 0) {
            return
        }

        // remove the empty table definition
        info.isEmptyClass = true
        defs.splice(0, defs.length)
    }
}

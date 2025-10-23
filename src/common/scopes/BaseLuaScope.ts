import type ast from 'luaparse'
import type { AnalysisItem } from '../../analysis'
import { BaseLuaScopeArgs, LuaScope, NodeWithBody } from './types'

/**
 * Base class for information about a single Lua scope (block, function, or module).
 */
export class BaseLuaScope {
    /**
     * The ID of the scope.
     *
     * Function scopes will match the internal function ID
     * and block scopes will use their parent ID.
     */
    id: string

    /**
     * The parent scope.
     */
    parent?: BaseLuaScope

    /**
     * The node that the scope is based on.
     */
    node: NodeWithBody

    /**
     * The statements in the scope.
     */
    body: ast.Statement[]

    /**
     * Information about items in scope.
     */
    items: AnalysisItem[]

    /**
     * The table ID to use for a closure-based class.
     */
    classTableId?: string

    /**
     * The local identifier for a closure-based class.
     */
    classSelfName?: string

    /**
     * Maps locals defined in this scope to their IDs.
     */
    protected localToId: Map<string, string>

    /**
     * Maps IDs to locals defined in this scope.
     */
    protected idToLocal: Map<string, string>

    /**
     * Maps local type strings to the next available index to use for an ID.
     */
    protected static nextIndexMap: Map<string, number> = new Map()

    /**
     * Creates a new scope.
     * @param args Arguments for creation of the scope.
     */
    constructor(args: BaseLuaScopeArgs) {
        this.id = '@unknown'
        this.parent = args.parent
        this.node = args.node
        this.body = args.node.body
        this.items = []

        this.localToId = new Map()
        this.idToLocal = new Map()
    }

    /**
     * Adds a local to the scope and marks it as a class instance.
     * @param name The name to include in the ID.
     * @returns The internal ID for the local.
     */
    addInstance(name: string) {
        return this.addLocalItem(name, 'instance')
    }

    /**
     * Adds an analysis item to the scope.
     * @param item The item to add.
     */
    addItem<T extends AnalysisItem>(item: T): T {
        this.items.push(item)
        return item
    }

    /**
     * Adds a local defined in this scope.
     * @param name The name to include in the ID.
     * @returns The internal ID for the local.
     */
    addLocal(name: string): string {
        return this.addLocalItem(name)
    }

    /**
     * Adds a local function to the scope.
     * @param name The local identifier.
     * @param id The function identifier.
     * @returns The given function identifier.
     */
    addLocalFunction(name: string, id: string): string {
        this.localToId.set(name, id)
        this.idToLocal.set(id, name)

        return id
    }

    /**
     * Adds a local to the scope and marks it as a parameter.
     * @param parameter The name of the parameter.
     * @returns The internal identifier for the parameter.
     */
    addParameter(parameter: string) {
        return this.addLocalItem(parameter, 'parameter')
    }

    /**
     * Adds a local to the scope and marks it as an implicit self parameter.
     * @returns The internal identifier for the self parameter.
     */
    addSelfParameter() {
        return this.addLocalItem('self', 'self')
    }

    /**
     * Gets the defining scope for a local.
     * @param id The internal local identifier.
     * @returns The scope in which the local was defined.
     */
    getDefiningScope(id: string): LuaScope | undefined {
        if (this.idToLocal.get(id)) {
            return this as any as LuaScope
        }

        return this.parent?.getDefiningScope(id)
    }

    /**
     * Gets the ID associated with a local.
     * This will search the scope and parent scopes.
     *
     * @param name The local identifier.
     * @returns The internal idenftifier for the local.
     */
    getLocalId(name: string): string | undefined {
        return this.localToId.get(name) ?? this.parent?.getLocalId(name)
    }

    /**
     * Gets the name of a local associated with the given ID, if it's a local to this scope.
     * Otherwise, returns the given ID.
     * @param id The ID to retrieve.
     */
    getName(id: string): string {
        return this.localIdToName(id) ?? id
    }

    /**
     * Returns the local identifier for the `self` parameter, if one exists.
     * Otherwise, creates one and returns it.
     */
    getOrAddSelf(): string {
        return this.localToId.get('self') ?? this.addSelfParameter()
    }

    /**
     * Checks whether a name is local and defined in this scope.
     */
    hasDefinedLocal(name?: string): boolean {
        if (!name) {
            return false
        }

        return this.localToId.get(name) !== undefined
    }

    /**
     * Checks whether a name is local, defined in any accessible scope.
     * @param name The name of the local to check for.
     */
    hasLocal(name?: string): boolean {
        if (!name) {
            return false
        }

        if (this.localToId.get(name)) {
            return true
        }

        return this.parent ? this.parent.hasLocal(name) : false
    }

    /**
     * Gets the name of the local associated with the given ID, if it's a local.
     * @param id The ID to get the name for.
     * @returns The name of the local.
     */
    localIdToName(id: string): string | undefined {
        return this.idToLocal.get(id) ?? this.parent?.localIdToName(id)
    }

    /**
     * Adds a local, parameter, or self parameter to the scope.
     * @param name The name of the local or parameter.
     * @param type The type of ID to add.
     * @returns The internal identifier for the item.
     */
    protected addLocalItem(name: string, type: string = 'local'): string {
        const id = this.getNextLocalId(name, type)
        this.localToId.set(name, id)
        this.idToLocal.set(id, name)

        return id
    }

    /**
     * Gets an ID to use for a local.
     * @param name A name to add to the identifier, if creating a new one.
     * @param type The type of ID to add.
     * @returns The next available internal identifier.
     */
    protected getNextLocalId(name: string, type: string = 'local'): string {
        const nextIndex = BaseLuaScope.nextIndexMap.get(type) ?? 1
        BaseLuaScope.nextIndexMap.set(type, nextIndex + 1)

        if (type === 'self') {
            return `@${type}(${nextIndex})`
        }

        return `@${type}(${nextIndex})[${name}]`
    }
}

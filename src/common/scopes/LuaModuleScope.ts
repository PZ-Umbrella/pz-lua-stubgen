import type ast from 'luaparse'
import type { BaseLuaScopeArgs } from './types'
import { BaseLuaScope } from './BaseLuaScope'

/**
 * Arguments for creation of a module scope.
 */
interface ModuleScopeArgs extends Omit<BaseLuaScopeArgs, 'parent'> {
    /**
     * The chunk node associated with the scope.
     */
    node: ast.Chunk
}

/**
 * Represents a module scope.
 */
export class LuaModuleScope extends BaseLuaScope {
    /**
     * The type of the scope.
     */
    type: 'module'

    /**
     * The node associated with the scope.
     */
    node: ast.Chunk

    /**
     * The next available index for the scope ID.
     */
    protected static nextModuleIndex = 1

    /**
     * Creates a new module scope.
     * @param args Arguments for creation of the scope.
     */
    constructor(args: ModuleScopeArgs) {
        super(args)
        this.type = 'module'
        this.id = `@module(${LuaModuleScope.nextModuleIndex++})`
        this.node = args.node
    }
}

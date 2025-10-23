import type ast from 'luaparse'
import type { BaseLuaScopeArgs } from './types'
import { BaseLuaScope } from './BaseLuaScope'

/**
 * Arguments for creation of a function scope.
 */
interface FunctionScopeArgs extends BaseLuaScopeArgs {
    /**
     * The node associated with the scope.
     */
    node: ast.FunctionDeclaration
}

/**
 * Represents a function scope.
 */
export class LuaFunctionScope extends BaseLuaScope {
    /**
     * The type of the scope.
     */
    type: 'function'

    /**
     * The node associated with the scope.
     */
    node: ast.FunctionDeclaration

    /**
     * Creates a new function scope.
     * @param args Arguments for creation of the scope.
     */
    constructor(args: FunctionScopeArgs) {
        super(args)
        this.type = 'function'
        this.node = args.node
    }
}

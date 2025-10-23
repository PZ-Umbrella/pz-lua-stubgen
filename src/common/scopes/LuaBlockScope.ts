import { BaseLuaScope } from './BaseLuaScope'
import type { BaseLuaScopeArgs, BasicBlockNode } from './types'

/**
 * Arguments for creation of a block scope.
 */
interface BlockScopeArgs extends BaseLuaScopeArgs {
    /**
     * The node associated with the scope.
     */
    node: BasicBlockNode
}

/**
 * Represents a block scope.
 * This handles any block other than a function or the main module scope.
 */
export class LuaBlockScope extends BaseLuaScope {
    /**
     * The type of the scope.
     */
    type: 'block'

    /**
     * The node associated with the scope.
     */
    node: BasicBlockNode

    /**
     * Creates a new block scope.
     * @param args Arguments for creation of the scope.
     */
    constructor(args: BlockScopeArgs) {
        super(args)
        this.type = 'block'
        this.node = args.node
    }
}

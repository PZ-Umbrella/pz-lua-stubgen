import type ast from 'luaparse'

import { LuaBlockScope } from './LuaBlockScope'
import { LuaModuleScope } from './LuaModuleScope'
import { LuaFunctionScope } from './LuaFunctionScope'

/**
 * A Lua scope object.
 */
export type LuaScope = LuaModuleScope | LuaFunctionScope | LuaBlockScope

/**
 * Arguments for creation of a scope.
 */
export interface BaseLuaScopeArgs {
    /**
     * The parent scope.
     * This is required on scopes other than module scopes.
     */
    parent?: LuaScope

    /**
     * The AST node the scope is based on.
     */
    node: NodeWithBody
}

/**
 * A node type that includes a block body.
 */
export type NodeWithBody =
    | ast.Chunk
    | ast.IfClause
    | ast.ElseifClause
    | ast.ElseClause
    | ast.WhileStatement
    | ast.RepeatStatement
    | ast.DoStatement
    | ast.ForGenericStatement
    | ast.ForNumericStatement
    | ast.FunctionDeclaration

/**
 * A node type with a block body or an expression.
 */
export type ExpressionOrHasBody = ast.Expression | NodeWithBody

/**
 * A node type that includes a block body, other than functions and modules.
 */
export type BasicBlockNode = Exclude<
    NodeWithBody,
    ast.FunctionDeclaration | ast.Chunk
>

import ast from 'luaparse'
import type { AnyCallExpression } from './types'
import { log, readFileContents, readLuaStringLiteral } from '../helpers'
import {
    ExpressionOrHasBody,
    LuaBlockScope,
    LuaFunctionScope,
    LuaModuleScope,
    LuaScope,
    NodeWithBody,
} from '../common'

/**
 * Base class for reading information from Lua files.
 */
export abstract class BaseReader {
    /**
     * Creates a new Lua scope object.
     * @param node The node associated with the scope.
     * @param parent The parent scope.
     */
    protected createScope(node: NodeWithBody, parent?: LuaScope): LuaScope {
        let scope: LuaScope
        switch (node.type) {
            case 'Chunk':
                scope = new LuaModuleScope({ node })
                break

            case 'FunctionDeclaration':
                scope = new LuaFunctionScope({
                    parent,
                    node,
                })

                const ident = node.identifier
                if (
                    ident &&
                    ident.type === 'MemberExpression' &&
                    ident.indexer === ':'
                ) {
                    scope.addSelfParameter()
                }

                for (const param of node.parameters) {
                    scope.addParameter(
                        param.type === 'Identifier' ? param.name : '...',
                    )
                }

                break

            case 'ForGenericStatement':
                scope = new LuaBlockScope({
                    parent,
                    node,
                })

                for (const variable of node.variables) {
                    scope.addLocal(variable.name)
                }

                break

            case 'ForNumericStatement':
                scope = new LuaBlockScope({
                    parent,
                    node,
                })

                scope.addLocal(node.variable.name)
                break

            default:
                scope = new LuaBlockScope({
                    parent,
                    node,
                })

                break
        }

        this.processNewScope(scope)

        return scope
    }

    /**
     * Gets the base identifier of an expression.
     * For identifiers, this is the given expression.
     * For member and index expressions, it will return the leftmost identifier.
     *
     * For example, the base identifier of `X.Y.Z` will be `X`.
     *
     * @param expr The expression to get the base identifier for.
     */
    protected getBaseIdentifier(
        expr: ast.Expression,
    ): ast.Identifier | undefined {
        switch (expr.type) {
            case 'Identifier':
                return expr

            case 'MemberExpression':
            case 'IndexExpression':
                const base = expr.base
                if (base.type === 'Identifier') {
                    return base
                }

                return this.getBaseIdentifier(base)
        }
    }

    /**
     * Collects scoped blocks within the given expressions.
     * @param expressions Expressions to check.
     * @param scope The current scope.
     */
    protected getScopedBlocks(
        expressions: ExpressionOrHasBody[],
        scope: LuaScope,
    ) {
        const stack: LuaScope[] = []
        this.pushScopedBlocks(expressions, scope, stack)
        return stack
    }

    /**
     * Returns whether the expression is a call expression type.
     * @param expr The expression to check.
     */
    protected isCallExpression(
        expr: ast.Expression,
    ): expr is AnyCallExpression {
        return (
            expr.type === 'CallExpression' ||
            expr.type === 'StringCallExpression' ||
            expr.type === 'TableCallExpression'
        )
    }

    /**
     * Checks whether an operator is a mathematical operator.
     * @param operator The operator string to check.
     */
    protected isMathOperator(operator: string): boolean {
        switch (operator) {
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
                return true
        }

        return false
    }

    /**
     * Parses a Lua string into an AST.
     * @param lua The Lua source.
     * @param filePath The path of the file the source was read from.
     * @param includeLocations Flag for whether location information should be included with each node.
     */
    protected parse(
        lua: string,
        filePath: string,
        includeLocations?: boolean,
    ): ast.Chunk | undefined {
        try {
            return ast.parse(this.sanitizeLua(lua), {
                comments: false,
                locations: includeLocations,
                luaVersion: '5.2', // Kahlua is closer to 5.1, but this gets around the 'break' issue in luaparse
            })
        } catch (e) {
            log.error(`Failed to parse file '${filePath}': ${e}`)
        }
    }

    /**
     * Performs processing on a newly-created scope.
     * @param scope The new scope.
     */
    protected processNewScope(scope: LuaScope) {}

    /**
     * Creates a new Lua scope object and pushes it to a stack.
     * @param node The node to create a scope from.
     * @param stack The stack to add the scope to.
     * @param parent The parent scope.
     */
    protected pushScope(
        node: NodeWithBody,
        stack: LuaScope[],
        parent?: LuaScope,
    ): LuaScope {
        const scope = this.createScope(node, parent)

        stack.push(scope)

        return scope
    }

    /**
     * Collects scoped blocks within the given expressions.
     * @param expressions Expressions to check.
     * @param scope The current scope.
     * @param stack The stack to push new scopes to.
     */
    protected pushScopedBlocks(
        expressions: ExpressionOrHasBody[],
        scope: LuaScope,
        stack: LuaScope[],
    ) {
        const exprStack = [...expressions]
        while (exprStack.length > 0) {
            const expr = exprStack.pop()!
            switch (expr.type) {
                case 'UnaryExpression':
                    exprStack.push(expr.argument)
                    break

                case 'BinaryExpression':
                case 'LogicalExpression':
                    exprStack.push(expr.left)
                    exprStack.push(expr.right)
                    break

                case 'MemberExpression':
                    exprStack.push(expr.base)
                    break

                case 'IndexExpression':
                    exprStack.push(expr.base)
                    exprStack.push(expr.index)
                    break

                case 'CallExpression':
                    exprStack.push(expr.base)
                    exprStack.push(...expr.arguments)
                    break

                case 'TableCallExpression':
                    exprStack.push(expr.base)
                    exprStack.push(expr.arguments)
                    break

                case 'StringCallExpression':
                    exprStack.push(expr.base)
                    break

                case 'TableConstructorExpression':
                    for (const field of expr.fields) {
                        if (field.type === 'TableKey') {
                            exprStack.push(field.key)
                            exprStack.push(field.value)
                        } else {
                            exprStack.push(field.value)
                        }
                    }

                    break

                case 'ForGenericStatement':
                case 'ForNumericStatement':
                case 'IfClause':
                case 'ElseifClause':
                case 'ElseClause':
                case 'WhileStatement':
                case 'RepeatStatement':
                case 'DoStatement':
                case 'FunctionDeclaration':
                    this.pushScope(expr, stack, scope)
                    break
            }
        }
    }

    /**
     * Reads and returns the contents of a file.
     * @param filePath The path of the file to read.
     */
    protected async readFileContents(
        filePath: string,
    ): Promise<string | undefined> {
        try {
            return readFileContents(filePath)
        } catch (e) {
            log.error(`Failed to read file '${filePath}': ${e}`)
            return
        }
    }

    /**
     * Reads the name of the required module from a `require` call.
     * If the given expression is not a call to `require` with a string literal, this returns `undefined`.
     *
     * @param expr The expression to check.
     */
    protected readRequire(expr: ast.Expression): string | undefined {
        const isCall =
            expr.type === 'CallExpression' ||
            expr.type === 'StringCallExpression'

        if (!isCall) {
            return
        }

        if (expr.base.type !== 'Identifier' || expr.base.name !== 'require') {
            return
        }

        let argument: ast.StringLiteral | undefined
        if (expr.type !== 'StringCallExpression') {
            if (expr.arguments.length !== 1) {
                return
            }

            if (expr.arguments[0].type !== 'StringLiteral') {
                return
            }

            argument = expr.arguments[0]
        } else {
            if (expr.argument.type !== 'StringLiteral') {
                return
            }

            argument = expr.argument
        }

        if (argument) {
            return readLuaStringLiteral(argument.raw)
        }
    }

    /**
     * Sanitizes a Lua source string for AST parsing.
     * @param source The Lua source to sanitize.
     */
    protected sanitizeLua(source: string): string {
        // handles Kahlua-specific number quirks
        // replacement based on PipeWrench-Modeler
        source = source.replace(/(\d)[lf]([,;)\s])/g, '$1$2')

        source = source.replace(/[^\\]\\%/g, ' %') // ISZoneDisplay edge case

        return source
    }
}

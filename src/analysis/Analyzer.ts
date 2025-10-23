import path from 'path'
import { AnalyzeArgs, AnalyzedModule } from './types'
import { BaseCommandHandler } from '../common'
import { DependencyResolver } from '../dependency-resolution'
import { AnalysisReader } from './AnalysisReader'
import { AnalysisContext } from './AnalysisContext'
import { getAliasMap, log, writeReport, time } from '../helpers'

/**
 * Handles analysis of module types.
 */
export class Analyzer extends BaseCommandHandler {
    /**
     * The shared analysis context.
     */
    protected context: AnalysisContext

    /**
     * The file to output a report to.
     */
    protected outFile: string | undefined

    /**
     * The reader used to perform the analysis.
     */
    protected reader: AnalysisReader

    /**
     * Creates a new analyzer.
     * @param args Command-line arguments for analysis.
     */
    constructor(args: AnalyzeArgs) {
        super(args)

        this.context = new AnalysisContext(args)
        this.reader = new AnalysisReader(this.context)

        this.outFile = args.outputFile
            ? path.normalize(args.outputFile)
            : undefined
    }

    /**
     * Runs analysis on the given directory.
     */
    async run() {
        const order = await this.getAnalysisOrder()
        const modules = time('analysis', async () => {
            return await this.analyze(order)
        })

        return modules
    }

    /**
     * Generates a report containing results of analyzing Lua files.
     */
    async generateReport() {
        const modules = await this.run()

        await writeReport({ modules }, this.outFile)
    }

    /**
     * Analyzes the files in the provided array in order.
     * @param identifiers An array of file identifiers.
     */
    protected async analyze(identifiers: string[]): Promise<AnalyzedModule[]> {
        this.context.aliasMap = getAliasMap(identifiers)

        // analyze types
        const seen = new Set<string>()
        for (const identifier of identifiers) {
            try {
                if (seen.has(identifier)) {
                    throw new Error('Duplicate file identifier')
                }

                seen.add(identifier)

                const filename = path.join(
                    this.inDirectory,
                    identifier + '.lua',
                )

                await this.reader.analyzeModule(identifier, filename)
            } catch (e) {
                log.error(`Failed to analyze file '${identifier}': ${e}`)
            }
        }

        // resolve final types
        const moduleMap = this.finalizeModules()

        // build result
        const modules: AnalyzedModule[] = []
        for (const identifier of identifiers) {
            const module = moduleMap.get(identifier)
            if (module) {
                modules.push(module)
            }
        }

        return modules
    }

    /**
     * Resolves the final types of analyzed modules.
     */
    protected finalizeModules() {
        return this.context.finalizer.finalize()
    }

    /**
     * Determines the files to analyze based on dependency resolution.
     * This returns a list of file identifiers, rather than filenames.
     */
    protected async getAnalysisOrder(): Promise<string[]> {
        const resolver = new DependencyResolver({
            inputDirectory: this.inDirectory,
            subdirectories: this.subdirectories,
        })

        return await resolver.run()
    }
}

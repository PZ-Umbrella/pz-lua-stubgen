import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { ResolveArgs, DependencyResolver } from './dependency-resolution'
import { AnalyzeArgs, Analyzer } from './analysis'
import { AnnotateArgs, Annotator } from './annotation'

import {
    RosettaGenerateArgs as GenerateArgs,
    RosettaGenerator as Generator,
    RosettaUpdater as Updater,
    RosettaUpdateArgs as UpdateArgs,
} from './rosetta'

import {
    annotateCommand,
    initRosettaCommand,
    reportAnalysisCommand,
    reportDepsCommand,
    updateRosettaCommand,
} from './commands'

yargs(hideBin(process.argv))
    .scriptName('pz-lua-stubgen')
    .command(
        '$0',
        'Generates typestubs for Lua files',
        annotateCommand,
        (async (args: AnnotateArgs) => await new Annotator(args).run()) as any,
    )
    .command(
        'init-rosetta',
        'Generates default Rosetta data files',
        initRosettaCommand,
        (async (args: GenerateArgs) => await new Generator(args).run()) as any,
    )
    .command(
        'update-rosetta',
        'Updates Rosetta data files with information from Lua files',
        updateRosettaCommand,
        (async (args: UpdateArgs) => await new Updater(args).run()) as any,
    )
    .command(
        'report-analysis',
        'Reports on analyzed and inferred Lua types',
        reportAnalysisCommand,
        (async (args: AnalyzeArgs) =>
            await new Analyzer(args).generateReport()) as any,
    )
    .command(
        'report-deps',
        'Reports on requires, global reads, global writes, and the resolved analysis order',
        reportDepsCommand,
        (async (args: ResolveArgs) =>
            await new DependencyResolver(args).generateReport()) as any,
    )
    .strict()
    .demandCommand()
    .parseAsync()
    .catch((e) => console.error(e))

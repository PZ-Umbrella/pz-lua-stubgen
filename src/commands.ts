import fs from 'fs'
import path from 'path'
import type { Argv } from 'yargs'

/**
 * Adds the command-line options for the annotate command.
 */
export const annotateCommand = (yargs: Argv) => {
    addSharedPrefix(yargs, false)
        .option('output-directory', {
            type: 'string',
            alias: 'o',
            required: true,
            desc: 'The directory for output stubs',
        })
        .option('alphabetize', {
            type: 'boolean',
            hidden: true,
            default: true,
        })
        .option('no-alphabetize', {
            type: 'boolean',
            defaultDescription: 'false',
            desc: 'Skip alphabetical sorting of fields and functions',
        })
        .option('include-kahlua', {
            type: 'boolean',
            alias: 'k',
            desc: 'If given, an additional stub for Kahlua will be included',
        })
        .option('inject', {
            type: 'boolean',
            hidden: true,
        })
        .option('no-inject', {
            type: 'boolean',
            defaultDescription: 'false',
            desc: 'Disallow injecting additional data from Rosetta',
        })
        .option('strict-fields', {
            type: 'boolean',
            hidden: true,
            default: true,
        })
        .option('no-strict-fields', {
            type: 'boolean',
            defaultDescription: 'false',
            desc: 'Marks classes as accepting fields of any type',
        })
        .option('ambiguity', {
            type: 'boolean',
            hidden: true,
            default: true,
        })
        .option('no-ambiguity', {
            type: 'boolean',
            defaultDescription: 'false',
            desc: 'Treats analyzed union types as unknown',
        })
        .option('rosetta', {
            type: 'string',
            alias: 'r',
            desc: 'The directory to use for rosetta files',
        })
        .option('rosetta-only', {
            type: 'boolean',
            conflicts: ['input-directory', 'inject'],
            implies: ['rosetta'],
            desc: 'Generate typestubs using only Rosetta data',
        })
        .option('helper-pattern', {
            type: 'string',
            desc: 'Regular expression to use to determine whether a class or table should have no initializer',
        })
        .check((args: any) => {
            if (!args.inputDirectory && !args.rosettaOnly) {
                throw new Error(
                    'Missing required argument: input-directory or rosetta-only',
                )
            }

            return true
        })

    addHeuristicOption(yargs)
    addExcludeOptions(yargs)

    return addSharedSuffix(yargs)
}

/**
 * Adds the command-line options for the rosetta initialization command.
 */
export const initRosettaCommand = (yargs: Argv) => {
    addSharedPrefix(yargs)

    addRosettaOptions(yargs)
    addHeuristicOption(yargs)
    addExcludeOptions(yargs)

    return addSharedSuffix(yargs)
}

/**
 * Adds the command-line options for the report-analysis command.
 */
export const reportAnalysisCommand = (yargs: Argv) => {
    addSharedPrefix(yargs)
    addOutputFileOption(yargs)
    addHeuristicOption(yargs)

    return addSharedSuffix(yargs)
}

/**
 * Adds the command-line options for the rosetta update command.
 */
export const updateRosettaCommand = (yargs: Argv) => {
    addSharedPrefix(yargs)
    addRosettaOptions(yargs)

    addHeuristicOption(yargs)
        .option('delete-unknown', {
            type: 'boolean',
            default: true,
            hidden: true,
        })
        .option('no-delete-unknown', {
            type: 'boolean',
            defaultDescription: 'false',
            desc: 'Display warnings for unknown items instead of deleting them',
        })
        .option('keep-types', {
            type: 'boolean',
            default: 'false',
            desc: 'If given, currently documented Rosetta types will not be updated',
        })
        .option('extra-files', {
            type: 'array',
            string: true,
            desc: 'List of file identifiers to treat as known files',
        })
        .option('skip-pattern', {
            type: 'string',
            desc: 'Regular expression to use to determine whether a name should be ignored',
        })

    addExcludeOptions(yargs)

    return addSharedSuffix(yargs)
}

/**
 * Adds the command-line options for the report-deps command.
 */
export const reportDepsCommand = (yargs: Argv) => {
    addSharedPrefix(yargs)
    addOutputFileOption(yargs)

    return addSharedSuffix(yargs)
}

/**
 * Adds shared yargs options for excluding classes and fields.
 */
const addExcludeOptions = (yargs: Argv) => {
    return yargs
        .option('exclude', {
            type: 'array',
            alias: 'e',
            string: true,
            desc: 'Classes to exclude from annotations',
        })
        .option('exclude-fields', {
            type: 'array',
            string: true,
            desc: 'Classes to include without fields',
        })
        .option('include-large-defs', {
            type: 'boolean',
            default: false,
            defaultDescription: 'true',
            desc: 'Include fields for known large definition classes',
        })
}

/**
 * Adds the shared yargs option for enabling or disabling heuristics.
 */
const addHeuristicOption = (yargs: Argv) => {
    return yargs
        .option('heuristics', {
            type: 'boolean',
            default: true,
            hidden: true,
            desc: 'Whether to apply heuristics to guess types',
        })
        .option('no-heuristics', {
            type: 'boolean',
            desc: 'Disable assumption of types based on common patterns',
        })
}

/**
 * Adds the shared yargs option for specifying an output file for a report.
 */
const addOutputFileOption = (yargs: Argv) => {
    return yargs.option('output-file', {
        type: 'string',
        alias: 'o',
        desc: 'The output file for report results',
    })
}

/**
 * Adds shared yargs options for Rosetta initialize and update.
 */
const addRosettaOptions = (yargs: Argv) => {
    return yargs
        .option('output-directory', {
            type: 'string',
            alias: 'o',
            required: true,
            desc: 'The directory for output files',
        })
        .option('format', {
            type: 'string',
            alias: 'f',
            default: 'yml',
            choices: ['json', 'yml'],
            desc: 'The format to use for generated files',
        })
}

/**
 * Adds shared yargs options to prefix for all commands.
 * @param requireInputDir Flag for whether the `input-directory` option should be required.
 */
const addSharedPrefix = (yargs: Argv, requireInputDir = true) => {
    return yargs
        .option('level', {
            type: 'string',
            alias: 'l',
            choices: ['silent', 'error', 'warn', 'info', 'verbose', 'debug'],
            desc: 'Log level',
            conflicts: ['verbose'],
        })
        .option('verbose', {
            type: 'boolean',
            alias: 'v',
            desc: 'Shortcut for verbose log level',
            conflicts: ['level'],
        })
        .option('input-directory', {
            type: 'string',
            alias: 'i',
            required: requireInputDir,
            conflicts: ['rosetta-only'],
            desc: 'The directory for input Lua files',
        })
}

/**
 * Adds shared yargs options to suffix for all commands.
 */
const addSharedSuffix = (yargs: Argv) => {
    return yargs
        .option('subdirectories', {
            type: 'array',
            string: true,
            conflicts: ['all-subdirectories'],
            defaultDescription: '"shared client server"',
            desc: 'The subdirectories to read, in reading order',
        })
        .option('all-subdirectories', {
            type: 'boolean',
            conflicts: ['subdirectories'],
            desc: 'If given, all subdirectories of the input directory will be read',
        })
        .check((args: any) => {
            if (!args.inputDirectory) {
                return true
            }

            if (fs.existsSync(path.resolve(args.inputDirectory))) {
                return true
            }

            throw 'Input directory does not exist.'
        })
        .wrap(120)
}

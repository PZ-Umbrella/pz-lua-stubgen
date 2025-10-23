import path from 'path'
import { log } from '../helpers'
import type { BaseArgs } from './types'

/**
 * Base class for handling commands.
 */
export abstract class BaseCommandHandler {
    /**
     * The input directory to read from.
     */
    protected inDirectory: string

    /**
     * The subdirectories within the input directory to read from.
     */
    protected subdirectories: string[]

    /**
     * Flag for whether the log level has already been updated based on an argument.
     */
    private static updatedLogLevel: boolean = false

    /**
     * Populates values from the provided arguments.
     * @param args Arguments for creating the instance.
     */
    constructor(args: BaseArgs) {
        this.inDirectory = args.inputDirectory
            ? path.normalize(args.inputDirectory)
            : ''

        this.subdirectories = args.subdirectories ?? [
            'shared',
            'client',
            'server',
        ]

        if (args.allSubdirectories) {
            this.subdirectories = []
        } else {
            this.subdirectories = this.subdirectories.filter(
                (x) => x && x !== '',
            )
        }

        if (!BaseCommandHandler.updatedLogLevel) {
            BaseCommandHandler.updatedLogLevel = true
            if (args.verbose) {
                log.level = 'verbose'
            } else if (args.silent || args.level === 'silent') {
                log.silent = true
            } else {
                log.level = args.level ?? 'info'
            }
        }
    }
}

import { BaseReportArgs } from '../common'

/**
 * Arguments for dependency resolution.
 */
export type ResolveArgs = BaseReportArgs

/**
 * Information about a Lua file's explicit and implicit dependencies.
 */
export interface LuaDependencyInfo {
    /**
     * A set of identifiers for globals that the file reads.
     */
    reads: Set<string>

    /**
     * A set of identifiers for globals that the file writes.
     */
    writes: Set<string>

    /**
     * A set of filenames that the file requires.
     */
    requires: Set<string>
}

/**
 * Mappings of file identifiers to dependency information.
 */
export interface LuaDependencyInfoMaps {
    /**
     * Maps file identifiers to a set of globals that the file reads.
     */
    reads: Record<string, Set<string>>

    /**
     * Maps file identifiers to a set of globals that the file writes.
     */
    writes: Record<string, Set<string>>

    /**
     * Maps file identifiers to a set of filenames that the file requires.
     */
    requires: Record<string, Set<string>>
}

/**
 * Gets the identifier to use for a filename.
 * @param filename The filename to get an identifier for.
 * @param basePath The base path for all files. This will be excluded from the identifier.
 * @param extensions File extensions to remove from the filename for the identifier. Defaults to `['.lua']`.
 */
export const getFileIdentifier = (
    filename: string,
    basePath?: string,
    extensions?: string[],
): string => {
    basePath = basePath ? basePath.replaceAll('\\', '/') : undefined
    filename = filename.replaceAll('\\', '/')

    if (basePath && filename.startsWith(basePath)) {
        filename = filename.slice(basePath.length)
    }

    extensions ??= ['.lua']
    for (const ext of extensions) {
        if (filename.endsWith(ext)) {
            filename = filename.slice(0, -ext.length)
            break
        }
    }

    filename = filename.replaceAll('.', '/')
    if (filename.startsWith('/')) {
        filename = filename.slice(1)
    }

    return filename
}

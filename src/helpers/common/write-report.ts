import path from 'path'
import { Logger as log } from './Logger'
import { writeFile } from './write-file'

/**
 * Outputs a report object to an output file or the console.
 * @param report The report object to write.
 * @param filePath The output file path.
 * If this does not end with `.json`, it will be interpreted as a directory in which `report.json` will be written.
 */
export const writeReport = async (report: object, filePath?: string) => {
    const json = JSON.stringify(
        report,
        (_, value) => (value instanceof Set ? [...value] : value),
        filePath ? 2 : undefined,
    )

    if (!filePath) {
        console.log(json)
        return
    }

    filePath = filePath.toLowerCase().endsWith('.json')
        ? filePath
        : path.join(filePath, 'report.json')

    try {
        const outPath = path.resolve(filePath)
        await writeFile(outPath, json)
        log.info(`Report generated at ${outPath}`)
    } catch (e) {
        log.error(`Failed to create file '${filePath}': ${e}`)
    }
}

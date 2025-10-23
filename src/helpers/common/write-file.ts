import fs from 'fs'
import path from 'path'

/**
 * Writes a file to the given output path.
 * @param filePath The path to write the file to.
 * @param content The file content.
 */
export const writeFile = async (filePath: string, content: string) => {
    await fs.promises.mkdir(path.dirname(filePath), {
        recursive: true,
    })

    await fs.promises.writeFile(filePath, content, { flag: 'w' })
}

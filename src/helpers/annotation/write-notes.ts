/**
 * Writes notes to individual lines for an annotation.
 * @param notes The notes to write.
 * @param out The output string array.
 * @param tab Leading space characters to include before each line.
 */
export const writeNotes = (
    notes: string | undefined,
    out: string[],
    tab: string = '',
) => {
    if (!notes) {
        return
    }

    const lines = notes.replaceAll('\r', '').trim().split('\n')
    for (const line of lines) {
        out.push(`\n${tab}---${line.trim()}`)
    }
}

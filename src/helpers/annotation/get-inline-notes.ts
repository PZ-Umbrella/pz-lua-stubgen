/**
 * Converts a description string into a string that can fit on a single line.
 * @param notes Description string.
 */
export const getInlineNotes = (notes: string): string => {
    return notes.trim().replaceAll('\r', '').replaceAll('\n', '<br>')
}

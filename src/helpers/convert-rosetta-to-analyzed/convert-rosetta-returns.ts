import { RosettaReturn } from '../../rosetta'
import { convertRosettaTypes } from './convert-rosetta-types'

/**
 * Converts Rosetta returns into a list containing sets of returns types.
 * @param returns The Rosetta returns to convert.
 * @returns
 */
export const convertRosettaReturns = (
    returns: RosettaReturn[] | undefined,
): Set<string>[] => {
    if (!returns) {
        return []
    }

    return returns.map((x): Set<string> => {
        return convertRosettaTypes(x.type, x.nullable)
    })
}

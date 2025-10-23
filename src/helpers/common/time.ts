import { Logger as log } from './Logger'

/**
 * Times the operation of a task, logging a message after it's complete.
 * @param taskName The name of the task.
 * @param task The task function.
 * @param getMessage An additional function to determine the output message based on the task result.
 */
export const time = async <T>(
    taskName: string,
    task: () => Promise<T>,
    getMessage?: (result: T, time: number) => string | undefined,
): Promise<T> => {
    const start = performance.now()
    const result = await task()
    const time = performance.now() - start

    let message = getMessage ? getMessage(result, time) : undefined
    message ??= `Finished ${taskName} in ${time.toFixed(0)}ms`

    log.verbose(message)

    return result
}

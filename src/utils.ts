import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { spinner } from '@clack/prompts'

const execAsyncUtil = promisify(exec)

export async function execAsync(
  command: string,
  startMessage: string,
  errorMessage: string,
  successMessage: string
): Promise<void> {
  const s = spinner()
  s.start(startMessage)
  try {
    const { stderr } = await execAsyncUtil(command)

    if (stderr) {
      throw new Error(stderr)
    }

    s.stop(successMessage)
    return
  } catch (_error) {
    s.stop(errorMessage)
  }
}

export type PrivacyStartupTask = {
  name: string
  run: () => Promise<unknown> | unknown
}

export async function runIndependentPrivacyStartupTasks(
  tasks: PrivacyStartupTask[],
  reportFailure: (taskName: string, error: unknown) => void = (taskName, error) => {
    const summary = error instanceof Error ? error.name : "UnknownError"
    console.error(`Privacy startup task failed: ${taskName} (${summary})`)
  }
): Promise<void> {
  const results = await Promise.allSettled(
    tasks.map(({ run }) => Promise.resolve().then(run))
  )

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      reportFailure(tasks[index].name, result.reason)
    }
  })
}

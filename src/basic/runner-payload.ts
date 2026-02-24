export const BASIC_RUNNER_STORAGE_KEY = "gamenotebook.basic.runner.payload"

export type BasicRunnerPayload = {
  source: string
  snippetName: string
  timestamp: number
}

export const encodeRunnerPayload = (payload: BasicRunnerPayload): string => {
  return JSON.stringify(payload)
}

export const decodeRunnerPayload = (
  raw: string | null
): BasicRunnerPayload | null => {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<BasicRunnerPayload>
    if (
      typeof parsed.source !== "string" ||
      typeof parsed.snippetName !== "string" ||
      typeof parsed.timestamp !== "number"
    ) {
      return null
    }
    return {
      source: parsed.source,
      snippetName: parsed.snippetName,
      timestamp: parsed.timestamp,
    }
  } catch (error) {
    console.error("Failed to parse runner payload", error)
    return null
  }
}

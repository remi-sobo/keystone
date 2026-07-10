/**
 * lib/stageMeanings.ts (V2 2F)
 *
 * One voice-checked sentence per canonical stage: what this stage
 * MEANS, said to the client. The shared copy map (CONFIRM 2F-3);
 * practices rename stages via stage_config, and unknown names fall
 * back to silence rather than a wrong sentence.
 */

const MEANINGS: Record<string, string> = {
  diagnose: 'We are mapping what exists and what it needs before anything gets built.',
  design: 'We are shaping the plan on paper so the build starts from a real blueprint.',
  build: 'We are building the real thing and testing it against real work.',
  train: 'You are learning to run what was built, with us beside you.',
  stabilize: 'It runs in your hands; we are proving it holds without us.',
  done: 'This workstream stands on its own.',
}

export function stageMeaning(stage: string): string | null {
  return MEANINGS[stage.toLowerCase()] ?? null
}

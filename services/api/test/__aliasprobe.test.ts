import { decide } from "@api/contexts/ticketing/commands/domain/decide.ts";
// decide(state, command, ctx) — pass a number where ShowState is expected: a real type error
// ONLY catchable if tsc resolves @api AND type-checks through it.
export const bad = decide(123 as never extends never ? number : never, {} as never, {} as never);
const wrongArity: string = decide;  // assigning a function to string — type error
export { wrongArity };

// Server startup must not mutate clinical data or reconcile a broad schema.
// Explicit, reviewed operator migrations are separate from application startup.
export async function runReadOnlyStartupValidation(validate: () => Promise<void>) {
  await validate();
}

/** Validate the optional packageValidation section before packaging begins. */
export function validatePackageValidationConfiguration(value: unknown): void {
    if (value === undefined) {
        return;
    }

    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("packageValidation must be an object");
    }

    const validation = value as Record<string, unknown>;
    if (!Array.isArray(validation.allowedFiles) || validation.allowedFiles.length === 0 ||
        validation.allowedFiles.some((entry: unknown) => typeof entry !== "string" || entry.trim() === "")) {
        throw new Error("packageValidation.allowedFiles must be a nonempty array of nonempty strings");
    }

    if (validation.requiredFiles !== undefined &&
        (!Array.isArray(validation.requiredFiles) ||
            validation.requiredFiles.some((entry: unknown) => typeof entry !== "string" || entry.trim() === ""))) {
        throw new Error("packageValidation.requiredFiles must be an array of nonempty strings");
    }
}

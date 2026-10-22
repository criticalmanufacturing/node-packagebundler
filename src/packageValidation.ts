import * as io from "fs-extra";
import * as os from "node:os";
import * as path from "path";
import { minimatch } from "minimatch";
import { PackageValidation } from "./models/configuration";
import { Operations } from "./processors/operations";

const matchOptions = { nocase: false, dot: true, nonegate: true, nocomment: true };

function normalizeFilePath(value: string): string {
    return value.replace(/\\/g, "/").replace(/^(\.\/)+/, "");
}

/** Compare npm's final archive manifest with the configured file patterns. */
export function validatePackageFiles(files: string[], validation: PackageValidation): void {
    const archiveFiles = [...new Set(files.map(normalizeFilePath))].sort();
    const allowed = validation.allowedFiles.map(normalizeFilePath);
    const required = (validation.requiredFiles || []).map(normalizeFilePath);
    const unexpected = archiveFiles.filter(file => !allowed.some(pattern => minimatch(file, pattern, matchOptions)));
    const missing = required.filter(pattern => !archiveFiles.some(file => minimatch(file, pattern, matchOptions))).sort();

    if (unexpected.length > 0 || missing.length > 0) {
        throw new Error([
            "Package validation failed:",
            "Unexpected files:",
            ...(unexpected.length > 0 ? unexpected.map(file => `  ${file}`) : ["  (none)"]),
            "Missing required files:",
            ...(missing.length > 0 ? missing.map(pattern => `  ${pattern}`) : ["  (none)"])
        ].join("\n"));
    }
}

interface NpmPackFile { path: string; }
interface NpmPackResult { filename: string; files: NpmPackFile[]; }

function parsePackResult(output: string): NpmPackResult {
    let result: unknown;
    try {
        result = JSON.parse(output);
    } catch {
        throw new Error("npm pack did not return a valid JSON file manifest");
    }

    if (!Array.isArray(result) || result.length !== 1 || result[0] == null || typeof result[0] !== "object") {
        throw new Error("npm pack did not return exactly one package manifest");
    }

    const pack = result[0] as Record<string, unknown>;
    if (typeof pack.filename !== "string" || pack.filename === "" ||
        path.basename(pack.filename) !== pack.filename || /[\\/]/.test(pack.filename) ||
        !Array.isArray(pack.files) ||
        pack.files.some((file: unknown) => file == null || typeof file !== "object" ||
            typeof (file as Record<string, unknown>).path !== "string")) {
        throw new Error("npm pack returned an incomplete file manifest");
    }

    return pack as unknown as NpmPackResult;
}

/** Pack even without an output directory, then validate the actual npm archive contents. */
export function packAndValidate(operations: Operations, temp: string, destination: string,
    validation: PackageValidation): void {
    const command = os.platform() === "win32" ? "npm.cmd" : "npm";
    const result = parsePackResult(operations.runAndCapture(command, ["pack", "--json"], temp));
    const archive = path.join(temp, result.filename);

    try {
        if (!io.existsSync(archive)) {
            throw new Error(`npm pack did not create '${result.filename}'`);
        }

        validatePackageFiles(result.files.map(file => file.path), validation);
        if (destination !== "") {
            operations.createDirectory(destination);
            operations.moveFile(result.filename, temp, destination);
        }
    } finally {
        io.removeSync(archive);
    }
}

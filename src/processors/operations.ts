import { inject, injectable } from "inversify";
import { TYPES } from "../types";
import { Log } from "./log";
import * as path from "path";
import * as io from "fs-extra";
import { spawnSync } from "child_process";

@injectable()
export class Operations {
    @inject(TYPES.Logger)
    private _logger: Log;

    /**
    * Copy one file from one place to another
    * @param file Name of the file
    * @param source Directory path where the file is located
    * @param destination Directory path where the file is to be copied
    */
    public copyFile(file: string, source: string, destination: string, isOptional: boolean = false): void {
        const sourcePath: string = path.join(source, file);
        const destinationPath: string = path.join(destination, file);

        if (io.existsSync(sourcePath)) {
            io.ensureDirSync(destination);
            io.copySync(sourcePath, destinationPath);
            this._logger.info(`[Copy] '${file}' to '${destination}'`);
        } else {
            if (isOptional) {
                this._logger.warn(`[Copy Ignored] File '${sourcePath}' doesn't exist`);
            } else {
                throw new Error(`[Copy FAIL] File '${sourcePath}' doesn't exist!!!`);
            }
        }
    }

    /**
    * Copy files based on a regex from one place to another
    * @param filter Regular expression
    * @param source Directory path where the file is located
    * @param destination Directory path where the file is to be copied
    */
    public copyFiles(filter: string, source: string, destination: string, isOptional: boolean = false): void {
        const result = this.filterFiles(filter, source);
        result.forEach(fileName => {
            this.copyFile(fileName, source, destination, isOptional);
        });
    }

    /**
     * Move a file from one location into another
     * @param file File to move
     * @param source Directory path where the file is located
     * @param destination Directory path where the file is to be moved
     */
    public moveFile(file: string, source: string, destination: string): void {
        const sourcePath: string = path.join(source, file);
        const destinationPath: string = path.join(destination, file);

        if (io.existsSync(sourcePath)) {
            io.ensureDirSync(destination);
            io.copySync(sourcePath, destinationPath);
            io.unlinkSync(sourcePath);
            this._logger.info(`[Move] '${file}' from '${source}' to '${destination}'`);
        } else {
            throw new Error(`[Move FAIL] File '${sourcePath}' doesn't exist!!!`);
        }
    }

    /**
     * Move files based on a regex one location into another
     * @param filter Regular expression
     * @param source Directory path where the file is located
     * @param destination Directory path where the file is to be moved
     */
    public moveFiles(filter: string, source: string, destination: string): void {
        const result = this.filterFiles(filter, source);
        result.forEach(fileName => {
            this.moveFile(fileName, source, destination);
        });
    }

    /**
     * Rename an existing file
     * @param source Full path of the original file
     * @param destination Full path of the destination file
     */
    public renameFile(source: string, destination: string): void {
        if (io.existsSync(source)) {
            io.moveSync(source, destination);
            this._logger.info(`[Rename] '${source}' to '${destination}'`);
        } else {
            throw new Error(`[Rename FAIL] File '${source}' doesn't exist!!!`);
        }
    }

    /**
     * Delete a file
     * @param filePath Path of the file
     */
    public deleteFile(filePath: string): void {
        if (io.existsSync(filePath)) {
            io.unlinkSync(filePath);
            this._logger.info(`[Deleted] '${filePath}'`);
        } else {
            this._logger.warn(`[Delete Ignored] '${filePath}'`);
        }
    }

    /**
     * Delete files based on a regular expression
     * @param filter Regular expression
     * @param filePath Path of the file
     */
    public deleteFiles(filter: string, filePath: string): void {
        const result = this.filterFiles(filter, filePath);
        result.forEach(fileName => {
            const fullPath = path.join(filePath, fileName);
            this.deleteFile(fullPath);
        });
    }

    public createFile(destination: string, contents: Buffer): void {
        const baseDirectory = path.dirname(destination);
        io.ensureDirSync(baseDirectory);
        io.writeFileSync(destination, contents, "utf8");
        this._logger.info(`[CreateFile] Created file '${destination}'`);
    }

    /**
     * Replaces a text from a file with another text
     * @param file Full path of the file
     * @param search Token to search
     * @param replace Token to replace
     */
    public replaceTextInFile(file: string, search: string, replace: string, isRegularExpression: boolean): void {
        if (io.existsSync(file) || search === "") {
            let contents = io.readFileSync(file, "utf8");
            let wasChanged: boolean = false;
            if (isRegularExpression === false) {
                let iPos = contents.indexOf(search);
                while (iPos > 0) {
                    this._logger.info(`[ReplaceText] '${search}' with '${replace}'`);
                    contents = contents.replace(search, replace);
                    wasChanged = true;
                    iPos = contents.indexOf(search);
                }
            } else {
                const previous = contents;
                contents = contents.replace(new RegExp(search, "g"), replace);
                wasChanged = contents !== previous;
                if (wasChanged) {
                    this._logger.info(`[ReplaceText] '${search}' with '${replace}'`);
                }
            }

            if (wasChanged) {
                io.writeFileSync(file, contents, "utf8");
            }

        } else {
            this._logger.warn(`[ReplaceText IGNORED] ReplaceText in '${file}' because it doesn't exist!!!`);
        }
    }

    /**
     * Remove from package.json all dependencies and dev dependencies
     * @param file Full path of the package.json file
     */
    public removeDependenciesFromPackageJson(file: string): void {
        const contents = JSON.parse(io.readFileSync(file, "utf8"));
        contents.scripts = {};
        contents.dependencies = {};
        contents.devDependencies = {};
        if (contents.cmfLinkDependencies != null) {
            contents.cmfLinkDependencies = undefined;
        }
        io.writeFileSync(file, JSON.stringify(contents, null, 2), "utf8");
        this._logger.info(`[Stripped Dependencies] '${file}'`);
    }

    /**
     * Change the version stated in a package.json file
     * @param file Full path of the package.json file
     * @param version Version to change to
     */
    public changePackageJsonVersion(file: string, version: string): void {
        const contents = JSON.parse(io.readFileSync(file, "utf8"));
        contents.version = version;
        io.writeFileSync(file, JSON.stringify(contents, null, 2), "utf8");
        this._logger.info(`[NewVersion] '${file}' (${version})`);
    }

    public setPackageJsonAsPacked(file: string): void {
        const contents = JSON.parse(io.readFileSync(file, "utf8"));
        if (contents.criticalManufacturing == null) {
            contents.criticalManufacturing = {};
        }
        contents.criticalManufacturing.isPacked = true;
        io.writeFileSync(file, JSON.stringify(contents, null, 2), "utf8");
        this._logger.info(`[IsPacked] '${file}' (true)`);
    }

    /**
     * Create a new Directory
     * @param directoryPath Full path of the directory to create
     */
    public createDirectory(directoryPath: string): void {
        if (io.existsSync(directoryPath)) {
            this._logger.warn(`[CreateDirectory Ignored] '${directoryPath}'`);
        } else {
            io.mkdirSync(directoryPath, 0o777);
            this._logger.info(`[CreateDirectory] '${directoryPath}'`);
        }
    }

    /**
     * Delete an entire directory, even if it is not empty
     * @param directoryPath Full path of the directory to delete
     */
    public deleteDirectory(directoryPath: string): void {
        if (io.existsSync(directoryPath)) {
            io.removeSync(directoryPath);
            this._logger.info(`[Deleted] '${directoryPath}'`);
        } else {
            this._logger.warn(`[Delete Ignored] '${directoryPath}'`);
        }
    }

    /**
     * Copy entire directory from one place to another
     * @param source Full path of the original directory
     * @param destination Full path of the destination directory
     */
    public copyDirectory (source: string, destination: string): void {
        if (io.existsSync(source)) {
            io.copySync(source, destination, {
                // recursive: true,
                overwrite: true,
                preserveTimestamps: true,
            });
            this._logger.info(`[CopyDirectory] '${source}' to '${destination}'`);
        } else {
            throw new Error(`[CopyDirectory FAIL] Directory '${source}' doesn't exist!!!`);
        }
    }

    /**
     * Run an external application
     * @param command Command to execute
     * @param args Arguments to pass to the command
     * @param cwd Directory where the command will run
     */
    public run(command: string, args: string[], cwd?: string): boolean {
        this._logger.info(`[Run] ${cwd != null ? cwd + "> " : ""}${command} ${args.join(" ")}`);
        const child = spawnSync(command, args, {
            cwd: cwd,
            shell: true
        });

        if (child.error != null) {
            throw (child.error);
        }

        if (child.stderr) {
            this._logger.warn(`[Run Err] ` + child.stderr.toString().trim());
        }

        if (child.stdout != null) {
            this._logger.info(`[Run Out] ` + child.stdout.toString().trim());
        }

        if (child.status !== 0) {
            throw new Error(`[Run FAIL] Failed to execute command '${command}'. ExitCode='${child.status}'`);
        }

        return (true);
    }

    /**
     * Utility function to convert ReadableStream<Uint8Array> to Buffer
     * @param readableStream ReadableStream to convert
     */
    public async readStreamToBuffer(
        readableStream: ReadableStream<Uint8Array>
    ): Promise<Buffer> {
        const reader = readableStream.getReader();
        const chunks: Uint8Array[] = [];
        let done = false;

        while (!done) {
        const { value, done: isDone } = await reader.read();
        if (value) {
            chunks.push(value);
        }
        done = isDone;
        }

        // Concatenate all chunks into a single Buffer
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const buffer = Buffer.concat(chunks, totalLength);
        return buffer;
    }

    /**
     * Utility function to convert ReadableStream<Uint8Array> to Buffer
     * @param urlToValidate String representing the url to validate
     */
    public isValidUrl(urlToValidate: string): boolean {
        let url;
        try {
            url = new URL(urlToValidate);
            if (url !== null && (url.protocol === "http:" || url.protocol === "https:")) {
                return true;
            }
        } catch (_) {
            return false;
        }
        return false;
    }

    /**
     * Filter files based on a regex
     * @param filter Regular expression to use as filter
     * @param dirPath The path to apply the filter to
     */
    private filterFiles(filter: string, dirPath: string): string[] {
        const regex = new RegExp(filter);
        return io
            .readdirSync(dirPath)
            .filter(file => {
                const fullPath = path.join(dirPath, file);
                return io.statSync(fullPath).isFile() && regex.test(file);
            });
    }
}
/* eslint-disable no-useless-escape */
import { container } from "./inversify.config";
import * as io from "fs-extra";
import * as path from "path";
import * as os from "node:os";
import { Configuration, Action, ActionType, Addon, ComponentType } from "./models/configuration";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ncc = require("@vercel/ncc");
import { DriverTemplatesProcessor } from "./processors/driverTemplates";
import { LibraryTemplatesProcessor } from "./processors/libraryTemplates";
import { TYPES } from "./types";
import { Paths } from "./processors/paths";
import { Log } from "./processors/log";
import { ShrinkwrapGenerator } from "./processors/shrinkwrapGenerator";
import { LibraryFontProcessor } from "./processors/libraryFont";
import { BusinessScenariosProcessor } from "./processors/businessScenarios";
import { Operations } from "./processors/operations";

export class PackagePacker {
    private _logger: Log;
    private _operations: Operations;

    public async go(options: { [name: string]: any }) {

        const source: string = options.i as string || options.input as string || process.cwd();
        const destination: string = options.o as string || options.output as string || "";
        let temp: string = options.t as string || options.temp as string || path.join(source, "__TEMP__");
        const configurationFile: string = options.c as string || options.config as string || path.join(source, "packConfig.json");
        const addons: string = options.a as string || options.addons as string;
        const version: string = options.v as string || options.version as string || "";
        const debug: boolean = options.d as boolean || options.debug as boolean || false;

        this._logger = container.get<Log>(TYPES.Logger);
        this._operations = container.get<Operations>(TYPES.Operations);

        const packageFile: string = path.join(path.dirname(__filename), "..", "package.json");
        const packageContent = io.readJSONSync(packageFile);
        this._logger.notice(`** Using Package Bundler version '${packageContent.version}' **`);
        this._logger.notice(``);

        this._logger.debug(`Using the following settings:`);
        this._logger.debug(`   Source        : ${source}`);
        this._logger.debug(`   Destination   : ${destination}`);
        this._logger.debug(`   Temporary     : ${temp}`);
        this._logger.debug(`   Configuration : ${configurationFile}`);
        this._logger.debug(`   Addons        : ${addons}`);
        this._logger.debug(`   Version       : ${version}`);
        this._logger.debug(`   Debug Mode    : ${debug}`);
        this._logger.debug("");

        // Sanity checks
        if (!io.existsSync(source)) {
            this._logger.error(`Source directory '${source}' doesn't exist!`);
            process.exit(1);
        }

        if (!io.existsSync(configurationFile)) {
            this._logger.error(`Configuration file '${configurationFile}' doesn't exist!`);
            this._logger.error(`This package will not packed!`);
            process.exit(2);
        }

        if (addons != null && addons !== "" && !io.existsSync(addons)) {
            this._logger.error(`Addons location '${addons}' doesn't exist!`);
            process.exit(1);
        }

        const paths = container.get<Paths>(TYPES.Paths);
        paths.setup(source, destination, temp, addons);

        const configuration: Configuration = JSON.parse(io.readFileSync(configurationFile, "utf8"));

        // Prepare temp Directory
        if (configuration.type === ComponentType.TasksPackage) {
            temp = io.readJSONSync(path.join(source, "ng-package.json")).dest;

            if (!io.existsSync(temp)) {
                this._logger.error(`'${temp}' doesn't exist! Did you forget to run 'ng build'?`);
                process.exit(1);
            }
            this._logger.warn(`Temporary directory changed to '${temp}'`);
        } else {
            this._operations.deleteDirectory(temp);
            this._operations.createDirectory(temp);
        }

        const main: string = io.readJSONSync(path.join(source, "package.json"))?.main;
        const mainSplitted: string[] = main?.split("/");
        const index = mainSplitted?.[mainSplitted.length - 1];
        mainSplitted?.pop();
        const srcDirectory = mainSplitted?.join("/") ?? "src";

        // Pack package
        const packs = configuration.packs || [];
        if (packs.length === 0) {
            switch (configuration.type) {
                case ComponentType.TasksPackage:
                    packs.push({
                        directory: srcDirectory,
                        source: "public-api-runtime.js",
                        destination: index,
                    });
                    break;
                case ComponentType.BusinessScenario:
                    break;
                default:
                    packs.push({
                        directory: srcDirectory,
                        source: index,
                        destination: index,
                    });
            }
        }

        for (const pack of packs) {
            await this.packPackage(
                path.join(source, pack.directory),
                pack.source || "index.js",
                temp,
                pack.destination || "index.js");
        }

        if (configuration.type !== ComponentType.TasksPackage) {
            // Copy necessary files to generate package

            if (!io.existsSync("npm-shrinkwrap.json")) {
                this._logger.warn("npm-shrinkwrap.json file not found. Trying to generate it...");
                container.get<ShrinkwrapGenerator>(TYPES.Processors.ShrinkwrapGenerator).process(source, "npm-shrinkwrap.json");
            }

            this._operations.copyFile("npm-shrinkwrap.json", source, temp, true);
            this._operations.copyFile(".npmignore", source, temp, true);
            this._operations.copyFile(".npmrc", source, temp, true);
            this._operations.copyFile("README.md", source, temp);
            this._operations.copyFile("package.json", source, temp);

            // normalize package.json main
            const packageJSONTemp = io.readJSONSync(path.join(temp, "package.json"));
            packageJSONTemp.main = "src/index.js";

            io.writeJSONSync(path.join(temp, "package.json"), packageJSONTemp);
        }

        if (configuration.type === ComponentType.TasksPackage) {
            this._operations.deleteFile(path.join(source, "src", "index.js"));
        }

        this._operations.setPackageJsonAsPacked(path.join(temp, "package.json"));
        if (version != null && version !== "") {
            this._operations.changePackageJsonVersion(path.join(temp, "package.json"), version);
        }

        // TasksPackages must have the dependencies for the GUI. All others, clear them
        if (configuration.type !== ComponentType.TasksPackage) {
            this._operations.removeDependenciesFromPackageJson(path.join(temp, "package.json"));
        }

        // Copy .node files (Addons)
        (configuration.addons || []).forEach((addon: Addon) => {
            const sourceAddonDir: string = path.join(/*mappedAddons ||*/ addons, addon.name, addon.version);
            const destinationAddonDir: string = path.join(temp, "addons", addon.name);
            this._operations.createDirectory(path.join(temp, "addons"));
            this._operations.createDirectory(destinationAddonDir);

            for (const addonFile of this.findByExtension(sourceAddonDir, addon.fileMask)) {
                this._operations.copyFile(addonFile, sourceAddonDir, destinationAddonDir);
            }
        });

        // Process any template action
        if (configuration.templates != null) {
            const destinationTemplates = path.join(temp, "package.json");

            switch (configuration.type) {
                case ComponentType.Component:
                    container.get<DriverTemplatesProcessor>(TYPES.Processors.DriverTemplates).process(configuration.templates, destinationTemplates);
                    break;
                case ComponentType.TasksPackage:
                case ComponentType.TasksLibrary:
                    await container.get<LibraryTemplatesProcessor>(TYPES.Processors.LibraryTemplates).process(configuration.templates, destinationTemplates);
                    break;
            }
        }

        // Process any business Scenarios
        if (configuration.businessScenarios != null) {
            const destinationBusinessScenarios = path.join(temp, "package.json");

            switch (configuration.type) {
                case ComponentType.TasksPackage:
                case ComponentType.TasksLibrary:
                case ComponentType.BusinessScenario:
                    await container.get<BusinessScenariosProcessor>(TYPES.Processors.LibraryBusinessScenarios).process(configuration.businessScenarios, destinationBusinessScenarios);
                    break;
            }
        }

        // Process any font action
        if (configuration.font != null) {
            const destinationFont = path.join(temp, "package.json");

            if (configuration.type === ComponentType.TasksLibrary || configuration.type === ComponentType.TasksPackage) {
                container.get<LibraryFontProcessor>(TYPES.Processors.LibraryFontProcessor).process(configuration.font, destinationFont);
            }
        }

        // process Post actions
        (configuration.postActions || []).forEach((action: Action) => {
            const actionSource: string = (action.source || "")
                .replace("${Source}", source)
                .replace("${Temp}", temp)
                .replace("${Destination}", destination)
                .replace("${Addons}", addons);

            const actionDestination: string = (action.destination || "")
                .replace("${Source}", source)
                .replace("${Temp}", temp)
                .replace("${Destination}", destination)
                .replace("${Addons}", addons);

            switch (action.type) {
                case ActionType.DeleteFile: this._operations.deleteFile(actionSource); break;
                case ActionType.DeleteDirectory: this._operations.deleteDirectory(actionSource); break;
                case ActionType.CopyDirectory: this._operations.copyDirectory(actionSource, actionDestination); break;
                case ActionType.CopyFile: this._operations.copyFile(action.file || "", actionSource, actionDestination); break;
                case ActionType.MoveFile: this._operations.moveFile(action.file || "", actionSource, actionDestination); break;
                case ActionType.RenameFile: this._operations.renameFile(actionSource, actionDestination); break;
                case ActionType.ReplaceText: this._operations.replaceTextInFile(actionSource, action.search || "", action.replace || "", action.isRegularExpression || false); break;
            }
        });

        // Place index.js into src directory
        this._operations.createDirectory(path.join(temp, "src"));
        if (configuration.type === ComponentType.TasksPackage) {
            this._operations.moveFile("index.js", temp, path.join(temp, "src"));
        } else {
            for (const pack of packs) {
                // Fix issue with nconf
                // https://github.com/zeit/ncc/issues/451
                ["argv", "env", "file", "literal", "memory"].forEach((toFix: string) => {
                    this._operations.replaceTextInFile(path.join(temp, pack.destination || "index.js"), `arg === \"${toFix}.js\"`, `arg === \"${toFix}\"`, false);
                });

                this._operations.moveFile(pack.destination || "index.js", temp, path.join(temp, "src"));
            }
        }

        // Create Package and place it in the destination
        if (destination !== "") {
            this._operations.createDirectory(destination);

            if (os.platform() === "win32") {
                this._operations.run("npm.cmd", ["pack"], temp);
            } else {
                this._operations.run("npm", ["pack"], temp);
            }
            for (const packedPackage of this.findByExtension(temp, "*.tgz")) {
                this._operations.moveFile(packedPackage, temp, destination);
            }
        }


        // Delete temp
        if (debug === false) {
            this._operations.deleteDirectory(temp);
        } else {
            this._logger.warn(`Directory '${temp}' was *NOT* deleted`);
        }

        this._logger.info("");
        this._logger.success("** Finished **");
    }

    /**
     * Retrieves a list of files that math a glob
     * @param searchPath Full path to search
     * @param extension Glob expression
     */
    private findByExtension(searchPath: string, extension: string, basePath?: string): string | string[] {
        if (extension.startsWith("*.")) {
            extension = extension.substring(1);
        }

        basePath = basePath ?? "";

        const result: string[] = [];
        const files = io.readdirSync(searchPath);

        for (const file of files) {
            const filename = path.join(searchPath, file);
            const stat = io.lstatSync(filename);

            if (stat.isDirectory()) {
                result.push(...this.findByExtension(filename, extension, basePath + `/${path.basename(filename)}`));
            } else if (filename.endsWith(extension) || extension === "*") {
                result.push(path.join(basePath, path.basename(filename)));
            }
        }

        return (result);
    }

    /**
     * Execute ncc over a selected file to bundle it
     * @param SourceDirectory Directory where the file is
     * @param sourceFile name of the file to bundle
     * @param destinationDirectory Destination where to save the result
     * @param destinationFile Name of the final bundled file
     */
    private async packPackage(SourceDirectory: string, sourceFile: string, destinationDirectory: string, destinationFile: string): Promise<void> {
        const nccInput: string = path.join(SourceDirectory, sourceFile);
        const nccOptions: any = { minify: false, sourceMap: false, sourceMapRegister: false, quiet: true };
        const { code, assets } = await ncc(nccInput, nccOptions);

        for (const [assetName, assetCode] of Object.entries(assets)) {
            const assetSize = Math.round(
                Buffer.byteLength(((assetCode as any).source as Buffer), "utf8") / 1024
            );

            this._operations.createFile(path.join(destinationDirectory, assetName), ((assetCode as any).source as Buffer));
            this._logger.notice(`[PACKED ASSET] ${assetSize}Kb \t ${assetName} `);
        }

        // await this.sleep(5000);

        const codeSize = Math.round(Buffer.byteLength(code, "utf8") / 1024);
        // const mapSize = map ? Math.round(Buffer.byteLength(map, "utf8") / 1024) : 0;

        this._operations.createFile(path.join(destinationDirectory, destinationFile), code);
        this._logger.notice(`[PACK RESULT] ${codeSize}Kb \t ${destinationFile}`);
    }

    /**
     * Sleep for a moment before continuing to the next instruction
     * @param ms Number of milliseconds to sleep
     */
    private sleep(ms: number): Promise<any> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

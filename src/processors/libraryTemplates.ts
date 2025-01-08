import { Template, TemplateType } from "../models/template";
import { LibraryConverter, LibraryConverterDefaults, LibraryMetadata, LibraryTask, LibraryTaskDefaults } from "../models/library";

import { Log } from "./log";
import { Transpiler } from "./transpiler";
import * as io from "fs-extra";
import * as path from "path";
import { inject, injectable } from "inversify";
import { TYPES } from "../types";
import { Paths } from "./paths";

@injectable()
export class LibraryTemplatesProcessor {

    @inject(TYPES.Logger)
    private _logger: Log;
    @inject(TYPES.Paths)
    private _paths: Paths;
    @inject(TYPES.Transpiler)
    private _transpiler: Transpiler;

    private _finalTemplates: LibraryMetadata = {};
    private _templateDirectory: string;

    public async process(templateRules: string | Template[], destination: string): Promise<void> {
        this._logger.info(` [Templates] Processing library templates`);
        const json: any = io.readJSONSync(destination);

        if (json?.criticalManufacturing?.tasksLibrary == null) {
            throw new Error("Unable to read TasksLibrary section of the package.json file");
        }

        const libraryMetadata: any = json.criticalManufacturing.tasksLibrary;

        this._finalTemplates = libraryMetadata.metadata ?? {};
        if (this._finalTemplates != null && ((this._finalTemplates.converters?.length ?? 0) !== 0 || (this._finalTemplates.tasks?.length ?? 0) !== 0)) {
            this._logger.warn(" [Templates] Existing templates found in the package.json file found. Merging the new ones with the existing");
        }

        // Prepare the initial object
        this._finalTemplates.converters = this._finalTemplates.converters ?? [];
        this._finalTemplates.tasks = this._finalTemplates.tasks ?? [];

        if (typeof templateRules === "string") {
            // Assume a path!
            templateRules = this._paths.transform(templateRules);

            if (!io.existsSync(templateRules)) {
                throw new Error(` [Templates] Directory '${templateRules}' doesn't exist`);
            } else {
                this._templateDirectory = templateRules;

                const files = io.readdirSync(templateRules);
                for (const file of files) {
                    if (file.endsWith(".json")) {
                        await this.merge(path.join(templateRules, file));
                    }
                }

            }
        } else {
            // Process each template entry
            for (const templateRule of templateRules) {
                switch (templateRule.type) {
                    case TemplateType.Index:
                        await this.processIndex(this._paths.transform(templateRule.source));
                        break;
                    case TemplateType.Template:
                        await this.merge(this._paths.transform(templateRule.source));
                        break;
                }
            }
        }

        libraryMetadata.metadata = this._finalTemplates;
        io.writeFileSync(destination, JSON.stringify(json, null, 2), "utf8");
    }

    /**
     * Use an index file with an array of files to process
     * using the index as order:
     * [
     *    "first.json",
     *    "second.json"
     * ]
     * @param indexFile The json file with the array of files
     */
    private async processIndex(indexFile: string): Promise<void> {
        const indexPath = path.dirname(indexFile);

        // read array with files
        const files: string[] = io.readJSONSync(indexFile);
        if (!Array.isArray(files)) {
            this._logger.error(` [Templates] Index file '${indexFile}' doesn't contain an array of files to process!`);
        } else {
            for (const file of files) {
                await this.merge(path.join(indexPath, file));
            }
        }
    }

    private async merge(templateFile: string): Promise<void> {
        this._logger.info(` [Templates] Merging '${templateFile}'`);

        const newTemplates: LibraryMetadata = io.readJSONSync(templateFile);
        if (newTemplates != null) {
            this._logger.debug(` [Templates] Merging Tasks & Converters '${templateFile}'`);
            await this.mergeConverters(newTemplates.converters ?? []);
            this._logger.debug(` [Templates] Merged Converters '${templateFile}'`);
            await this.mergeTasks(newTemplates.tasks ?? []);
            this._logger.debug(` [Templates] Merged Tasks '${templateFile}'`);
        }
        this._logger.debug(` [Templates] Merged '${templateFile}'`);
    }

    private async mergeConverters(converters: LibraryConverter[]): Promise<void> {
        converters.forEach(converter => {
            const newOne = Object.assign({}, LibraryConverterDefaults, converter);

            // Check if there is another with the same name
            const existing = (this._finalTemplates.converters ?? []).find(c => c.name === newOne.name);
            if (existing != null) {
                const existingJson = JSON.stringify(existing);
                const newOneJson = JSON.stringify(newOne);
                if (existingJson !== newOneJson) {
                    this._logger.warn(` [Templates]   Overwriting converter '${newOne.displayName ?? newOne.name}' with a new one`);

                    Object.assign(existing, newOne);
                }
            } else {
                // New one, so simply add it into the array
                this._finalTemplates.converters?.push(newOne);
                this._logger.info(` [Templates]   Found new converter '${newOne.displayName ?? newOne.name}'`);
            }
        });
    }

    private async mergeTasks(tasks: LibraryTask[]): Promise<void> {
        for (const task of tasks) {
            const newOne = /*await this.preProcessTaskScripts*/(Object.assign({}, LibraryTaskDefaults, task));
            await this._transpiler.preProcessTaskScripts(this._templateDirectory, newOne);

            // Check if there is another with the same name
            const existing = (this._finalTemplates.tasks ?? []).find(c => c.name === newOne.name);
            if (existing != null) {
                const existingJson = JSON.stringify(existing);
                const newOneJson = JSON.stringify(newOne);

                if (existingJson !== newOneJson) {
                    this._logger.warn(` [Templates]   Overwriting task '${newOne.displayName ?? newOne.name}' with a new one`);

                    Object.assign(existing, newOne);
                }
            } else {
                // New one, so simply add it into the array
                this._finalTemplates.tasks?.push(newOne);
                this._logger.info(` [Templates]   Found new task '${newOne.displayName ?? newOne.name}'`);
            }
        }
    }
}
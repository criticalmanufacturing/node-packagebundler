import { expect } from "chai";
import * as io from "fs-extra";
import * as os from "node:os";
import * as path from "path";

import { PackagePacker } from "../src/packagePacker";

describe("PackagePacker TasksPackage", () => {
    let workspace: string;
    let source: string;
    let staging: string;

    beforeEach(() => {
        workspace = io.mkdtempSync(path.join(os.tmpdir(), "iot-package-"));
        source = path.join(workspace, "projects", "tasks");
        staging = path.join(workspace, "staging");
        io.outputJsonSync(path.join(source, "package.json"), { name: "tasks", version: "1.0.0" });
        io.outputJsonSync(path.join(source, "packConfig.json"), { type: "TasksPackage" });
        io.outputFileSync(path.join(source, "src", "public-api-runtime.js"), 'module.exports = "fixture-runtime";');
    });

    afterEach(() => {
        io.removeSync(workspace);
    });

    function writeWorkspace(buildOptions = {}, development = {}) {
        io.writeJsonSync(path.join(workspace, "angular.json"), {
            projects: {
                other: { projectType: "library", root: "projects/other" },
                "tasks-project": {
                    projectType: "library",
                    root: "projects/tasks",
                    architect: {
                        build: {
                            builder: "@angular/build:library",
                            defaultConfiguration: "production",
                            options: buildOptions,
                            configurations: {
                                production: { outputPath: "production-output" },
                                development
                            }
                        }
                    }
                }
            }
        });
    }

    async function assertPackedFrom(dist: string) {
        const exports = {
            ".": "./fesm2022/tasks.mjs",
            "./metadata": "./fesm2022/tasks-metadata.mjs"
        };
        io.outputJsonSync(path.join(dist, "package.json"), { name: "tasks", version: "1.0.0", exports });
        io.outputFileSync(path.join(dist, exports["."]), "export const designer = true;");
        io.outputFileSync(path.join(dist, exports["./metadata"]), "export const metadata = true;");

        await new PackagePacker().go({ input: source, temp: staging, debug: true });

        const manifest = io.readJsonSync(path.join(staging, "package.json"));
        expect(manifest.criticalManufacturing.isPacked).to.equal(true);
        expect(manifest.exports).to.deep.equal(exports);
        expect(io.readFileSync(path.join(staging, manifest.exports["."]), "utf8"))
            .to.equal("export const designer = true;");
        expect(io.readFileSync(path.join(staging, manifest.exports["./metadata"]), "utf8"))
            .to.equal("export const metadata = true;");
        expect(require(path.join(staging, "src", "index.js"))).to.equal("fixture-runtime");
    }

    it("uses the legacy dest relative to the task package when both formats exist", async () => {
        writeWorkspace();
        io.writeJsonSync(path.join(source, "ng-package.json"), { dest: "../../legacy-output" });

        await assertPackedFrom(path.join(workspace, "legacy-output"));
    });

    it("uses the workspace-relative Angular development output path", async () => {
        writeWorkspace({ outputPath: "base-output" }, { outputPath: "custom-output/tasks" });

        await assertPackedFrom(path.join(workspace, "custom-output", "tasks"));
    });

    it("uses dist/<project-name> when Angular has no development outputPath", async () => {
        writeWorkspace();

        await assertPackedFrom(path.join(workspace, "dist", "tasks-project"));
    });
});

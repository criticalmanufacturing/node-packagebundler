import "reflect-metadata";

import * as io from "fs-extra";
import * as os from "node:os";
import * as path from "path";
import * as sinon from "sinon";
import chai = require("chai");
import { container } from "../src/inversify.config";
import { packAndValidate, validatePackageFiles } from "../src/packageValidation";
import { Operations } from "../src/processors/operations";
import { TYPES } from "../src/types";

const expect = chai.expect;

describe("final package file validation", () => {
    it("reports both missing required files and files outside the allowlist", () => {
        expect(() => validatePackageFiles(["package.json", "src/index.js"], {
            allowedFiles: ["package.json"],
            requiredFiles: ["src/index.js", "nonExisting.js"]
        })).to.throw("Unexpected files:\n  src/index.js\nMissing required files:\n  nonExisting.js");
    });

    it("accepts exact paths and recursive globs, including dotfiles", () => {
        expect(() => validatePackageFiles(["package.json", "src/index.js", "addons/.config", "addons/sub/driver.node"], {
            allowedFiles: ["package.json", "src/**", "addons/**"],
            requiredFiles: ["src/index.js", "addons/**/*.node"]
        })).not.to.throw();
    });

    it("normalizes Windows separators but matches names case-sensitively", () => {
        expect(() => validatePackageFiles(["package.json", "src\\index.js"], {
            allowedFiles: ["package.json", "src/index.js"],
            requiredFiles: ["src\\index.js"]
        })).not.to.throw();
        expect(() => validatePackageFiles(["package.json", "src/index.js"], {
            allowedFiles: ["package.json", "Src/**"],
            requiredFiles: ["SRC/index.js"]
        })).to.throw("Missing required files:\n  SRC/index.js");
    });

    it("reports unexpected and missing entries in stable order", () => {
        expect(() => validatePackageFiles(["z.txt", "package.json", "a.txt"], {
            allowedFiles: ["package.json"],
            requiredFiles: ["z-required.txt", "a-required.txt"]
        })).to.throw("Unexpected files:\n  a.txt\n  z.txt\nMissing required files:\n  a-required.txt\n  z-required.txt");
    });

    it("checks the final npm manifest and removes a rejected archive before moving it", () => {
        const temp = io.mkdtempSync(path.join(os.tmpdir(), "bundler-validation-"));
        const archiveName = "example-1.0.0.tgz";
        const archive = path.join(temp, archiveName);
        const operations = sinon.createStubInstance(Operations);
        try {
            io.writeFileSync(archive, "archive");
            operations.runAndCapture.returns(JSON.stringify([{
                filename: archiveName,
                files: [{ path: "package.json" }, { path: "src/index.js" }]
            }]));

            expect(() => packAndValidate(operations, temp, path.join(temp, "out"), {
                allowedFiles: ["package.json", "src/index.js"],
                requiredFiles: ["nonExisting.js"]
            })).to.throw("nonExisting.js");
            expect(operations.runAndCapture.calledOnce).to.be.true;
            expect(operations.runAndCapture.firstCall.args[1]).to.deep.equal(["pack", "--json"]);
            expect(operations.moveFile.called).to.be.false;
            expect(io.existsSync(archive)).to.be.false;
        } finally {
            io.removeSync(temp);
        }
    });

    it("validates without an output directory and discards the temporary archive", () => {
        const temp = io.mkdtempSync(path.join(os.tmpdir(), "bundler-validation-"));
        const archiveName = "example-1.0.0.tgz";
        const archive = path.join(temp, archiveName);
        const operations = sinon.createStubInstance(Operations);
        try {
            io.writeFileSync(archive, "archive");
            operations.runAndCapture.returns(JSON.stringify([{
                filename: archiveName,
                files: [{ path: "package.json" }]
            }]));

            packAndValidate(operations, temp, "", { allowedFiles: ["package.json"] });
            expect(operations.moveFile.called).to.be.false;
            expect(io.existsSync(archive)).to.be.false;
        } finally {
            io.removeSync(temp);
        }
    });

    it("moves a valid archive to the output directory", () => {
        const temp = io.mkdtempSync(path.join(os.tmpdir(), "bundler-validation-"));
        const archiveName = "example-1.0.0.tgz";
        const operations = sinon.createStubInstance(Operations);
        const destination = path.join(temp, "out");
        try {
            io.writeFileSync(path.join(temp, archiveName), "archive");
            operations.runAndCapture.returns(JSON.stringify([{
                filename: archiveName,
                files: [{ path: "package.json" }, { path: "src/index.js" }]
            }]));

            packAndValidate(operations, temp, destination, {
                allowedFiles: ["package.json", "src/index.js"],
                requiredFiles: ["src/index.js"]
            });
            expect(operations.createDirectory.calledOnceWithExactly(destination)).to.be.true;
            expect(operations.moveFile.calledOnceWithExactly(archiveName, temp, destination)).to.be.true;
        } finally {
            io.removeSync(temp);
        }
    });

    it("rejects an incomplete npm manifest", () => {
        const operations = sinon.createStubInstance(Operations);
        operations.runAndCapture.returns(JSON.stringify([{ filename: "example.tgz" }]));
        expect(() => packAndValidate(operations, "unused", "", { allowedFiles: ["package.json"] }))
            .to.throw("incomplete file manifest");
    });

    it("checks the files npm actually packs", function () {
        this.timeout(20000);
        const temp = io.mkdtempSync(path.join(os.tmpdir(), "bundler-validation-npm-"));
        try {
            io.writeJSONSync(path.join(temp, "package.json"), {
                name: "bundler-validation-example", version: "1.0.0", main: "src/index.js"
            });
            io.ensureDirSync(path.join(temp, "src"));
            io.writeFileSync(path.join(temp, "src", "index.js"), "module.exports = 1;\n");
            io.writeFileSync(path.join(temp, "extra.txt"), "extra\n");
            const operations = container.get<Operations>(TYPES.Operations);

            expect(() => packAndValidate(operations, temp, "", {
                allowedFiles: ["package.json", "src/index.js"],
                requiredFiles: ["src/index.js", "nonExisting.js"]
            })).to.throw("Unexpected files:\n  extra.txt\nMissing required files:\n  nonExisting.js");
            expect(io.readdirSync(temp).some(file => file.endsWith(".tgz"))).to.be.false;

            const output = path.join(temp, "output");
            packAndValidate(operations, temp, output, {
                allowedFiles: ["package.json", "src/index.js", "extra.txt"],
                requiredFiles: ["src/index.js"]
            });
            expect(io.readdirSync(output).some(file => file.endsWith(".tgz"))).to.be.true;
        } finally {
            io.removeSync(temp);
        }
    });
});

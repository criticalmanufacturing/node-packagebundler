import "reflect-metadata";

import * as io from "fs-extra";
import * as sinon from "sinon";
import chai = require("chai");
import chaiAsPromised = require("chai-as-promised");
import { container } from "../src/inversify.config";
import { PackagePacker } from "../src/packagePacker";
import { validatePackageValidationConfiguration } from "../src/packageValidationConfiguration";
import { Log } from "../src/processors/log";
import { Operations } from "../src/processors/operations";
import { TYPES } from "../src/types";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("packageValidation configuration", () => {
    it("allows existing configs to omit the section", () => {
        expect(() => validatePackageValidationConfiguration(undefined)).not.to.throw();
    });

    it("accepts exact paths and recursive patterns with optional required files", () => {
        expect(() => validatePackageValidationConfiguration({
            allowedFiles: ["package.json", "opentelemetry/**"],
            requiredFiles: ["package.json", "src/**"]
        })).not.to.throw();
        expect(() => validatePackageValidationConfiguration({ allowedFiles: ["package.json"] })).not.to.throw();
        expect(() => validatePackageValidationConfiguration({ allowedFiles: ["package.json"], requiredFiles: [] })).not.to.throw();
    });

    it("rejects a section that is not an object", () => {
        for (const value of [null, [], "package.json"]) {
            expect(() => validatePackageValidationConfiguration(value)).to.throw("packageValidation must be an object");
        }
    });

    it("rejects missing, empty, or invalid allowed files", () => {
        for (const value of [
            {},
            { allowedFiles: [] },
            { allowedFiles: "package.json" },
            { allowedFiles: ["package.json", " "] },
            { allowedFiles: ["package.json", null] }
        ]) {
            expect(() => validatePackageValidationConfiguration(value)).to.throw("packageValidation.allowedFiles");
        }
    });

    it("rejects invalid required files when supplied", () => {
        for (const requiredFiles of [null, "src/index.js", ["src/index.js", ""], [42]]) {
            expect(() => validatePackageValidationConfiguration({ allowedFiles: ["package.json"], requiredFiles }))
                .to.throw("packageValidation.requiredFiles");
        }
    });

    it("rejects malformed configuration before preparing the temp directory", async () => {
        container.snapshot();
        try {
            const logStub = sinon.createStubInstance(Log);
            const operationsStub = sinon.createStubInstance(Operations);
            container.rebind<Log>(TYPES.Logger).toConstantValue(logStub);
            container.rebind<Operations>(TYPES.Operations).toConstantValue(operationsStub);

            sinon.stub(io, "existsSync").returns(true);
            sinon.stub(io, "readJSONSync").returns({ version: "1.1.0" });
            sinon.stub(io, "readFileSync").returns(JSON.stringify({
                type: "Component",
                packageValidation: { allowedFiles: [] }
            }));

            await expect(new PackagePacker().go({ i: "source", c: "packConfig.json" }))
                .to.be.rejectedWith("packageValidation.allowedFiles");
            expect(operationsStub.deleteDirectory.called).to.be.false;
        } finally {
            sinon.restore();
            container.restore();
        }
    });
});

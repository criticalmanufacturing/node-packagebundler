import "reflect-metadata";

import * as sinon from "sinon";

import { Container } from "inversify";
import * as path from "path";
import * as io from "fs-extra";
import { Log } from "./../src/processors/log";
import { Operations } from "./../src/processors/operations"
import { TYPES } from "../src/types";

import chai = require("chai");
import chaiAsPromised = require("chai-as-promised");

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("Operations", () => {
    let container: Container;
    let operations: Operations;

    // Mocked dependencies
    let logStub: sinon.SinonStubbedInstance<Log>;

    beforeEach(() => {
        container = new Container();
        // Create mocks
        logStub = sinon.createStubInstance(Log);
        // Bind mocks to the container
        container.bind<Log>(TYPES.Logger).toConstantValue(logStub);
        // Bind the processor
        container.bind<Operations>(Operations).toSelf();

        // Get an instance of the processor
        operations = container.get(Operations);
    });

    afterEach(() => {
        sinon.restore();
    });


    describe("replaceTextInFile", () => {
        const testFilePath = "test.txt";

        let existsSyncStub: sinon.SinonStub;
        let readFileSyncStub: sinon.SinonStub;
        let writeFileSyncStub: sinon.SinonStub;

        beforeEach(() => {
            existsSyncStub = sinon.stub(io, "existsSync");
            readFileSyncStub = sinon.stub(io, "readFileSync");
            writeFileSyncStub = sinon.stub(io, "writeFileSync");
        });

        afterEach(() => {
            sinon.restore();
        });

        it("should replace plain text when isRegularExpression=false", () => {
            existsSyncStub.returns(true);
            readFileSyncStub.returns("Hello World! Hello!");

            operations.replaceTextInFile(testFilePath, "Hello", "Hi", false);

            expect(writeFileSyncStub.calledOnce).to.be.true;
            expect(writeFileSyncStub.firstCall.args[1]).to.equal("Hi World! Hi!");
            expect(logStub.info.calledWith(`[ReplaceText] 'Hello' with 'Hi'`)).to.be.true;
        });

        it("should replace using regular expression when isRegularExpression=true", () => {
            existsSyncStub.returns(true);
            readFileSyncStub.returns("const binding = __nccwpck_require__(456789)(dir);");

            operations.replaceTextInFile(testFilePath,
                    "const binding = __nccwpck_require__\\(\\d*\\)\\(dir\\);",
                    "const binding = exports = module.exports = require(__nccwpck_require__.ab + \"/../lib/noble/binding.node\"",
                    true);

            expect(writeFileSyncStub.calledOnce).to.be.true;
            expect(writeFileSyncStub.firstCall.args[1]).to.equal("const binding = exports = module.exports = require(__nccwpck_require__.ab + \"/../lib/noble/binding.node\"");
            expect(logStub.info.calledWith(`[ReplaceText] 'const binding = __nccwpck_require__\\(\\d*\\)\\(dir\\);' with 'const binding = exports = module.exports = require(__nccwpck_require__.ab + "/../lib/noble/binding.node"'`)).to.be.true;
        });

        it("should warn and not write if search token is not found", () => {
            existsSyncStub.returns(true);
            readFileSyncStub.returns("Nothing to replace here");

            operations.replaceTextInFile(testFilePath, "Hello", "Hi", false);

            expect(writeFileSyncStub.called).to.be.false;
            expect(logStub.warn.calledWith(
                `[ReplaceText IGNORED] ReplaceText in '${testFilePath}': 'Hello' to 'Hi' no match was found`
            )).to.be.true;
        });

        it("should warn if file does not exist", () => {
            existsSyncStub.returns(false);

            operations.replaceTextInFile(testFilePath, "Hello", "Hi", false);

            expect(writeFileSyncStub.called).to.be.false;
            expect(logStub.warn.calledWith(
                `[ReplaceText IGNORED] ReplaceText in '${testFilePath}' because it doesn't exist!!!`
            )).to.be.true;
        });
    });

    describe("deleteFiles", () => {
        const testDir = "/some/path";
        const filter = ".*\\.txt$"; // matches .txt files

        let existsSyncStub: sinon.SinonStub;
        let readdirSyncStub: sinon.SinonStub;
        let statSyncStub: sinon.SinonStub;
        let unlinkSyncStub: sinon.SinonStub;

        beforeEach(() => {
            existsSyncStub = sinon.stub(io, "existsSync").returns(true);
            readdirSyncStub = sinon.stub(io, "readdirSync");
            statSyncStub = sinon.stub(io, "statSync");
            unlinkSyncStub = sinon.stub(io, "unlinkSync");
        });

        afterEach(() => {
            sinon.restore();
        });

        it("should delete all files matching the filter", () => {
            const files = ["a.txt", "b.txt", "c.js"];
            readdirSyncStub.returns(files);
            statSyncStub.callsFake((filePath: string) => ({
                isFile: () => !filePath.endsWith(".js") // only .txt are files for deletion
            }));

            operations.deleteFiles(filter, testDir);

            expect(unlinkSyncStub.calledTwice).to.be.true;
            expect(unlinkSyncStub.firstCall.args[0]).to.equal(path.join(testDir, "a.txt"));
            expect(unlinkSyncStub.secondCall.args[0]).to.equal(path.join(testDir, "b.txt"));

            expect(logStub.info.calledWith(`[Deleted] '${path.join(testDir, "a.txt")}'`)).to.be.true;
            expect(logStub.info.calledWith(`[Deleted] '${path.join(testDir, "b.txt")}'`)).to.be.true;
        });

        it("should warn if no files match the filter", () => {
            readdirSyncStub.returns(["file1.js", "file2.css"]);
            statSyncStub.callsFake((filePath: string) => ({
                isFile: () => true
            }));

            operations.deleteFiles(filter, testDir);

            expect(unlinkSyncStub.called).to.be.false;
            expect(logStub.warn.calledWith(
                `[Delete Ignored] No files found with '${filter}' for '${path}'`
            )).to.be.true;
        });
    });

    describe("moveFiles", () => {
        const testDir = "/source";
        const destDir = "/dest";
        const filter = ".*\\.txt$";

        let existsSyncStub: sinon.SinonStub;
        let readdirSyncStub: sinon.SinonStub;
        let statSyncStub: sinon.SinonStub;
        let copySyncStub: sinon.SinonStub;
        let unlinkSyncStub: sinon.SinonStub;
        let ensureDirSyncStub: sinon.SinonStub;

        beforeEach(() => {
            existsSyncStub = sinon.stub(io, "existsSync").returns(true);
            readdirSyncStub = sinon.stub(io, "readdirSync");
            statSyncStub = sinon.stub(io, "statSync");
            copySyncStub = sinon.stub(io, "copySync");
            unlinkSyncStub = sinon.stub(io, "unlinkSync");
            ensureDirSyncStub = sinon.stub(io, "ensureDirSync");
        });

        afterEach(() => {
            sinon.restore();
        });

        it("should move files matching the filter", () => {
            const files = ["file1.txt", "file2.txt", "file3.js"];
            readdirSyncStub.returns(files);
            statSyncStub.callsFake(filePath => ({ isFile: () => !filePath.endsWith(".js") }));

            operations.moveFiles(filter, testDir, destDir);

            expect(copySyncStub.calledTwice).to.be.true;
            expect(unlinkSyncStub.calledTwice).to.be.true;
            expect(logStub.info.calledWith(`[Move] 'file1.txt' from '${testDir}' to '${destDir}'`)).to.be.true;
            expect(logStub.info.calledWith(`[Move] 'file2.txt' from '${testDir}' to '${destDir}'`)).to.be.true;
        });

        it("should warn if no files match the filter", () => {
            readdirSyncStub.returns(["a.js", "b.css"]);
            statSyncStub.callsFake(filePath => ({ isFile: () => true }));

            operations.moveFiles(filter, testDir, destDir);

            expect(copySyncStub.called).to.be.false;
            expect(unlinkSyncStub.called).to.be.false;
            expect(logStub.warn.calledWith(`[Move Ignored] No files found with '${filter}' for '${path}'`)).to.be.true;
        });
    });

    describe("copyFiles", () => {
        const testDir = "/source";
        const destDir = "/dest";
        const filter = ".*\\.txt$";

        let existsSyncStub: sinon.SinonStub;
        let readdirSyncStub: sinon.SinonStub;
        let statSyncStub: sinon.SinonStub;
        let copySyncStub: sinon.SinonStub;
        let ensureDirSyncStub: sinon.SinonStub;

        beforeEach(() => {
            existsSyncStub = sinon.stub(io, "existsSync").returns(true);
            readdirSyncStub = sinon.stub(io, "readdirSync");
            statSyncStub = sinon.stub(io, "statSync");
            copySyncStub = sinon.stub(io, "copySync");
            ensureDirSyncStub = sinon.stub(io, "ensureDirSync");
        });

        afterEach(() => {
            sinon.restore();
        });

        it("should copy files matching the filter", () => {
            const files = ["file1.txt", "file2.txt", "file3.js"];
            readdirSyncStub.returns(files);
            statSyncStub.callsFake(filePath => ({ isFile: () => !filePath.endsWith(".js") }));

            operations.copyFiles(filter, testDir, destDir);

            expect(copySyncStub.calledTwice).to.be.true;
            expect(logStub.info.calledWith(`[Copy] 'file1.txt' to '${destDir}'`)).to.be.true;
            expect(logStub.info.calledWith(`[Copy] 'file2.txt' to '${destDir}'`)).to.be.true;
        });

        it("should warn if no files match the filter", () => {
            readdirSyncStub.returns(["a.js", "b.css"]);
            statSyncStub.callsFake(filePath => ({ isFile: () => true }));

            operations.copyFiles(filter, testDir, destDir);

            expect(copySyncStub.called).to.be.false;
            expect(logStub.warn.calledWith(`[Copy Ignored] No files found with '${filter}' for '${path}'`)).to.be.true;
        });
    });
});

#! /usr/bin/env node
import { PackagePacker } from "./packagePacker";
import * as yargs from "yargs";

async function main() {
    yargs(process.argv.slice(2));
    yargs.strict(false);

    yargs.version(false);
    yargs.usage("Usage: packageBundler [options]").wrap(0);

    // Id
    yargs.option("i", { alias: "input", type: "string", default: "", description: "Location of the package to pack", required: true });
    yargs.option("o", { alias: "output", type: "string", default: "", description: "Location of the generated package will be stored", required: true });
    yargs.option("t", { alias: "temp", type: "string", default: "", description: "Temporary location to use (default: ${source}\\_TEMP_)", required: false });
    yargs.option("c", { alias: "config", type: "string", default: "", description: "Location of the Configuration to use (default: ${source}/packConfig.json)", required: false });
    yargs.option("a", { alias: "addons", type: "string", default: "", description: "Location of the compiled addons", required: false });
    yargs.option("d", { alias: "debug", type: "boolean", default: false, description: "Debug Mode (doesn't delete temporary directory after processing)", required: false });
    yargs.option("v", { alias: "version", type: "string", default: "", description: "Version to use to generate the package", required: false });

    yargs.help("h").alias("h", "help");

    if (yargs.argv) {
        const generator = new PackagePacker();
        await generator.go(yargs.argv);
    }
}

main()
    .then()
    .catch((error) => {
        console.error("\x1b[31m", error.message, "\x1b[0m");
        console.error("");
        console.error("\x1b[31m", "** Failure **", "\x1b[0m");
        process.exit(1);
    });

process.on("uncaughtException", (error: Error) => {
    console.error(error);
    process.exit(1);
});

process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
    console.error(reason);
    process.exit(1);
});

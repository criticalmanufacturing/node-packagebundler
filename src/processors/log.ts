import { injectable } from "inversify";

@injectable()
export class Log {
    public debug(text: string): void {
        console.debug("\x1b[34m", text, "\x1b[0m");
    }

    public error(text: string): void {
        console.error("\x1b[31m", text, "\x1b[0m");
    }

    public info(text: string): void {
        console.log("\x1b[37m", text, "\x1b[0m");
    }

    public warn(text: string): void {
        console.warn("\x1b[33m", text, "\x1b[0m");
    }

    public success(text: string): void {
        console.log("\x1b[32m", text, "\x1b[0m");
    }

    public notice(text: string): void {
        console.log("\x1b[36m", text, "\x1b[0m");
    }
}
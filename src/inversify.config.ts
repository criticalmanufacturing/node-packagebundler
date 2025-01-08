import "reflect-metadata";
import { Container } from "inversify";
import { TYPES } from "./types";
import { Log } from "./processors/log";
import { Operations } from "./processors/operations";
import { Paths } from "./processors/paths";
import { DriverTemplatesProcessor } from "./processors/driverTemplates";
import { LibraryTemplatesProcessor } from "./processors/libraryTemplates";
import { BusinessScenariosProcessor } from "./processors/businessScenarios";
import { LibraryFontProcessor } from "./processors/libraryFont";
import { ShrinkwrapGenerator } from "./processors/shrinkwrapGenerator";
import { Transpiler } from "./processors/transpiler";


const container = new Container();
container.bind<Container>(TYPES.Injector).toConstantValue(container);

container.bind<Log>(TYPES.Logger).to(Log).inSingletonScope();
container.bind<Operations>(TYPES.Operations).to(Operations).inSingletonScope();
container.bind<Paths>(TYPES.Paths).to(Paths).inSingletonScope();
container.bind<Transpiler>(TYPES.Transpiler).to(Transpiler).inSingletonScope();

container.bind<DriverTemplatesProcessor>(TYPES.Processors.DriverTemplates).to(DriverTemplatesProcessor).inSingletonScope();
container.bind<LibraryTemplatesProcessor>(TYPES.Processors.LibraryTemplates).to(LibraryTemplatesProcessor).inSingletonScope();
container.bind<BusinessScenariosProcessor>(TYPES.Processors.LibraryBusinessScenarios).to(BusinessScenariosProcessor).inSingletonScope();
container.bind<LibraryFontProcessor>(TYPES.Processors.LibraryFontProcessor).to(LibraryFontProcessor).inSingletonScope();
container.bind<ShrinkwrapGenerator>(TYPES.Processors.ShrinkwrapGenerator).to(ShrinkwrapGenerator).inSingletonScope();

export { container };

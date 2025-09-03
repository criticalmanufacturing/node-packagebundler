# IoT Package Bundler

It is not desirable to have Internet services (NPM, GitHub, etc) as a dependency for the packages that would run on a production environment.

To bypass such dependency, we provide a tool that will pack all the package dependencies from a development environment into a ready-to-be-used package.

The steps this tool executes in background are somehow complicated, but, in a nutshell, it will statically analyze all the dependencies of the package and subsequent dependencies and merge everything into a single `index.js` file. Some other dependencies, like configurations, certificates, node addons (*.node) are also added into the resulting package, however, to keep everything in a clean state, some post-processing steps are needed and this tool supports them up to some extent.

In a terminal window run:

```
yo @criticalmanufacturing/iot:packagePacker --help
```

The following parameters can be supplied:

| **Parameter** | Type      | Default                  | Description                                                  |
| ------------- | --------- | ------------------------ | ------------------------------------------------------------ |
| i, input      | `String`  | `${cwd}`                 | Location of the package to pack (directory where the `package.json` is located) |
| o, output     | `String`  |                          | (optional) When defined, it is the directory where the `.tgz` package file will be placed |
| t, temp       | `String`  | `${cwd}\__TEMP__`        | Temporary directory where the processed files will be placed |
| c, config     | `String`  | `${cwd}\packConfig.json` | Location where the file with the post-processing instructions is located |
| a, addons     | `String`  |                          | Location where the binary addons (`\*.node`) are located. Required to prepare a package that is cross-platform, cross-architecture and supporting multiple Node versions.<br />**Note**: Due to the complexity of this option, the usage is not described in this documentation and requires some support from our company |
| d, debug      | `Boolean` | `false`                  | Activate the debug mode. This mode will not delete the temporary directory allowing the user to properly define the post-processing directives |
| v, version    | `String`  |                          | Flag that allows to override the version defined in the `package.json` into an user-defined value |

### Configuration file structure

The configuration is a .json file that identifies the type of package and declare post-packing actions to perform to organize, clean and possibly, fix some issues with the result structure.

```json
{
    "type": "<Package Type>",
    "postActions": [
        { "type": "<ActionType>", "parameter1": "value1", "parameter2": "value2", "...": "..." },
        { "type": "<ActionType>", "parameter1": "value1", "parameter2": "value2", "...": "..." }
    ]
}
```

Possible Package Types:

| Type           | Description                                                  |
| -------------- | ------------------------------------------------------------ |
| `TasksPackage` | Represents a package used to contain `Tasks` and `Converters`. The result package will be ready for runtime (no internet dependencies) and for design-time (all `.js`, `.html`, `.css`, etc) required by the GUI but not required for the runtime. |
| `Component`    | Represents a package that is only used for runtime (driver, etc) |

Possible Post Actions:

| Structure                                                    | Description                                                  | Example                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| `DeleteFile`(`source`)                                       | Deletes the file `source`                                    | ```{ "type": "DeleteFile", "source": "${Temp}/completion.sh.hbs" }``` |
| `DeleteFiles`(`filter`, `source`)                            | Delete files based on a regular expression `filter` at `source`            | ```{ "type": "DeleteFiles", "filter": "\\d+\\.index\\.js", "source": "${Temp}/libs" }``` |
| `DeleteDirectory`(`source`)                                  | Deletes the directory `source`                               | ```{ "type": "DeleteDirectory", "source": "${Temp}/locales" }``` |
| `CopyDirectory`(`source`, `destination`)                     | Copies the entire directory structure from `source` into `destination` | ```{ "type": "CopyDirectory", "source": "font", "destination": "${Temp}/font" }``` |
| `CopyFile`(`file`, `source`, `destination`)                  | Copy the file `file` located in the directory `source` into the directory `destination` | ```{ "type": "CopyFile", "source": "${Source}/certificates/default.pem", "destination": "${Temp}/examples" }``` |
| `CopyFiles`(`filter`, `source`, `destination`)                  | Copy files based on a regular expression `filter` from `source` to `destination` | ```{ "type": "CopyFiles", "filter": "\\d+\\.index\\.js", "source": "${Source}/certificates", "destination": "${Temp}/examples" }``` |
| `MoveFile`(`file`, `source`, `destination`)                  | Moves the file `file` located in the directory `source` into the directory `destination` | ```{ "type": "MoveFile", "file": "client_selfsigned_cert_2048.pem", "source": "${Temp}", "destination": "${Temp}/certificates" }``` |
| `MoveFiles`(`filter`, `source`, `destination`)                  | Move files based on a regular expression `filter` from `source` to  `destination`| ```{ "type": "MoveFiles", "filter": "\\d+\\.index\\.js", "source": "${Temp}", "destination": "${Temp}/certificates" }``` |
| `ReplaceText`(`source`, `search`, `replace`, `isRegularExpression`) | In the file `source`, tried to find all occurrences of `search` and replaces them with `replace`. If `isRegularExpression` the search is expected to be a valid regular expression.<br />*Note: Make sure the `replaced` value is not captured again by the `search` value, otherwise, the process will enter into an infinite loop.* | ```{ "type": "ReplaceText", "source": "${Temp}/index.js", "search":"\"client_selfsigned_cert_2048.pem\"", "replace": "\"/../certificates/client_selfsigned_cert_2048.pem\"" }```<br />`{ "type": "ReplaceText", "source": "${Temp}/index.js", "search":"__webpack_require__\\(\\d*\\)\\('HID-hidraw.node'\\)", "replace": "require(__webpack_require__.ab + \"/../lib/hid-hidraw.node\")", "isRegularExpression": true }` |

Some tokens can be used in the Post Actions to be replaced according to the environment/command line arguments:

| Token            | Description                                   |
| ---------------- | --------------------------------------------- |
| `${Source}`      | Source location (argument `i`, `input`)       |
| `${Destination}` | Destination location (argument `o`, `output`) |
| `${Temp}`        | Temporary location (argument `t`, `temp`)     |
| `${Addons}`      | Addons location (argument `a`, `addons`)      |

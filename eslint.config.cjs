const eslint = require("@eslint/js");
const tseslint = require("typescript-eslint");
const eslintPluginPrettierRecommended = require("eslint-plugin-prettier/recommended");
const importsPlugin = require("eslint-plugin-import");
const globals = require("globals");

module.exports = tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
        plugins: {
            import: importsPlugin,
        },
        ignores: ["eslint.config.cjs"],
        languageOptions: {
            ecmaVersion: 2019, // Allows for the parsing of modern ECMAScript features
            sourceType: "module", // Allows for the use of imports
            globals: {
                ...globals.node,
                ...globals.es6,
            },
            parserOptions: {
                project: true,
                tsconfigRootDir: __dirname,
            },
        },
        linterOptions: {
            reportUnusedDisableDirectives: "error",
        },
        rules: {
            // Place to specify ESLint rules. Can be used to overwrite rules specified from the extended configs
            // e.g. "@typescript-eslint/explicit-function-return-type": "off",
            quotes: ["error", "double", { avoidEscape: true, allowTemplateLiterals: false }],
            eqeqeq: ["error", "smart"],
            "no-unused-vars": [
                "error",
                {
                    vars: "all",
                    args: "after-used",
                    ignoreRestSiblings: false,
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                },
            ],
            "require-atomic-updates": "off", // many false positives, boring for nonsense
            // these are don't work with TS and TS already checks imports
            "import/default": "off",
            "import/no-unresolved": "off",
            "import/named": "off",
            // boring
            "import/no-named-as-default": "off",
            "import/no-duplicates": "warn",
            "import/no-extraneous-dependencies": "warn",
            "import/order": ["warn", { "newlines-between": "always" }],
            "import/newline-after-import": "warn",
        },
    },
    {
        files: ["src/**/*.ts"],
        rules: {
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": [
                "warn",
                {
                    vars: "all",
                    args: "after-used",
                    ignoreRestSiblings: true,
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                },
            ],
            "@typescript-eslint/explicit-function-return-type": "off",
            "@typescript-eslint/no-non-null-assertion": "off",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/restrict-template-expressions": "off", // too jumpy
            "@typescript-eslint/no-misused-promises": "off", // too jumpy
            "@typescript-eslint/no-floating-promises": "off", // jumpy; would be nice to turn on, but we have a lot of these
            "@typescript-eslint/unbound-method": "off", // jumpy, given how vscode's API binds this. Would be good to remove.

            // This codebase interacts with `any` a lot, so for now, all no-unsafe-* we violate are currently disabled
            "@typescript-eslint/no-unsafe-argument": "off",
            "@typescript-eslint/no-unsafe-member-access": "off",
        },
    },
    {
        files: ["src/test/**/*.ts"],
        rules: {
            // Good for production code to avoid unsafe type leaks, potentially very frustrating and of little value for tests
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unsafe-return": "off",
        },
    },
    {
        files: ["src/test/**/*.test.ts"],
        languageOptions: {
            globals: {
                ...globals.mocha,
            },
        },
    },
    // Must be the last configuration item per project README
    eslintPluginPrettierRecommended,
);

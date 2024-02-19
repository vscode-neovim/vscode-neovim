module.exports = {
    parser: "@typescript-eslint/parser", // Specifies the ESLint parser
    extends: ["eslint:recommended", "plugin:prettier/recommended"],
    plugins: ["import"],
    parserOptions: {
        ecmaVersion: 2019, // Allows for the parsing of modern ECMAScript features
        sourceType: "module", // Allows for the use of imports
    },
    env: {
        node: true,
        jest: true,
        es6: true,
    },
    rules: {
        // Place to specify ESLint rules. Can be used to overwrite rules specified from the extended configs
        // e.g. "@typescript-eslint/explicit-function-return-type": "off",
        quotes: ["error", "double", { avoidEscape: true, allowTemplateLiterals: false }],
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
        // "import/no-unresolved": "error",
        "import/no-duplicates": "warn",
        "import/no-extraneous-dependencies": "warn",
        "import/order": ["warn", { "newlines-between": "always" }],
        "import/newline-after-import": "warn",
    },
    overrides: [
        {
            files: ["*.ts", "*.tsx"],
            extends: [
                "plugin:@typescript-eslint/eslint-recommended",
                "plugin:@typescript-eslint/recommended", // Uses the recommended rules from @typescript-eslint/eslint-plugin
                "prettier",
                "plugin:import/typescript",
            ],
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
            },
            overrides: [
                {
                    files: ["*.spec.ts", "*.test.ts"],
                    rules: {
                        "@typescript-eslint/no-explicit-any": "off",
                        "@typescript-eslint/no-non-null-assertion": "off",
                        "require-atomic-updates": "off",
                    },
                },
            ],
        },
    ],
};

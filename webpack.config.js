const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

module.exports = {
    mode: 'production',
    entry: './src/extension.ts',
    output: {
        filename: 'extension.js',
        path: path.resolve(__dirname, 'dist'),
        libraryTarget: 'commonjs2',
    },
    resolve: {
        extensions: ['.ts', '.js'],
        fallback: {
            "child_process": false,
        },
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    externals: {
        vscode: 'commonjs vscode',
        "child_process": 'commonjs child_process'
    },
    plugins: [
        new CleanWebpackPlugin(),
    ],
};
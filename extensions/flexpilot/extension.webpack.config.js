/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

const withDefaults = require('../shared.webpack.config');

module.exports = withDefaults({
	context: __dirname,
	entry: {
		extension: './src/extension.ts',
	},
	resolve: {
		fallback: {
			bufferutil: false,
			'utf-8-validate': false,
			fs: false,
			path: require.resolve('path-browserify'),
			os: require.resolve('os-browserify')
		}
	},
	
	unknownContextRegExp: /$^/,
	unknownContextCritical: false,
	exprContextRegExp: /$^/,
	exprContextCritical: false,
	wrappedContextRegExp: /$^/,
	wrappedContextCritical: false,
	optimization: {
		minimize: false,
		moduleIds: 'named',
		chunkIds: 'named',
		mangleExports: false
	},
	stats: {
		errorDetails: true
	},
	performance: {
		hints: false
	}
});

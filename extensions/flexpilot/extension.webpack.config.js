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
			'utf-8-validate': false
		}
	},
	ignoreWarnings: [
		{
			message: /the request of a dependency is an expression/
		},
		{
			message: /require function is used in a way in which dependencies cannot be statically extracted/
		}
	]
});

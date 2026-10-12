import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/extension.ts'],
	format: ['cjs'],
	platform: 'node',
	outDir: 'dist',
	sourcemap: true,
	clean: true,
	external: ['vscode'],
	noExternal: ['lodash'],
	treeshake: true
});

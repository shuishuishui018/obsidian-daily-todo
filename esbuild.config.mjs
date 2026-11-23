import esbuild from 'esbuild'
import process from 'node:process'

const prod = process.argv[2] === 'production'

const ctx = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*'],
  format: 'cjs',
  target: 'es2018',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
  // 不做压缩：目录审核需要可读产物
  minify: false,
})

if (prod) {
  await ctx.rebuild()
  await ctx.dispose()
  console.log('built -> main.js')
} else {
  await ctx.watch()
}

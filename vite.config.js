import { defineConfig } from 'vite';

// Inline the bundled JS and CSS into dist/index.html so the build is a single
// file that also works when opened straight from disk (file://), where
// browsers block separate module scripts.
function singleFile() {
  return {
    name: 'single-file',
    enforce: 'post',
    generateBundle(_, bundle) {
      const html = Object.values(bundle).find((f) => f.fileName === 'index.html');
      if (!html) return;
      let src = html.source;
      for (const [name, f] of Object.entries(bundle)) {
        if (name.endsWith('.css')) {
          src = src.replace(new RegExp(`<link[^>]+href="[^"]*${name.split('/').pop()}"[^>]*>`), () => `<style>${f.source}</style>`);
          delete bundle[name];
        } else if (name.endsWith('.js')) {
          const code = f.code.replace(/<\/script/gi, '<\\/script');
          src = src.replace(new RegExp(`<script[^>]+src="[^"]*${name.split('/').pop()}"[^>]*></script>`), () => `<script type="module">${code}</script>`);
          delete bundle[name];
        }
      }
      // module scripts in <head> run after parsing anyway; move to body end for clarity
      html.source = src;
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [singleFile()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 4000,
    modulePreload: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  server: { port: 5173 },
});

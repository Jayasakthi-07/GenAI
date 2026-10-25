import { createRequire } from 'node:module';
import { Font } from '@react-pdf/renderer';

const require = createRequire(import.meta.url);
let registered = false;

/** Registers the bundled Inter font once. Nothing is fetched from the network. */
export function registerPdfFonts() {
  if (registered) return;
  const file = (weight: number) =>
    require.resolve(`@fontsource/inter/files/inter-latin-${weight}-normal.woff`);
  Font.register({
    family: 'Inter',
    fonts: [
      { src: file(400), fontWeight: 400 },
      { src: file(600), fontWeight: 600 },
      { src: file(700), fontWeight: 700 },
    ],
  });
  // Keep SKUs and product names whole instead of hyphenating them.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

import {copyFileSync,mkdirSync} from 'node:fs';
mkdirSync(new URL('../public/',import.meta.url),{recursive:true});
copyFileSync(new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs',import.meta.url),new URL('../public/pdf.worker.min.mjs',import.meta.url));

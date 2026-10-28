import { transformSync } from 'esbuild';

// Offline reconstruction of the attached report, NOT a production sanitizer.
// A regular expression is not a JavaScript lexer: always check the parsed form
// as well as the exact observed hash before treating this candidate as benign.
export function reconstructCommentNormalization(source) {
  const candidate = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.includes('\n') ? '\n' : ' ')
    .replace(/\/\/[^\r\n]*/g, '');
  const parsedForm = (code) => transformSync(code, { target: 'es2020', charset: 'ascii',
    legalComments: 'none', minifyWhitespace: true, minifyIdentifiers: false, minifySyntax: false,
    logLevel: 'silent' }).code;
  let parsedFormMatchesOriginal = false;
  try { parsedFormMatchesOriginal = parsedForm(source) === parsedForm(candidate); }
  catch { /* A failed parse is evidence against this candidate; never execute it. */ }
  return { source: candidate, parsedFormMatchesOriginal };
}

// Also used for CSS in this particular snapshot; no claim about arbitrary CSS.
export function reconstructBlockComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.includes('\n') ? '\n' : ' ');
}

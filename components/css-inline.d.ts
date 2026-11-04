// A stylesheet imported with «?inline» arrives as its text, for the page to place itself (see theme-styles.ts).
declare module '*.css?inline' { const css: string; export default css; }

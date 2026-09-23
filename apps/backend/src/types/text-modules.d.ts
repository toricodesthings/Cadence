/** Markdown files import as their text: wrangler `rules` (Text) in the worker, the md-text plugin in vitest. */
declare module "*.md" {
    const text: string;
    export default text;
}

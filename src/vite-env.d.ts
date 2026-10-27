/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
declare module '*.sql?raw' {
  const sql: string;
  export default sql;
}

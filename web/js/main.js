import { App } from "./app.js";

const app = new App();
window.__app = app; // dev/debug hook
app.start();

// Helpful console breadcrumb
console.info("Project Tower Defense — web native prototype. No frameworks, no asset packs.");

import { createServer } from "./server/server";

const port = Number(process.env.PORT ?? 8787);
createServer().listen(port, "0.0.0.0", () => console.log(`api listening on :${port}`));

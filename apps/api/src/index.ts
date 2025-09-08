// apps/api/api/index.ts
import serverless from "serverless-http";
import app from "../src/app";

const handler = serverless(app);

// Don't import VercelRequest/VercelResponse
export default function (req: any, res: any) {
  return handler(req, res);
}

import serverless from "serverless-http";
import app from "../src/app";

const handler = serverless(app);
export default function (req: any, res: any) {
  return handler(req, res);
}

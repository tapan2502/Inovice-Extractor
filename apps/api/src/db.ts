import { MongoClient, GridFSBucket } from "mongodb";

const uri = process.env.MONGODB_URI!;
export const client = new MongoClient(uri);
export const dbPromise = client.connect().then(c => c.db());
export const filesBucketPromise = dbPromise.then(db => new GridFSBucket(db, { bucketName: "files" }));
export const invoicesCollPromise = dbPromise.then(db => db.collection("invoices"));

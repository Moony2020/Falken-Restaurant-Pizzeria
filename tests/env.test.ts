import { test } from "node:test";
import assert from "node:assert/strict";
import { getEnv } from "../src/server/env.ts";

test("accepts a valid Atlas URI and defaults the database name", () => {
  const env = getEnv({ MONGODB_URI: "mongodb+srv://user:pw@cluster.example.mongodb.net/" });
  assert.equal(env.MONGODB_DB, "falken");
});

test("rejects a missing URI", () => {
  assert.throws(() => getEnv({}), /MONGODB_URI/);
});

test("rejects the placeholder template from .env.example", () => {
  assert.throws(
    () => getEnv({ MONGODB_URI: "mongodb+srv://<db_username>:<db_password>@falken-cluster.36wp72b.mongodb.net/" }),
    /placeholder/,
  );
});

test("rejects non-mongodb schemes", () => {
  assert.throws(() => getEnv({ MONGODB_URI: "postgres://u:p@host/db" }), /mongodb/);
});

test("error messages never echo the connection string or password", () => {
  const secret = "S3cretPassw0rd";
  try {
    getEnv({ MONGODB_URI: `http://admin:${secret}@host/db` });
    assert.fail("should have thrown");
  } catch (err) {
    assert.ok(err instanceof Error);
    assert.ok(!err.message.includes(secret));
    assert.ok(!err.message.includes("admin"));
  }
});

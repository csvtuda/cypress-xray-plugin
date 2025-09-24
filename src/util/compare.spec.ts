import assert from "node:assert";
import { relative } from "node:path";
import { cwd } from "node:process";
import { describe, it } from "node:test";
import { contains } from "./compare";

void describe(relative(cwd(), __filename), () => {
    void describe(contains.name, () => {
        void describe("primitive types", () => {
            void it("bigint", () => {
                assert.strictEqual(contains(BigInt(200), BigInt(200)), true);
            });
            void it("bigint (negative)", () => {
                assert.strictEqual(contains(BigInt(200), BigInt(500)), false);
            });
            void it("boolean", () => {
                assert.strictEqual(contains(true, true), true);
            });
            void it("boolean (negative)", () => {
                assert.strictEqual(contains(true, false), false);
            });
            void it("function", () => {
                assert.strictEqual(contains(console.log, console.log), true);
            });
            void it("function (negative)", () => {
                assert.strictEqual(contains(console.log, console.info), false);
            });
            void it("number", () => {
                assert.strictEqual(contains(42, 42), true);
            });
            void it("number (negative)", () => {
                assert.strictEqual(contains(42, 1000), false);
            });
            void it("string", () => {
                assert.strictEqual(contains("hello", "hello"), true);
            });
            void it("string (negative)", () => {
                assert.strictEqual(contains("hello", "bye"), false);
            });
            void it("symbol", () => {
                assert.strictEqual(contains(Symbol.for("abc"), Symbol.for("abc")), true);
            });
            void it("symbol (negative)", () => {
                assert.strictEqual(contains(Symbol.for("abc"), Symbol.for("def")), false);
            });
            void it("undefined", () => {
                assert.strictEqual(contains(undefined, undefined), true);
            });
            void it("undefined (negative)", () => {
                assert.strictEqual(contains(undefined, 42), false);
            });
        });

        void describe("arrays", () => {
            void it("equal", () => {
                assert.strictEqual(
                    contains([1, 2, 3, "hello", false], [1, 2, 3, "hello", false]),
                    true
                );
            });
            void it("partially equal", () => {
                assert.strictEqual(contains([1, 2, 3, "hello", false], [false, "hello", 3]), true);
            });
            void it("not equal", () => {
                assert.strictEqual(contains([1, 2, 3, "hello", false], [true, "bye", 17]), false);
            });
            void it("not equal and no array", () => {
                assert.strictEqual(contains(null, [1, 2, 3]), false);
            });
        });

        void describe("objects", () => {
            void it("equal", () => {
                assert.strictEqual(
                    contains({ a: "b", c: 5, d: false }, { a: "b", c: 5, d: false }),
                    true
                );
            });
            void it("partially equal", () => {
                assert.strictEqual(contains({ a: "b", c: 5, d: false }, { c: 5, d: false }), true);
            });
            void it("not equal", () => {
                assert.strictEqual(
                    contains({ a: "b", c: 5, d: false }, { [5]: "oh no", x: "y" }),
                    false
                );
            });
        });

        void describe("complex", () => {
            void it("partially equal", () => {
                assert.strictEqual(
                    contains(
                        {
                            a: "b",
                            c: 5,
                            d: [
                                { e: 42, f: 100, g: "hi", h: [32, 1052] },
                                null,
                                { x: [17, { y: null, z: "bonjour" }] },
                            ],
                        },
                        {
                            c: 5,
                            d: [{ g: "hi", h: [1052] }, { x: [{ z: "bonjour" }] }],
                        }
                    ),
                    true
                );
            });
        });
    });
});

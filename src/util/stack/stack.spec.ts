import assert from "node:assert";
import { relative } from "node:path";
import { cwd } from "node:process";
import { beforeEach, describe, it } from "node:test";
import { Stack } from "./stack";

void describe(relative(cwd(), __filename), () => {
    let stack = new Stack<number>();

    beforeEach(() => {
        stack = new Stack<number>();
    });

    void describe(stack.push.name, () => {
        void it("pushes elements", () => {
            stack.push(10);
            assert.strictEqual(stack.top(), 10);
            stack.push(15);
            assert.strictEqual(stack.top(), 15);
        });
    });

    void describe(stack.pop.name, () => {
        void it("pops elements", () => {
            stack.push(0).push(1).push(2).push(3).push(4);
            assert.strictEqual(stack.pop(), 4);
            assert.strictEqual(stack.pop(), 3);
            assert.strictEqual(stack.pop(), 2);
            assert.strictEqual(stack.pop(), 1);
            assert.strictEqual(stack.pop(), 0);
        });

        void it("throws if the stack is empty", () => {
            assert.throws(() => stack.pop(), { message: "Stack is empty" });
        });
    });

    void describe(stack.top.name, () => {
        void it("returns the top element", () => {
            stack.push(0);
            assert.strictEqual(stack.top(), 0);
            stack.push(1);
            assert.strictEqual(stack.top(), 1);
            stack.push(2);
            assert.strictEqual(stack.top(), 2);
        });

        void it("throws if the stack is empty", () => {
            assert.throws(() => stack.top(), { message: "Stack is empty" });
        });
    });

    void describe(stack.size.name, () => {
        void it("computes the size", () => {
            assert.strictEqual(stack.size(), 0);
            stack.push(0);
            assert.strictEqual(stack.size(), 1);
            stack.push(1);
            assert.strictEqual(stack.size(), 2);
            stack.pop();
            assert.strictEqual(stack.size(), 1);
            stack.pop();
            assert.strictEqual(stack.size(), 0);
        });
    });

    void describe(stack.has.name, () => {
        void it("finds elements", () => {
            stack.push(0).push(1).push(2).push(3).push(4);
            assert.strictEqual(stack.has(0), true);
            assert.strictEqual(stack.has(1), true);
            assert.strictEqual(stack.has(2), true);
            assert.strictEqual(stack.has(3), true);
            assert.strictEqual(stack.has(4), true);
        });

        void it("does not find nonexistent elements", () => {
            stack.push(0).push(1).push(2);
            assert.strictEqual(stack.has(4), false);
        });
    });

    void describe(stack.isEmpty.name, () => {
        void it("computes the emptiness", () => {
            assert.strictEqual(stack.isEmpty(), true);
            stack.push(0);
            assert.strictEqual(stack.isEmpty(), false);
            stack.push(1);
            assert.strictEqual(stack.isEmpty(), false);
            stack.pop();
            assert.strictEqual(stack.isEmpty(), false);
            stack.pop();
            assert.strictEqual(stack.isEmpty(), true);
        });
    });
});

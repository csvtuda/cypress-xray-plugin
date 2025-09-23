import assert from "node:assert";
import { relative } from "node:path";
import { cwd } from "node:process";
import { beforeEach, describe, it } from "node:test";
import { SimpleDirectedEdge, SimpleDirectedGraph } from "./graph";

void describe(relative(cwd(), __filename), () => {
    void describe(SimpleDirectedGraph.name, () => {
        let graph: SimpleDirectedGraph<number> = new SimpleDirectedGraph<number>();

        beforeEach(() => {
            graph = new SimpleDirectedGraph<number>();
            graph.place(0);
            graph.place(1);
            graph.place(2);
            graph.place(3);
            graph.place(4);
            graph.connect(0, 1);
            graph.connect(0, 2);
            graph.connect(0, 3);
            graph.connect(2, 4);
        });

        void describe(graph.place.name, () => {
            void it("adds vertices", () => {
                graph.place(7);
                assert.deepStrictEqual([...graph.getVertices()], [0, 1, 2, 3, 4, 7]);
            });

            void it("detects duplicates", () => {
                graph.place(5);
                assert.throws(
                    () => {
                        graph.place(5);
                    },
                    { message: "Duplicate vertex detected: 5" }
                );
            });
        });

        void describe(graph.connect.name, () => {
            void it("connects to existing vertices", () => {
                graph.place(5);
                graph.connect(0, 5);
                assert.deepStrictEqual(
                    [...graph.getOutgoing(0)],
                    [
                        new SimpleDirectedEdge(0, 1),
                        new SimpleDirectedEdge(0, 2),
                        new SimpleDirectedEdge(0, 3),
                        new SimpleDirectedEdge(0, 5),
                    ]
                );
            });

            void it("detects unknown source vertices", () => {
                assert.throws(
                    () => {
                        graph.connect(42, 0);
                    },
                    { message: "Failed to connect vertices: the source vertex does not exist" }
                );
            });

            void it("detects unknown destination vertices", () => {
                assert.throws(
                    () => {
                        graph.connect(0, 42);
                    },
                    { message: "Failed to connect vertices: the destination vertex does not exist" }
                );
            });

            void it("detects cycles", () => {
                assert.throws(
                    () => {
                        graph.connect(4, 2);
                    },
                    { message: "Failed to connect vertices 4 -> 2: cycle detected" }
                );
            });

            void it("detects duplicates", () => {
                graph.place(8);
                graph.connect(0, 8);
                assert.throws(
                    () => {
                        graph.connect(0, 8);
                    },
                    { message: "Failed to connect vertices 0 -> 8: duplicate edge detected" }
                );
            });

            void it("detects self loops", () => {
                assert.throws(
                    () => {
                        graph.connect(0, 0);
                    },
                    { message: "Failed to connect vertices 0 -> 0: cycle detected" }
                );
            });
        });

        void describe(graph.find.name, () => {
            void it("finds vertices", () => {
                assert.strictEqual(
                    graph.find((vertex: number) => vertex === 3),
                    3
                );
            });

            void it("does not find nonexistent vertices", () => {
                assert.strictEqual(
                    graph.find((vertex: number) => vertex === 6),
                    undefined
                );
            });
        });

        void describe(graph.getVertices.name, () => {
            void it("returns all vertices", () => {
                assert.deepStrictEqual([...graph.getVertices()], [0, 1, 2, 3, 4]);
            });
        });

        void describe(graph.getEdges.name, () => {
            void it("returns all edges", () => {
                assert.deepStrictEqual(
                    [...graph.getEdges()],
                    [
                        new SimpleDirectedEdge(0, 1),
                        new SimpleDirectedEdge(0, 2),
                        new SimpleDirectedEdge(0, 3),
                        new SimpleDirectedEdge(2, 4),
                    ]
                );
            });
        });

        void describe(graph.size.name, () => {
            void it("returns the vertex set cardinality", () => {
                assert.strictEqual(graph.size("vertices"), 5);
            });

            void it("returns the edge set cardinality", () => {
                assert.strictEqual(graph.size("edges"), 4);
            });
        });

        void describe(graph.getOutgoing.name, () => {
            void it("returns the outgoing edges of a vertex", () => {
                assert.deepStrictEqual(
                    [...graph.getOutgoing(0)],
                    [
                        new SimpleDirectedEdge(0, 1),
                        new SimpleDirectedEdge(0, 2),
                        new SimpleDirectedEdge(0, 3),
                    ]
                );
            });

            void it("returns empty arrays for leaf nodes", () => {
                assert.deepStrictEqual([...graph.getOutgoing(4)], []);
            });

            void it("throws for nonexistent nodes", () => {
                assert.throws(() => [...graph.getOutgoing(10)], { message: "Unknown vertex: 10" });
            });
        });

        void describe(graph.getIncoming.name, () => {
            void it("returns the incoming edges of a vertex", () => {
                assert.deepStrictEqual([...graph.getIncoming(3)], [new SimpleDirectedEdge(0, 3)]);
            });

            void it("returns empty arrays for root nodes", () => {
                assert.deepStrictEqual([...graph.getIncoming(0)], []);
            });

            void it("throws for nonexistent nodes", () => {
                assert.throws(() => [...graph.getIncoming(10)], { message: "Unknown vertex: 10" });
            });
        });

        void describe(graph.hasOutgoing.name, () => {
            void it("returns true for vertices with outgoing edges", () => {
                assert.strictEqual(graph.hasOutgoing(0), true);
            });

            void it("returns false for vertices without outgoing edges", () => {
                assert.strictEqual(graph.hasOutgoing(4), false);
            });

            void it("throws for nonexistent nodes", () => {
                assert.throws(() => graph.hasOutgoing(10), { message: "Unknown vertex: 10" });
            });
        });

        void describe(graph.hasIncoming.name, () => {
            void it("returns true for vertices with incoming edges", () => {
                assert.strictEqual(graph.hasIncoming(1), true);
            });

            void it("returns false for vertices without incoming edges", () => {
                assert.strictEqual(graph.hasIncoming(0), false);
            });

            void it("throws for nonexistent nodes", () => {
                assert.throws(() => graph.hasIncoming(10), { message: "Unknown vertex: 10" });
            });
        });
    });

    void describe("edge", () => {
        const edge = new SimpleDirectedEdge("abc", "def");

        void describe(edge.getSource.name, () => {
            void it("returns the source vertex", () => {
                assert.strictEqual(edge.getSource(), "abc");
            });
        });

        void describe(edge.getDestination.name, () => {
            void it("returns the destination vertex", () => {
                assert.strictEqual(edge.getDestination(), "def");
            });
        });
    });
});

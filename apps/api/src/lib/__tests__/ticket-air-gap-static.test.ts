import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { ticketContextSchema } from "../tickets/context.js";

/**
 * Static check of the air gap (privacy design, "Tools never take a person
 * id"): no chat-side function, method, tool schema or input type takes or
 * carries a person id. Chat side = the ticket reader, the turn planner and
 * the reference path.
 */

const CHAT_SIDE = ["../tickets/reader.ts", "../turn-planner.ts", "../reference-path.ts"];
/** Names that identify a person. Theme, ticket and conversation ids are fine. */
const PERSON_ID = /^(user|person|people|reviewer|subject|owner|manager|employee|counterpart|assignee|member|colleague|target|author)(Id|Ids|_id|_ids|Ref)?$|(user|person|reviewer|subject|owner|manager|employee|counterpart|assignee)_?ids?$/i;

function source(rel: string): ts.SourceFile {
  const path = fileURLToPath(new URL(rel, import.meta.url));
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
}

function nameOf(node: ts.Node): string | null {
  const n = (node as { name?: ts.Node }).name;
  if (!n) return null;
  if (ts.isIdentifier(n) || ts.isStringLiteral(n)) return n.text;
  return null;
}

/** Every parameter, interface/type member and object-literal property name in a file. */
function collectNames(sf: ts.SourceFile) {
  const params: string[] = [];
  const members: string[] = [];
  const props: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isParameter(node)) {
      if (ts.isIdentifier(node.name)) params.push(node.name.text);
      else if (ts.isObjectBindingPattern(node.name)) node.name.elements.forEach((e) => ts.isIdentifier(e.name) && params.push(e.name.text));
    }
    if (ts.isPropertySignature(node) || ts.isMethodSignature(node)) {
      const n = nameOf(node);
      if (n) members.push(n);
    }
    if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) {
      const n = nameOf(node);
      if (n) props.push(n);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { params, members, props };
}

describe("air gap: chat side never takes a person id", () => {
  it.each(CHAT_SIDE)("%s: no parameter, member or schema property names a person id", (rel) => {
    const { params, members, props } = collectNames(source(rel));
    expect(params.length + members.length).toBeGreaterThan(0);
    expect(params.filter((n) => PERSON_ID.test(n))).toEqual([]);
    expect(members.filter((n) => PERSON_ID.test(n))).toEqual([]);
    // Tool input schemas and messages are object literals: none carries a person id either.
    expect(props.filter((n) => PERSON_ID.test(n))).toEqual([]);
  });

  it("the reference path's tools take only a reference name", () => {
    const text = readFileSync(fileURLToPath(new URL("../reference-path.ts", import.meta.url)), "utf8");
    const schemas = [...text.matchAll(/inputSchema:\s*{[\s\S]*?properties:\s*{([^}]*)}/g)].map((m) => m[1]);
    expect(schemas.length).toBeGreaterThan(0);
    for (const s of schemas) expect([...s.matchAll(/(\w+):\s*{/g)].map((m) => m[1])).toEqual(["name"]);
  });

  it("the ticket context carries no person id", () => {
    const keys = Object.keys(ticketContextSchema.shape);
    expect(keys.filter((k) => PERSON_ID.test(k) || /id$/i.test(k))).toEqual([]);
    const theme = ticketContextSchema.shape.themes.element.unwrap().shape;
    expect(Object.keys(theme)).toEqual(["id", "intent", "dataGoal", "examplePhrasings"]);
  });

  it("the pattern would catch a person id", () => {
    for (const bad of ["userId", "reviewerId", "subjectId", "personId", "ownerId", "user_id", "subject_id", "managerIds"]) expect(PERSON_ID.test(bad)).toBe(true);
    for (const ok of ["ticketId", "conversationId", "themeId", "content", "name"]) expect(PERSON_ID.test(ok)).toBe(false);
  });

  it("the chat side does not import the database schema tables beyond the ticket reader", () => {
    for (const rel of ["../turn-planner.ts", "../reference-path.ts", "../bot-references.ts"]) {
      const text = readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
      expect(text).not.toMatch(/from "@revualy\/db"/);
      expect(text).not.toMatch(/drizzle-orm/);
    }
  });
});

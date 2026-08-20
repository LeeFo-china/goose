import { expect, test } from "bun:test";
import { createClient, type QueryData } from "@supabase/supabase-js";

import type { Database } from "./database";

type Assert<Condition extends true> = Condition;
type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
    (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;

const client = createClient<Database>("http://localhost", "contract-test-key");
const query = client
  .from("projects")
  .select("id,public_profile:douyin_project_public_profiles!inner(public_title)");

type PublicProfile = QueryData<typeof query>[number]["public_profile"];
type PublicProfileRelationship = Extract<
  Database["public"]["Tables"]["douyin_project_public_profiles"]["Relationships"][number],
  { foreignKeyName: "douyin_project_public_profiles_project_tenant_fkey" }
>;

type PublicProfileIsNotArray = Assert<
  PublicProfile extends readonly unknown[] ? false : true
>;
type PublicProfileHasTitle = Assert<
  PublicProfile extends { public_title: string } ? true : false
>;
type RelationshipColumnsAreAligned = Assert<
  Equal<PublicProfileRelationship["columns"], ["tenant_id", "project_id"]>
>;
type RelationshipReferencedColumnsAreAligned = Assert<
  Equal<PublicProfileRelationship["referencedColumns"], ["tenant_id", "id"]>
>;
type RelationshipIsOneToOne = Assert<
  Equal<PublicProfileRelationship["isOneToOne"], true>
>;

test("types a joined public project profile as one object", () => {
  const compileTimeContracts: [
    PublicProfileIsNotArray,
    PublicProfileHasTitle,
    RelationshipColumnsAreAligned,
    RelationshipReferencedColumnsAreAligned,
    RelationshipIsOneToOne,
  ] = [true, true, true, true, true];

  expect(compileTimeContracts).toEqual([true, true, true, true, true]);
});
